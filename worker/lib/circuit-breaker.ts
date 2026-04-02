/**
 * Circuit Breaker - API Resilience Pattern
 * Prevents cascade failures and handles automatic recovery
 */

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  successes: number;
  lastFailureTime?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: Required<CircuitBreakerConfig>;

  constructor(
    private name: string,
    config: CircuitBreakerConfig = {},
  ) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 60000,
      halfOpenMaxCalls: config.halfOpenMaxCalls ?? 3,
    };
    this.state = {
      state: "closed",
      failures: 0,
      successes: 0,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === "open") {
      if (
        Date.now() - (this.state.lastFailureTime ?? 0) >
        this.config.resetTimeoutMs
      ) {
        this.state.state = "half-open";
        this.state.successes = 0;
      } else {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === "half-open") {
      this.state.successes++;
      if (this.state.successes >= this.config.halfOpenMaxCalls) {
        this.state.state = "closed";
        this.state.failures = 0;
        this.state.successes = 0;
      }
    } else {
      this.state.failures = 0;
    }
  }

  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (
      this.state.state === "half-open" ||
      this.state.failures >= this.config.failureThreshold
    ) {
      this.state.state = "open";
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

export function createCircuitBreaker(
  name: string,
  config?: CircuitBreakerConfig,
): CircuitBreaker {
  return new CircuitBreaker(name, config);
}
