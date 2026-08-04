/**
 * Core API Routes - Pipeline Endpoints
 *
 * Handles /api/discover, /api/status, /api/log
 */

import { executePipeline, getPipelineStatus } from "../../state-machine";
import { getRunLogs, getRecentLogs, exportLogsAsJSONL } from "../../lib/logger";
import { logger } from "../../lib/global-logger";
import type { Env } from "../../types";
import { jsonResponse, getAllowedOrigin, SECURITY_HEADERS } from "../utils";
import { toErrCtx } from "../../lib/errors";

const PIPELINE_EXECUTOR_NAME = "discovery-pipeline";

async function executePipelineWithFallback(env: Env): Promise<{
  success: boolean;
  phase: string;
  error?: string;
}> {
  if (env.USE_PIPELINE_EXECUTOR !== "true" || !env.PIPELINE_EXECUTOR) {
    return executePipeline(env);
  }

  try {
    const stub = env.PIPELINE_EXECUTOR.getByName(PIPELINE_EXECUTOR_NAME);
    const result = await stub.fetch("https://pipeline-executor/execute", {
      method: "POST",
      body: JSON.stringify({ runId: `http-${crypto.randomUUID()}` }),
      headers: { "Content-Type": "application/json" },
    });
    if (!result.ok)
      throw new Error(`Pipeline executor returned ${result.status}`);
    const execution = (await result.json()) as {
      success: boolean;
      phase: string;
      error?: string;
    };
    return {
      success: execution.success,
      phase: execution.phase,
      error: execution.error,
    };
  } catch (error) {
    logger.warn("Durable pipeline executor unavailable; using state machine", {
      component: "pipeline-route",
      error: error instanceof Error ? error.message : String(error),
    });
    return executePipeline(env);
  }
}

export async function handleDiscover(
  env: Env,
  request?: Request,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (ctx) {
    ctx.waitUntil(
      executePipelineWithFallback(env).catch((err) => {
        logger.error("Background pipeline error", toErrCtx(err));
      }),
    );
    return jsonResponse(
      {
        success: true,
        message: "Discovery pipeline triggered (running async)",
      },
      202,
      request,
      env,
    );
  }
  // Fallback: synchronous execution for scheduled/cron triggers
  const result = await executePipelineWithFallback(env);
  if (result.success) {
    return jsonResponse(
      {
        success: true,
        message: "Discovery pipeline triggered",
      },
      200,
      request,
      env,
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
      env,
    );
  }
}

export async function handleStatus(
  env: Env,
  request?: Request,
): Promise<Response> {
  const status = await getPipelineStatus(env);
  return jsonResponse(status, 200, request, env);
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
          env,
        ),
        Vary: "Origin",
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

  return jsonResponse({ logs, count: logs.length }, 200, request, env);
}
