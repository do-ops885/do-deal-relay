import { executePipeline, getPipelineStatus } from "../state-machine";
import { getRunLogs, getRecentLogs, exportLogsAsJSONL } from "../lib/logger";
import {
  generateDealAnalytics,
  generateAnalyticsSummary,
} from "../lib/analytics";
import type { Env } from "../types";
import { jsonResponse } from "./utils";

/**
 * Pipeline & Analytics Handlers
 */

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

/**
 * Handle analytics dashboard endpoint - GET /api/analytics
 */
export async function handleAnalytics(url: URL, env: Env): Promise<Response> {
  const format = url.searchParams.get("format") || "json";
  const days = url.searchParams.has("days")
    ? parseInt(url.searchParams.get("days")!, 10)
    : 30;

  try {
    if (format === "summary") {
      const summary = await generateAnalyticsSummary(env, days);
      return jsonResponse(summary);
    }

    const analytics = await generateDealAnalytics(env, days);
    return jsonResponse(analytics);
  } catch (error) {
    console.error("Analytics generation error:", error);
    return jsonResponse(
      {
        error: "Failed to generate analytics",
        message: (error as Error).message,
      },
      500,
    );
  }
}
