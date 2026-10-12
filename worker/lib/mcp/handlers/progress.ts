/**
 * MCP Tool Handlers - Progress
 *
 * Handlers for check_progress, cancel_operation, and list_operations tools.
 */

import type { Env } from "../../../types";
import type { AuthResult } from "../../auth";
import type { ToolCallResult } from "../types";
import {
  getProgress,
  createProgressTracker,
  listOperations,
} from "../progress";

function isAuthorizedForOperation(
  stateUserId: string | undefined,
  auth?: AuthResult,
): boolean {
  if (auth?.role === "admin") return true;
  if (!stateUserId) return true; // Legacy unassigned operations
  return stateUserId === auth?.userId;
}

export async function handleCheckProgress(
  args: Record<string, unknown>,
  env: Env,
  auth?: AuthResult,
): Promise<ToolCallResult> {
  const operationId = args.operationId as string | undefined;

  if (!operationId) {
    return handleListOperations(args, env, auth);
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

  if (!isAuthorizedForOperation(state.userId, auth)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "Forbidden: Operation belongs to another user",
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
  auth?: AuthResult,
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

  if (!isAuthorizedForOperation(state.userId, auth)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Forbidden: Operation belongs to another user",
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

  const tracker = createProgressTracker(operationId, env, auth?.userId);
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
  auth?: AuthResult,
): Promise<ToolCallResult> {
  const isAdmin = auth?.role === "admin";
  const ops = await listOperations(env, auth?.userId, isAdmin);

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
