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
import { paginate, type ProgressNotification } from "../../lib/mcp/utils";

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

  const PAGE_SIZE = 5;
  const { items, nextCursor } = paginate(
    serializedTools,
    params?.cursor,
    PAGE_SIZE,
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

  const result = await executeTool(name, args, env, request);

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
