/**
 * MCP Route Handler - Tools
 *
 * Handles tools/list and tools/call JSON-RPC methods.
 */

import type { Env } from "../../types";
import {
  type ToolsListResult,
  type ToolCallResult,
  type ToolCallParams,
} from "../../lib/mcp/types";
import { getTools, executeTool } from "../../lib/mcp/tools";
import { paginateList } from "../../lib/mcp/pagination";
import { type ProgressNotification } from "../../lib/mcp/utils";
import {
  createProgressTracker,
  type ProgressTracker,
} from "../../lib/mcp/progress";

/**
 * Bundle of everything needed to report progress for a tool call whose
 * client supplied a progressToken. Grouping the tracker with the raw token
 * lets a single null-check narrow both values together, avoiding non-null
 * assertions when constructing the final ProgressNotification.
 */
interface ActiveProgressTracking {
  tracker: ProgressTracker;
  token: string | number;
}

/**
 * Handle tools/list request with pagination support
 */
export async function handleToolsList(params?: {
  cursor?: string;
}): Promise<ToolsListResult> {
  const tools = getTools();

  const serializedTools = tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema:
      typeof tool.inputSchema === "object"
        ? tool.inputSchema
        : { type: "object" },
    outputSchema:
      tool.outputSchema && typeof tool.outputSchema === "object"
        ? tool.outputSchema
        : undefined,
    annotations: tool.annotations,
  }));

  const PAGE_SIZE = 20;
  const { items, nextCursor } = paginateList(
    serializedTools,
    params?.cursor,
    PAGE_SIZE,
    (tool) => tool.name,
  );

  return {
    tools: items,
    nextCursor,
  } as ToolsListResult;
}

/**
 * Handle tools/call request with progress tracking
 */
export async function handleToolCall(
  params: ToolCallParams,
  env: Env,
  request: Request,
): Promise<ToolCallResult> {
  const { name, arguments: args = {}, _meta } = params;

  // Capture the optional progress token once (MF-3) so GET
  // /mcp/stream?operationId=… can stream live progress for long-running
  // tool executions. The tracker is created before execution so stream
  // clients polling KV see a "running" state immediately. Best-effort:
  // KV failures must never fail the tool call itself.
  const progressToken = _meta?.progressToken;
  const activeProgress: ActiveProgressTracking | null = progressToken
    ? {
        tracker: createProgressTracker(String(progressToken), env),
        token: progressToken,
      }
    : null;

  if (activeProgress) {
    await activeProgress.tracker
      .updateProgress(0, 1, `Starting tool: ${name}`)
      .catch(() => {});
  }

  const result = await executeTool(name, args, env, request);

  if (!activeProgress) return result;

  const { tracker, token } = activeProgress;
  if (result.isError) {
    const message =
      result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join(" ") || "Tool execution failed";
    await tracker.markFailed(message).catch(() => {});
  } else {
    await tracker.markCompleted(result).catch(() => {});
  }

  const progressNotification: ProgressNotification = {
    progressToken: token,
    progress: 1,
    total: 1,
    message: result.isError
      ? `Tool "${name}" failed`
      : `Tool "${name}" completed`,
  };

  return {
    ...result,
    _meta: {
      ...(result._meta || {}),
      progress: progressNotification,
    },
  };
}
