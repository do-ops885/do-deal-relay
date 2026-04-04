import type { Env } from "../types";

// ============================================================================
// Circuit Breaker Pattern for External Service Calls
// ============================================================================

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number; // Failures before opening (default: 5)
  resetTimeoutMs: number; // Time before half-open (default: 30000)
  halfOpenMaxCalls: number; // Test calls in half-open (default: 3)
}

interface CircuitStateData {
  state: CircuitState;
  failures: number;
  lastFailureTime?: number;
  successesInHalfOpen: number;
  halfOpenCalls: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 3,
};

// ============================================================================
// Metrics Tracking
// ============================================================================

interface CircuitBreakerMetrics {
  stateChanges: number;
  lastStateChange?: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number; // Calls rejected due to open circuit
}

const metricsMap = new Map<string, CircuitBreakerMetrics>();

function getMetrics(name: string): CircuitBreakerMetrics {
  if (!metricsMap.has(name)) {
    metricsMap.set(name, {
      stateChanges: 0,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
    });
  }
  return metricsMap.get(name)!;
}

function recordStateChange(
  name: string,
  from: CircuitState,
  to: CircuitState,
): void {
  const metrics = getMetrics(name);
  metrics.stateChanges++;
  metrics.lastStateChange = `${from} → ${to} at ${new Date().toISOString()}`;
  console.log(`[CircuitBreaker:${name}] State changed: ${from} → ${to}`);
}

function recordCall(
  name: string,
  success: boolean,
  rejected: boolean = false,
): void {
  const metrics = getMetrics(name);
  metrics.totalCalls++;
  if (rejected) {
    metrics.rejectedCalls++;
  } else if (success) {
    metrics.successfulCalls++;
  } else {
    metrics.failedCalls++;
  }
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

export class CircuitBreaker {
  private options: CircuitBreakerOptions;
  private inMemoryState: CircuitStateData;

  constructor(
    private name: string,
    options: Partial<CircuitBreakerOptions> = {},
    private env?: Env,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.inMemoryState = {
      state: "closed",
      failures: 0,
      successesInHalfOpen: 0,
      halfOpenCalls: 0,
    };
  }

  /**
   * Get the KV key for this circuit breaker
   */
  private getKvKey(): string {
    return `circuit:${this.name}`;
  }

  /**
   * Load state from KV (with in-memory fallback)
   */
  private async loadState(): Promise<CircuitStateData> {
    if (!this.env) {
      return this.inMemoryState;
    }

    try {
      const stored = await this.env.DEALS_PROD.get<CircuitStateData>(
        this.getKvKey(),
        "json",
      );
      if (stored) {
        // Merge with in-memory to ensure we have all fields
        return {
          ...this.inMemoryState,
          ...stored,
        };
      }
    } catch (error) {
      console.error(
        `[CircuitBreaker:${this.name}] Failed to load state:`,
        error,
      );
    }

    return this.inMemoryState;
  }

  /**
   * Save state to KV
   */
  private async saveState(state: CircuitStateData): Promise<void> {
    this.inMemoryState = state;

    if (!this.env) {
      return;
    }

    try {
      await this.env.DEALS_PROD.put(this.getKvKey(), JSON.stringify(state));
    } catch (error) {
      console.error(
        `[CircuitBreaker:${this.name}] Failed to save state:`,
        error,
      );
    }
  }

  /**
   * Get current circuit state
   */
  async getState(): Promise<CircuitState> {
    const state = await this.loadState();
    return state.state;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.loadState();
    const now = Date.now();

    // Check if we should transition from open to half-open
    if (state.state === "open") {
      const timeSinceLastFailure = now - (state.lastFailureTime || 0);
      if (timeSinceLastFailure >= this.options.resetTimeoutMs) {
        const newState: CircuitStateData = {
          ...state,
          state: "half-open",
          successesInHalfOpen: 0,
          halfOpenCalls: 0,
        };
        await this.saveState(newState);
        recordStateChange(this.name, "open", "half-open");
      } else {
        // Circuit is open, reject the call
        recordCall(this.name, false, true);
        throw new CircuitBreakerOpenError(
          `Circuit breaker "${this.name}" is OPEN. ` +
            `Retry after ${Math.ceil((this.options.resetTimeoutMs - timeSinceLastFailure) / 1000)}s`,
        );
      }
    }

    // In half-open state, limit the number of test calls
    if (state.state === "half-open") {
      if (state.halfOpenCalls >= this.options.halfOpenMaxCalls) {
        recordCall(this.name, false, true);
        throw new CircuitBreakerOpenError(
          `Circuit breaker "${this.name}" is HALF-OPEN and max test calls reached`,
        );
      }
      state.halfOpenCalls++;
      await this.saveState(state);
    }

    // Execute the function
    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  async recordSuccess(): Promise<void> {
    const state = await this.loadState();

    if (state.state === "half-open") {
      const newSuccesses = state.successesInHalfOpen + 1;

      if (newSuccesses >= this.options.halfOpenMaxCalls) {
        // Transition to closed
        const newState: CircuitStateData = {
          state: "closed",
          failures: 0,
          successesInHalfOpen: 0,
          halfOpenCalls: 0,
        };
        await this.saveState(newState);
        recordStateChange(this.name, "half-open", "closed");
      } else {
        await this.saveState({
          ...state,
          successesInHalfOpen: newSuccesses,
        });
      }
    } else if (state.state === "closed") {
      // Reset failures on success in closed state
      if (state.failures > 0) {
        await this.saveState({
          ...state,
          failures: 0,
        });
      }
    }

    recordCall(this.name, true);
  }

  /**
   * Record a failed call
   */
  async recordFailure(): Promise<void> {
    const state = await this.loadState();
    const now = Date.now();

    if (state.state === "half-open") {
      // Any failure in half-open goes back to open
      const newState: CircuitStateData = {
        state: "open",
        failures: state.failures + 1,
        lastFailureTime: now,
        successesInHalfOpen: 0,
        halfOpenCalls: 0,
      };
      await this.saveState(newState);
      recordStateChange(this.name, "half-open", "open");
    } else if (state.state === "closed") {
      const newFailures = state.failures + 1;

      if (newFailures >= this.options.failureThreshold) {
        // Transition to open
        const newState: CircuitStateData = {
          state: "open",
          failures: newFailures,
          lastFailureTime: now,
          successesInHalfOpen: 0,
          halfOpenCalls: 0,
        };
        await this.saveState(newState);
        recordStateChange(this.name, "closed", "open");
      } else {
        await this.saveState({
          ...state,
          failures: newFailures,
          lastFailureTime: now,
        });
      }
    }

    recordCall(this.name, false);
  }

  /**
   * Get metrics for this circuit breaker
   */
  getMetrics(): CircuitBreakerMetrics {
    return getMetrics(this.name);
  }

  /**
   * Force reset the circuit breaker to closed state
   */
  async reset(): Promise<void> {
    const newState: CircuitStateData = {
      state: "closed",
      failures: 0,
      successesInHalfOpen: 0,
      halfOpenCalls: 0,
    };
    await this.saveState(newState);
    console.log(`[CircuitBreaker:${this.name}] Manually reset to closed`);
  }
}

// ============================================================================
// Circuit Breaker Error Class
// ============================================================================

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

// ============================================================================
// Pre-configured Circuit Breakers
// ============================================================================

// GitHub API circuit breaker
export function createGitHubCircuitBreaker(env?: Env): CircuitBreaker {
  return new CircuitBreaker(
    "github-api",
    {
      failureThreshold: 5,
      resetTimeoutMs: 30000, // 30 seconds
      halfOpenMaxCalls: 3,
    },
    env,
  );
}

// Telegram notification circuit breaker
export function createTelegramCircuitBreaker(env?: Env): CircuitBreaker {
  return new CircuitBreaker(
    "telegram",
    {
      failureThreshold: 3, // Lower threshold for notifications
      resetTimeoutMs: 60000, // 1 minute
      halfOpenMaxCalls: 2,
    },
    env,
  );
}

// Source discovery circuit breaker (per-domain)
const sourceCircuitBreakers = new Map<string, CircuitBreaker>();

export function getSourceCircuitBreaker(
  domain: string,
  env?: Env,
): CircuitBreaker {
  if (!sourceCircuitBreakers.has(domain)) {
    const cb = new CircuitBreaker(
      `source:${domain}`,
      {
        failureThreshold: 5,
        resetTimeoutMs: 300000, // 5 minutes for sources
        halfOpenMaxCalls: 2,
      },
      env,
    );
    sourceCircuitBreakers.set(domain, cb);
  }
  return sourceCircuitBreakers.get(domain)!;
}

// Clear all source circuit breakers (useful for testing)
export function clearSourceCircuitBreakers(): void {
  sourceCircuitBreakers.clear();
}

// ============================================================================
// Metrics Export
// ============================================================================

export function getAllCircuitBreakerMetrics(): Record<
  string,
  CircuitBreakerMetrics
> {
  const result: Record<string, CircuitBreakerMetrics> = {};
  for (const [name, metrics] of metricsMap.entries()) {
    result[name] = { ...metrics };
  }
  return result;
}

export function resetAllMetrics(): void {
  metricsMap.clear();
}

// ============================================================================
// Convenience Functions (for MCP and external consumers)
// ============================================================================

/**
 * Create a new circuit breaker with the given name and options
 */
export function createCircuitBreaker(
  name: string,
  options?: Partial<CircuitBreakerOptions>,
  env?: Env,
): CircuitBreaker {
  return new CircuitBreaker(name, options, env);
}

/**
 * Execute a function with circuit breaker protection
 */
export async function callWithCircuitBreaker<T>(
  circuitBreaker: CircuitBreaker,
  fn: () => Promise<T>,
): Promise<T> {
  return circuitBreaker.execute(fn);
}

/**
 * Get metrics for a circuit breaker
 */
export function getCircuitBreakerMetrics(
  circuitBreaker: CircuitBreaker,
): CircuitBreakerMetrics {
  return circuitBreaker.getMetrics();
}

/**
 * Reset a circuit breaker to closed state
 */
export async function resetCircuitBreaker(
  circuitBreaker: CircuitBreaker,
): Promise<void> {
  return circuitBreaker.reset();
}
