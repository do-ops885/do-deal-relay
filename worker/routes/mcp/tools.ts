/**
 * MCP Route Handler - Tools
 *
 * Handles tools/list and tools/call JSON-RPC methods.
 * Supports cursor-based pagination and SSE streaming.
 */

import type { Env } from "../../types";
import {
  type ToolsListResult,
  type ToolCallResult,
  type ToolCallParams,
} from "../../lib/mcp/types";
import { getTools, executeTool } from "../../lib/mcp/tools";
import {
  paginateList,
  DEFAULT_PAGE_SIZE,
  type PaginatedResult,
} from "../../lib/mcp/pagination";
import { type ProgressNotification } from "../../lib/mcp/utils";
import { handleStreamingToolCall } from "../mcp-stream";

/**
 * Handle tools/list request with cursor-based pagination
 */
export async function handleToolsList(params?: {
  cursor?: string;
  limit?: number;
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

  const limit = params?.limit ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, limit), 100);

  const { items, nextCursor } = paginateList(
    serializedTools,
    params?.cursor,
    pageSize,
    (item) => item.name,
  );

  return {
    tools: items,
    nextCursor,
  } as ToolsListResult;
}

/**
 * Handle tools/call request with progress tracking and optional streaming
 */
export async function handleToolCall(
  params: ToolCallParams,
  env: Env,
  request: Request,
): Promise<ToolCallResult | Response> {
  const { name, arguments: args = {}, cursor, _meta } = params;

  if (_meta?.stream) {
    return handleStreamingToolCall(params, env, request);
  }

  const mergedArgs = { ...(args || {}) } as Record<string, unknown>;
  if (cursor) {
    mergedArgs.cursor = cursor;
  }

  const result = await executeTool(name, mergedArgs, env, request);

  if (_meta?.progressToken) {
    const progressNotification: ProgressNotification = {
      progressToken: _meta.progressToken,
      progress: 1,
      total: 1,
      message: `Tool "${name}" completed`,
    };

    return {
      ...result,
      _meta: {
        ...(result._meta || {}),
        progress: progressNotification,
      },
    };
  }

  return result;
}
