/**
 * Core API Routes - Pipeline Endpoints
 *
 * Handles /api/discover, /api/status, /api/log
 */

import { executePipeline, getPipelineStatus } from "../../state-machine";
import { getRunLogs, getRecentLogs, exportLogsAsJSONL } from "../../lib/logger";
import type { Env } from "../../types";
import { jsonResponse } from "../utils";

export async function handleDiscover(env: Env): Promise<Response> {
  const result = await executePipeline(env);
  if (result.success) {
    return jsonResponse({
      success: true,
      message: "Discovery pipeline triggered",
    });
  } else {
    return jsonResponse(
      {
        success: false,
        error: result.error,
        phase: result.phase,
      },
      500,
    );
  }
}

export async function handleStatus(env: Env): Promise<Response> {
  const status = await getPipelineStatus(env);
  return jsonResponse(status);
}

export async function handleGetLogs(url: URL, env: Env): Promise<Response> {
  const format = url.searchParams.get("format") || "json";

  if (format === "jsonl") {
    const jsonl = await exportLogsAsJSONL(env);
    return new Response(jsonl, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": 'attachment; filename="deals-research.jsonl"',
      },
    });
  }

  const run_id = url.searchParams.get("run_id");
  const count = url.searchParams.has("count")
    ? parseInt(url.searchParams.get("count")!, 10)
    : 100;

  let logs;
  if (run_id) {
    logs = await getRunLogs(env, run_id);
  } else {
    logs = await getRecentLogs(env, count);
  }

  return jsonResponse({ logs, count: logs.length });
}
