import type { CircuitBreakerState } from "../types";

const circuitBreakerStates = new Map<string, CircuitBreakerState>();

export function isCircuitOpen(sourceName: string): boolean {
  const state = circuitBreakerStates.get(sourceName);
  if (!state) return false;

  if (state.state === "open") {
    if (Date.now() - state.lastFailureTime > 30000) {
      state.state = "half-open";
      state.successCount = 0;
      return false;
    }
    return true;
  }

  return false;
}

export function recordSuccess(sourceName: string): void {
  const state = circuitBreakerStates.get(sourceName);
  if (state && state.state === "half-open") {
    state.successCount++;
    if (state.successCount >= 3) {
      state.state = "closed";
      state.failures = 0;
    }
  }
}

export function recordFailure(sourceName: string): void {
  let state = circuitBreakerStates.get(sourceName);
  if (!state) {
    state = {
      failures: 0,
      lastFailureTime: 0,
      state: "closed",
      successCount: 0,
    };
    circuitBreakerStates.set(sourceName, state);
  }

  state.failures++;
  state.lastFailureTime = Date.now();

  if (state.failures >= 5) {
    state.state = "open";
  }
}
