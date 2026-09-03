/**
 * MCP Tool Handlers - Progress
 *
 * Handlers for check_progress, cancel_operation, and list_operations tools.
 */

import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import {
  getProgress,
  createProgressTracker,
  listOperations,
} from "../progress";

export async function handleCheckProgress(
  args: Record<string, unknown>,
  env: Env,
): Promise<ToolCallResult> {
  const operationId = args.operationId as string | undefined;

  if (!operationId) {
    const ops = await listOperations(env);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              operations: ops,
              count: ops.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const state = await getProgress(operationId, env);

  if (!state) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "Operation not found",
              operationId,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(state, null, 2),
      },
    ],
  };
}

export async function handleCancelOperation(
  args: Record<string, unknown>,
  env: Env,
): Promise<ToolCallResult> {
  const operationId = args.operationId as string | undefined;

  if (!operationId) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Missing operationId parameter",
          }),
        },
      ],
      isError: true,
    };
  }

  const state = await getProgress(operationId, env);

  if (!state) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Operation not found",
            operationId,
          }),
        },
      ],
      isError: true,
    };
  }

  if (state.status === "completed" || state.status === "failed") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Operation already ${state.status}`,
            operationId,
          }),
        },
      ],
      isError: true,
    };
  }

  const tracker = createProgressTracker(operationId, env);
  await tracker.markCancelled();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Operation ${operationId} cancelled`,
          operationId,
        }),
      },
    ],
  };
}

export async function handleListOperations(
  _args: Record<string, unknown>,
  env: Env,
): Promise<ToolCallResult> {
  const ops = await listOperations(env);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            operations: ops,
            count: ops.length,
          },
          null,
          2,
        ),
      },
    ],
  };
}
