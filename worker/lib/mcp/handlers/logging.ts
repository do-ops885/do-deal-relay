import { z } from "zod";
import type { Env } from "../../types";
import type { ToolCallResult } from "../types";
import { getRunLogs, getRecentLogs } from "../../logger";

export const GetLogsInputSchema = z.object({
  run_id: z.string().optional().describe("Filter by run_id"),
  count: z.number().int().min(1).max(1000).default(100).describe("Maximum results"),
});

/**
 * Get logs tool handler
 * Consolidated from /api/log
 */
export async function handleGetLogs(
  args: z.infer<typeof GetLogsInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { run_id, count } = args;

  let logs;
  if (run_id) {
    logs = await getRunLogs(env, run_id);
  } else {
    logs = await getRecentLogs(env, count);
  }

  return {
    content: [
      {
        type: "text",
        text: `Found ${logs.length} log entries.`,
      },
      {
        type: "resource",
        resource: {
          uri: `logs://${run_id || "recent"}`,
          mimeType: "application/json",
          text: JSON.stringify({ logs, count: logs.length }, null, 2),
        },
      },
    ],
    structuredContent: { logs, count: logs.length },
  };
}
