/**
 * MCP Tools - Barrel Export
 *
 * Re-exports all tool definitions, handlers, and the executeTool/getTools functions.
 */

import { z } from "zod";
import type { Env } from "../../../types";
import type { Tool, ToolCallResult, ToolHandler } from "../types";

import { dealTools, dealToolHandlers } from "./deals";
import { researchTools, researchToolHandlers } from "./research";
import { userTools, userToolHandlers } from "./user";
import { systemTools, systemToolHandlers } from "./system";

// Re-export tool arrays
export { dealTools, researchTools, userTools, systemTools };

// Re-export individual tool handler maps
export {
  dealToolHandlers,
  researchToolHandlers,
  userToolHandlers,
  systemToolHandlers,
};

// Combined tool list (preserves original MCP_TOOLS export)
export const MCP_TOOLS: Tool[] = [
  ...dealTools,
  ...researchTools,
  ...userTools,
  ...systemTools,
];

// Combined handler registry
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  ...dealToolHandlers,
  ...researchToolHandlers,
  ...userToolHandlers,
  ...systemToolHandlers,
};

/**
 * Execute a tool by name with arguments
 */
export async function executeTool(
  name: string,
  args: { [key: string]: unknown },
  env: Env,
  request: Request,
): Promise<ToolCallResult> {
  const handler = TOOL_HANDLERS[name];

  if (!handler) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Unknown tool: "${name}"`,
        },
      ],
      isError: true,
    };
  }

  try {
    return await handler(args, env, request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        content: [
          {
            type: "text",
            text: `❌ Invalid arguments: ${issues}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `❌ Tool execution failed: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Get all available tools
 */
export function getTools(): Tool[] {
  return MCP_TOOLS;
}
