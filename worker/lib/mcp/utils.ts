/**
 * MCP Progress Notification Utilities
 *
 * Provides progress notifications for long-running MCP tool calls.
 *
 * @module worker/lib/mcp/utils
 */

// ============================================================================
// Progress Notification Utilities
// ============================================================================

/**
 * Progress notification structure per MCP spec
 */
export interface ProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
  message?: string;
}

/**
 * Send a progress notification to the client via SSE
 *
 * In stateless HTTP mode, we embed progress in the response _meta field
 * since we cannot push notifications between request/response cycles.
 */
export function createProgressMeta(
  progressToken: string | number,
  progress: number,
  total?: number,
  message?: string,
): { _meta: { progress: ProgressNotification } } {
  return {
    _meta: {
      progress: {
        progressToken,
        progress,
        total,
        message,
      },
    },
  };
}

/**
 * Execute a long-running operation with progress tracking
 *
 * Breaks the operation into steps and returns progress metadata
 * for the final response.
 */
export async function withProgress<T extends Record<string, unknown>>(
  progressToken: string | number | undefined,
  totalSteps: number,
  operation: (
    step: number,
    reportProgress: (step: number, message?: string) => void,
  ) => Promise<T>,
): Promise<T & { _meta?: { progress?: ProgressNotification } }> {
  if (!progressToken) {
    return await operation(0, () => {});
  }

  let currentStep = 0;
  let result: T;

  const reportProgress = (step: number, _message?: string) => {
    currentStep = step;
  };

  result = await operation(currentStep, reportProgress);

  return {
    ...result,
    _meta: {
      progress: {
        progressToken,
        progress: currentStep,
        total: totalSteps,
        message: `Completed ${currentStep}/${totalSteps} steps`,
      },
    },
  };
}
