import { logger } from "./global-logger";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerMetrics {
  stateChanges: number;
  lastStateChange?: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
}

const metricsMap = new Map<string, CircuitBreakerMetrics>();

export function getMetrics(name: string): CircuitBreakerMetrics {
  const existing = metricsMap.get(name);
  if (existing) return existing;
  const metrics: CircuitBreakerMetrics = {
    stateChanges: 0,
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    rejectedCalls: 0,
  };
  metricsMap.set(name, metrics);
  return metrics;
}

export function recordStateChange(
  name: string,
  from: CircuitState,
  to: CircuitState,
): void {
  const metrics = getMetrics(name);
  metrics.stateChanges++;
  metrics.lastStateChange = `${from} → ${to} at ${new Date().toISOString()}`;
  logger.info(`Circuit breaker "${name}" state changed: ${from} → ${to}`, {
    component: "circuit-breaker",
    name,
    from,
    to,
  });
}

export function recordCall(
  name: string,
  success: boolean,
  rejected = false,
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
