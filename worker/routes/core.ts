import { executePipeline, getPipelineStatus } from "../state-machine";
import {
  getProductionSnapshot,
  getDealsByCode,
  writeStagingSnapshot,
  getStagingSnapshot,
} from "../lib/storage";
import {
  appendLog,
  getRunLogs,
  getRecentLogs,
  exportLogsAsJSONL,
} from "../lib/logger";
import { generateDealId } from "../lib/crypto";
import { CONFIG } from "../config";
import { handleError } from "../lib/error-handler";
import type {
  Env,
  GetDealsQuery,
  SubmitDealBody,
  HealthStatus,
  Deal,
} from "../types";
import { GetDealsQuerySchema, SubmitDealBodySchema } from "../types";
import { jsonResponse } from "./utils";

/**
 * Core API Route Handlers
 *
 * Provides HTTP endpoints for:
 * - Health monitoring (/health)
 * - Prometheus metrics (/metrics)
 * - Deal retrieval (/deals, /deals.json)
 * - Pipeline control (/api/discover)
 * - Log access (/api/log)
 * - Manual deal submission (/api/submit)
 *
 * @module worker/routes/core
 */

/**
 * Health check endpoint handler.
 *
 * Returns system health status based on:
 * - KV connection (can we read production snapshot?)
 * - Last run success (was the last pipeline run successful?)
 * - Snapshot validity (is the production snapshot valid?)
 *
 * Status codes:
 * - 200: Healthy (all checks pass)
 * - 503: Degraded (snapshot missing but KV accessible - expected for fresh deploys)
 *
 * @param env - Worker environment with KV bindings
 * @returns HTTP response with health status JSON
 * @example
 * Response when healthy:
 * ```json
 * {
 *   "status": "healthy",
 *   "version": "0.1.1",
 *   "timestamp": "2026-04-02T12:00:00Z",
 *   "checks": {
 *     "kv_connection": true,
 *     "last_run_success": true,
 *     "snapshot_valid": true
 *   }
 * }
 * ```
 */
export async function handleHealth(env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);
  const status = await getPipelineStatus(env);

  const health: HealthStatus = {
    status: snapshot ? "healthy" : "degraded",
    version: CONFIG.VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      kv_connection: !!snapshot,
      last_run_success: !status.locked && !!status.last_run,
      snapshot_valid: snapshot !== null,
    },
    last_run: status.last_run
      ? {
          run_id: status.last_run.run_id,
          timestamp: status.last_run.timestamp,
          duration_ms: 0,
          deals_count: snapshot?.stats.active || 0,
        }
      : undefined,
  };

  const statusCode = health.status === "healthy" ? 200 : 503;
  return jsonResponse(health, statusCode);
}

/**
 * Prometheus-compatible metrics endpoint.
 *
 * Returns metrics in Prometheus exposition format for monitoring:
 * - deals_runs_total: Total number of discovery runs
 * - deals_publish_success_total: Successful publish operations
 * - deals_candidate_deals_total: Deals discovered (before validation)
 * - deals_valid_deals_total: Deals passing validation
 * - deals_duplicate_deals_total: Duplicates filtered out
 * - deals_active_deals: Current active deals in production
 *
 * @param env - Worker environment with KV bindings
 * @returns HTTP response with Prometheus text format metrics
 * @example
 * ```
 * # HELP deals_runs_total Total discovery runs
 * # TYPE deals_runs_total counter
 * deals_runs_total 42
 *
 * # HELP deals_active_deals Current active deals in production
 * deals_active_deals 156
 * ```
 */
export async function handleMetrics(env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);
  const logs = await getRecentLogs(env, 1000);

  const runs = logs.filter((l) => l.phase === "finalize").length;
  const successes = logs.filter(
    (l) => l.phase === "publish" && l.status === "complete",
  ).length;
  const candidates = logs.reduce((sum, l) => sum + (l.candidate_count || 0), 0);
  const valid = logs.reduce((sum, l) => sum + (l.valid_count || 0), 0);
  const duplicates = logs.reduce((sum, l) => sum + (l.duplicate_count || 0), 0);

  const metrics = `
# HELP deals_runs_total Total discovery runs
# TYPE deals_runs_total counter
deals_runs_total ${runs}

# HELP deals_publish_success_total Successful publishes
deals_publish_success_total ${successes}

# HELP deals_candidate_deals_total Candidate deals discovered
deals_candidate_deals_total ${candidates}

# HELP deals_valid_deals_total Valid deals after validation
deals_valid_deals_total ${valid}

# HELP deals_duplicate_deals_total Duplicate deals filtered
deals_duplicate_deals_total ${duplicates}

# HELP deals_active_deals Current active deals in production
deals_active_deals ${snapshot?.stats.active || 0}
`.trim();

  return new Response(metrics, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function handleGetDeals(url: URL, env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  const query: GetDealsQuery = {
    category: url.searchParams.get("category") || undefined,
    min_reward: url.searchParams.has("min_reward")
      ? parseFloat(url.searchParams.get("min_reward")!)
      : undefined,
    limit: url.searchParams.has("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : 100,
  };

  const validation = GetDealsQuerySchema.safeParse(query);
  if (!validation.success) {
    return jsonResponse({ error: "Invalid query parameters" }, 400);
  }

  let deals = snapshot.deals;

  deals = deals.filter((d) => d.metadata.status === "active");

  if (query.category) {
    deals = deals.filter((d) =>
      d.metadata.category.some(
        (c) => c.toLowerCase() === query.category!.toLowerCase(),
      ),
    );
  }

  if (query.min_reward !== undefined) {
    deals = deals.filter((d) => {
      if (typeof d.reward.value === "number") {
        return d.reward.value >= query.min_reward!;
      }
      return false;
    });
  }

  deals = deals.slice(0, query.limit);

  if (url.pathname === "/deals.json") {
    return jsonResponse({
      ...snapshot,
      deals,
    });
  }

  return jsonResponse(deals);
}

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

export async function handleSubmit(
  body: SubmitDealBody,
  env: Env,
): Promise<Response> {
  const validation = SubmitDealBodySchema.safeParse(body);

  if (!validation.success) {
    return jsonResponse(
      { error: "Invalid request body", details: validation.error.errors },
      400,
    );
  }

  const existing = await getDealsByCode(env, body.code);
  if (existing.length > 0) {
    return jsonResponse(
      { error: "Deal with this code already exists", existing: existing[0].id },
      409,
    );
  }

  const dealId = await generateDealId(
    body.source || "manual",
    body.code,
    "cash",
  );

  const stagingSnapshot = await getStagingSnapshot(env);
  const now = new Date().toISOString();

  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const reward = (metadata.reward || {}) as Record<string, unknown>;
  const expiry = (metadata.expiry || {}) as Record<string, unknown>;

  const newDeal: Deal = {
    id: dealId,
    source: {
      url: body.url,
      domain: body.source || "manual",
      discovered_at: now,
      trust_score: 0.5,
    },
    title: (metadata.title as string) || `Manual Deal: ${body.code}`,
    description:
      (metadata.description as string) ||
      `Manually submitted deal with code ${body.code}`,
    code: body.code,
    url: body.url,
    reward: {
      type: ((reward.type as string) || "cash") as
        | "cash"
        | "credit"
        | "percent"
        | "item",
      value: (reward.value as number) || 0,
      currency: (reward.currency as string) || "USD",
      description: reward.description as string | undefined,
    },
    requirements: (metadata.requirements as string[]) || [],
    expiry: {
      date: expiry.date as string | undefined,
      confidence: (expiry.confidence as number) || 0.5,
      type: ((expiry.type as string) || "unknown") as
        | "hard"
        | "soft"
        | "unknown",
    },
    metadata: {
      category: (metadata.category as string[]) || ["general"],
      tags: (metadata.tags as string[]) || [],
      normalized_at: now,
      confidence_score: (metadata.confidence_score as number) || 0.5,
      status: "quarantined",
    },
  };

  const deals = stagingSnapshot
    ? [...stagingSnapshot.deals, newDeal]
    : [newDeal];

  const snapshotData = {
    version: stagingSnapshot?.version || CONFIG.VERSION,
    generated_at: now,
    run_id: stagingSnapshot?.run_id || `manual-${Date.now()}`,
    trace_id: stagingSnapshot?.trace_id || `manual-${dealId}`,
    previous_hash: stagingSnapshot?.snapshot_hash || "",
    schema_version: stagingSnapshot?.schema_version || CONFIG.SCHEMA_VERSION,
    stats: {
      total: deals.length,
      active: deals.filter((d) => d.metadata.status === "active").length,
      quarantined: deals.filter((d) => d.metadata.status === "quarantined")
        .length,
      rejected: deals.filter((d) => d.metadata.status === "rejected").length,
      duplicates: 0,
    },
    deals,
  };

  const updatedSnapshot = await writeStagingSnapshot(env, snapshotData);

  return jsonResponse(
    {
      success: true,
      message: "Deal submitted for review",
      deal_id: dealId,
      code: body.code,
      status: "quarantined",
      snapshot_hash: updatedSnapshot.snapshot_hash,
    },
    201,
  );
}
