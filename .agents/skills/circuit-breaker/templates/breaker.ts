/**
 * Circuit Breaker Template
 *
 * API resilience pattern with automatic failure detection.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface BreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  resetTimeout: number;
  timeout?: number;
  isFailure?: (error: Error | Response) => boolean;
  onStateChange?: (state: CircuitState) => void;
}

export interface CircuitMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  rejects: number;
  lastFailureTime: number;
  failureRate: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private rejects = 0;
  private lastFailureTime = 0;
  private resetTimer?: number;
  private config: BreakerConfig;

  constructor(config: BreakerConfig) {
    this.config = config;
  }

  async fire<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      this.rejects++;
      if (fallback) {
        return await fallback();
      }
      throw new Error(`Circuit breaker is OPEN for ${this.config.name}`);
    }

    if (this.state === "half-open") {
      // Allow one test request
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      if (fallback) {
        return await fallback();
      }
      throw error;
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const timeout = this.config.timeout || 10000;
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeout),
      ),
    ]);
  }

  private onSuccess(): void {
    this.successes++;
    this.failures = 0;

    if (this.state === "half-open") {
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo("closed");
      }
    }
  }

  private onFailure(error: Error): void {
    const isFailure = this.config.isFailure
      ? this.config.isFailure(error)
      : true;

    if (!isFailure) return;

    this.failures++;
    this.lastFailureTime = Date.now();

    if (
      this.state === "half-open" ||
      this.failures >= this.config.failureThreshold
    ) {
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === "open") {
      // Schedule transition to half-open
      this.resetTimer = setTimeout(
        () => this.transitionTo("half-open"),
        this.config.resetTimeout,
      ) as unknown as number;
    } else if (newState === "closed") {
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
      }
      this.successes = 0;
    }

    if (this.config.onStateChange) {
      this.config.onStateChange(newState);
    }
  }

  getMetrics(): CircuitMetrics {
    const total = this.successes + this.failures + this.rejects;
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      rejects: this.rejects,
      lastFailureTime: this.lastFailureTime,
      failureRate: total > 0 ? this.failures / total : 0,
    };
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Circuit registry for managing multiple breakers
export class CircuitRegistry {
  private circuits: Map<string, CircuitBreaker> = new Map();

  register(name: string, config: BreakerConfig): CircuitBreaker {
    const breaker = new CircuitBreaker({ ...config, name });
    this.circuits.set(name, breaker);
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.circuits.get(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.circuits.values());
  }

  health(): Record<string, CircuitMetrics> {
    const health: Record<string, CircuitMetrics> = {};
    for (const [name, breaker] of this.circuits) {
      health[name] = breaker.getMetrics();
    }
    return health;
  }
}

// Bulkhead pattern for resource isolation
export class Bulkhead {
  private maxConcurrent: number;
  private maxQueue: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(config: { maxConcurrent: number; maxQueue: number }) {
    this.maxConcurrent = config.maxConcurrent;
    this.maxQueue = config.maxQueue;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        throw new Error("Bulkhead queue full");
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getMetrics(): { running: number; queued: number } {
    return { running: this.running, queued: this.queue.length };
  }
}
