// ============================================================================
// Global Error Handler
// ============================================================================

import { logger } from "./global-logger";
import { PipelineError } from "../types";
import type { ErrorClass, PipelinePhase } from "../types";

interface ErrorContext {
  component?: string;
  run_id?: string;
  phase?: string;
  [key: string]: unknown;
}

interface ErrorResult {
  message: string;
  errorClass: ErrorClass | "SystemError";
  phase: string;
  retryable: boolean;
  originalError: Error;
}

/**
 * Classify and wrap an error into a structured ErrorResult
 */
export function classifyError(
  error: unknown,
  defaultPhase: PipelinePhase = "init",
): ErrorResult {
  if (error instanceof PipelineError) {
    return {
      message: error.message,
      errorClass: error.errorClass,
      phase: error.phase,
      retryable: error.retryable,
      originalError: error,
    };
  }

  const err = error instanceof Error ? error : new Error(String(error));

  return {
    message: err.message,
    errorClass: "SystemError",
    phase: defaultPhase,
    retryable: false,
    originalError: err,
  };
}

/**
 * Handle an error: classify, log, and return structured result
 */
export function handleError(
  error: unknown,
  context?: ErrorContext,
): ErrorResult {
  const classified = classifyError(
    error,
    (context?.phase as PipelinePhase) || "init",
  );

  logger.error(classified.message, {
    component: context?.component || "unknown",
    error_class: classified.errorClass,
    phase: classified.phase,
    retryable: classified.retryable,
    run_id: context?.run_id,
    ...context,
  });

  return classified;
}

/**
 * Wrap an async function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: ErrorContext,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const result = handleError(error, context);
    throw result.originalError;
  }
}

/**
 * Create a PipelineError from raw error
 */
export function toPipelineError(
  error: unknown,
  errorClass: ErrorClass,
  phase: PipelinePhase,
  retryable = false,
): PipelineError {
  const message = error instanceof Error ? error.message : String(error);
  return new PipelineError(errorClass, message, phase, retryable);
}
