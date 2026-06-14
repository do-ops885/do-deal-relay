// ============================================================================
// Error Sanitization Utilities
// ============================================================================

import { logger } from "./global-logger";

/**
 * Safe error conversion - never throws, always returns an Error instance.
 * Use in catch blocks where the caught value might not be an Error.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  if (error !== null && typeof error === "object") {
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error(String(error));
    }
  }
  return new Error(String(error));
}

/**
 * Sanitize error for client response - logs the real error internally
 * and returns a generic safe message to the client.
 *
 * For known AppError types, returns the userMessage.
 * For unknown errors, logs full details and returns a generic message.
 */
export function sanitizeErrorForClient(
  error: unknown,
  context?: { component?: string; handler?: string },
): { error: string; code?: string } {
  const err = toError(error);

  // Log the full error internally for debugging
  logger.error("Unhandled error", {
    component: context?.component || "unknown",
    handler: context?.handler,
    error_message: err.message,
    error_stack: err.stack,
  });

  return {
    error: "An unexpected error occurred",
  };
}

/**
 * Get a safe error message for client responses.
 * Logs the full error and returns a generic message.
 */
export function safeClientMessage(error: unknown): string {
  const err = toError(error);
  logger.error("Error exposed to client", {
    error_message: err.message,
  });
  return "An unexpected error occurred";
}
