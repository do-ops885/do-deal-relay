/**
 * Core API Routes - Pipeline Endpoints
 *
 * Handles /api/discover, /api/status, /api/log
 */

import { executePipeline, getPipelineStatus } from "../../state-machine";
import { getRunLogs, getRecentLogs, exportLogsAsJSONL } from "../../lib/logger";
import type { Env } from "../../types";
import { jsonResponse, getAllowedOrigin, SECURITY_HEADERS } from "../utils";

export async function handleDiscover(
  env: Env,
  request?: Request,
): Promise<Response> {
  const result = await executePipeline(env);
  if (result.success) {
    return jsonResponse(
      {
        success: true,
        message: "Discovery pipeline triggered",
      },
      200,
      request,
    );
  } else {
    return jsonResponse(
      {
        success: false,
        error: result.error,
        phase: result.phase,
      },
      500,
      request,
    );
  }
}

export async function handleStatus(
  env: Env,
  request?: Request,
): Promise<Response> {
  const status = await getPipelineStatus(env);
  return jsonResponse(status, 200, request);
}

export async function handleGetLogs(
  url: URL,
  env: Env,
  request?: Request,
): Promise<Response> {
  const format = url.searchParams.get("format") || "json";

  if (format === "jsonl") {
    const jsonl = await exportLogsAsJSONL(env);
    return new Response(jsonl, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": 'attachment; filename="deals-research.jsonl"',
        "Access-Control-Allow-Origin": getAllowedOrigin(
          request?.headers.get("Origin"),
        ),
        "Vary": "Origin",
        ...SECURITY_HEADERS,
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

  return jsonResponse({ logs, count: logs.length }, 200, request);
}
