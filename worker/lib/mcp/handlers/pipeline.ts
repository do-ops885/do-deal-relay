import { z } from "zod";
import type { Env } from "../../types";
import type { ToolCallResult } from "../types";
import { getPipelineStatus, executePipeline } from "../../../state-machine";

/**
 * Get pipeline status tool handler
 * Consolidated from /api/status
 */
export async function handleGetPipelineStatus(
  _args: Record<string, unknown>,
  env: Env,
): Promise<ToolCallResult> {
  const status = await getPipelineStatus(env);

  return {
    content: [
      {
        type: "text",
        text: `Pipeline status: ${status.locked ? "LOCKED" : "IDLE"}. Last run: ${status.last_run?.timestamp || "Never"}.`,
      },
      {
        type: "resource",
        resource: {
          uri: "pipeline://status",
          mimeType: "application/json",
          text: JSON.stringify(status, null, 2),
        },
      },
    ],
    structuredContent: status,
  };
}

/**
 * Trigger discovery pipeline tool handler
 * Consolidated from /api/discover
 */
export async function handleTriggerDiscovery(
  _args: Record<string, unknown>,
  env: Env,
): Promise<ToolCallResult> {
  const result = await executePipeline(env);

  if (result.success) {
    return {
      content: [
        {
          type: "text",
          text: "✅ Discovery pipeline triggered successfully.",
        },
      ],
      structuredContent: { success: true, message: "Discovery pipeline triggered" },
    };
  } else {
    return {
      content: [
        {
          type: "text",
          text: `❌ Pipeline failed at ${result.phase}: ${result.error}`,
        },
      ],
      isError: true,
      structuredContent: {
        success: false,
        error: result.error,
        phase: result.phase,
      },
    };
  }
}
