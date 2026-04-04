import { executePipeline, getPipelineStatus } from "../state-machine";
import {
  getProductionSnapshot,
  getDealsByCode,
  writeStagingSnapshot,
  getStagingSnapshot,
} from "../lib/storage";
import { getRunLogs, getRecentLogs, exportLogsAsJSONL } from "../lib/logger";
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
import {
  generateDealAnalytics,
  generateAnalyticsSummary,
} from "../lib/analytics";

/**
 * Core API Route Handlers
 */

export async function handleHealth(env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);
  const status = await getPipelineStatus(env);

  const logs = await getRecentLogs(env, 100);
  const recentRuns = logs.filter((l) => l.phase === "finalize").length;
  const successfulRuns = logs.filter(
    (l) => l.phase === "finalize" && l.status === "complete",
  ).length;

  const health: HealthStatus = {
    status: snapshot ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: CONFIG.VERSION,
    checks: {
      kv_connection: !!snapshot,
      last_run_success: !!status.last_run,
      snapshot_valid: !!snapshot,
    },
    components: {
      kv_stores: {
        deals_prod: !!snapshot,
        deals_staging: true,
        deals_log: true,
        deals_lock: !status.locked,
        deals_sources: true,
      },
      pipeline: {
        last_run: status.last_run?.timestamp || new Date().toISOString(),
        last_success: !!status.last_run,
        average_duration_ms: 0,
      },
      external_services: {
        github_api: true,
      },
    },
    metrics: {
      total_runs_24h: recentRuns,
      success_rate_24h: recentRuns > 0 ? successfulRuns / recentRuns : 0,
      avg_deals_per_run: snapshot?.stats?.active || 0,
    },
  };

  const statusCode = health.status === "healthy" ? 200 : 503;
  return jsonResponse(health, statusCode);
}

export async function handleReady(env: Env): Promise<Response> {
  const health = await handleHealth(env);
  const body = (await health.json()) as HealthStatus;
  const isReady = body.status === "healthy";
  return jsonResponse({ ready: isReady, ...body }, isReady ? 200 : 503);
}

export async function handleLive(env: Env): Promise<Response> {
  return jsonResponse({ alive: true, timestamp: new Date().toISOString() });
}

export async function handleMetrics(
  env: Env,
  format: string = "prometheus",
): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);
  const logs = await getRecentLogs(env, 1000);

  const runs = logs.filter((l) => l.phase === "finalize").length;
  const successes = logs.filter(
    (l) => l.phase === "publish" && l.status === "complete",
  ).length;
  const candidates = logs.reduce((sum, l) => sum + (l.candidate_count || 0), 0);
  const valid = logs.reduce((sum, l) => sum + (l.valid_count || 0), 0);
  const duplicates = logs.reduce((sum, l) => sum + (l.duplicate_count || 0), 0);

  if (format === "json") {
    return jsonResponse({
      summary: {
        total_runs: runs,
        successful_runs: successes,
      },
      deals: {
        active: snapshot?.stats?.active || 0,
        discovered_total: candidates,
        validated_total: valid,
        duplicate_total: duplicates,
      },
    });
  }

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
deals_active_deals ${snapshot?.stats?.active || 0}
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
    return jsonResponse({ ...snapshot, deals });
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
  request: Request,
  env: Env,
): Promise<Response> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return jsonResponse(
      { error: "Content-Type must be application/json" },
      415,
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 1024 * 1024) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }

  const body = (await request.json()) as SubmitDealBody;
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

import {
  calculateDealScore,
  sortDeals,
  rankDeals,
  getTopDeals,
  getExpiringDeals,
  getRecentDeals,
  type SortField,
  type SortOrder,
} from "../lib/ranking";
import { calculateStringSimilarity } from "../lib/crypto";

/**
 * Handle similar deals endpoint - GET /deals/similar?code=X
 * Returns deals similar to the given deal code
 */
export async function handleSimilarDeals(
  url: URL,
  env: Env,
): Promise<Response> {
  const code = url.searchParams.get("code");
  const domain = url.searchParams.get("domain");
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 5;

  if (!code && !domain) {
    return jsonResponse(
      { error: "Either 'code' or 'domain' query parameter required" },
      400,
    );
  }

  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  const targetDeal = snapshot.deals.find(
    (d) => code && d.code.toLowerCase() === code.toLowerCase(),
  );

  if (!targetDeal && domain) {
    const byDomain = snapshot.deals.filter(
      (d) => d.source.domain.toLowerCase() === domain.toLowerCase(),
    );
    if (byDomain.length === 0) {
      return jsonResponse({ error: "No deals found for domain" }, 404);
    }
    return jsonResponse({
      similar: [],
      total: 0,
      reason: "No reference deal found, showing domain deals",
      domain_deals: byDomain.slice(0, limit),
    });
  }

  if (!targetDeal) {
    return jsonResponse({ error: "Deal not found" }, 404);
  }

  const targetCategories = new Set(
    targetDeal.metadata.category.map((c) => c.toLowerCase()),
  );
  const targetTags = new Set(
    targetDeal.metadata.tags.map((t) => t.toLowerCase()),
  );
  const targetDomain = targetDeal.source.domain.toLowerCase();

  const similar = snapshot.deals
    .filter((d) => d.id !== targetDeal.id)
    .map((d) => {
      let score = 0;

      // Category match (weight: 3)
      const dealCategories = new Set(
        d.metadata.category.map((c) => c.toLowerCase()),
      );
      for (const cat of targetCategories) {
        if (dealCategories.has(cat)) score += 3;
      }

      // Domain match (weight: 2)
      if (d.source.domain.toLowerCase() === targetDomain) {
        score += 2;
      }

      // Tag overlap (weight: 1)
      const dealTags = new Set(d.metadata.tags.map((t) => t.toLowerCase()));
      for (const tag of targetTags) {
        if (dealTags.has(tag)) score += 1;
      }

      // Code similarity (weight: 1)
      const codeSim = calculateStringSimilarity(targetDeal.code, d.code);
      score += codeSim;

      return { deal: d, similarity: score };
    })
    .filter((s) => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((s) => s.deal);

  return jsonResponse({
    reference: {
      id: targetDeal.id,
      title: targetDeal.title,
      code: targetDeal.code,
      domain: targetDeal.source.domain,
    },
    similar,
    total: similar.length,
  });
}

/**
 * Handle ranked deals endpoint - GET /deals/ranked
 */
export async function handleRankedDeals(url: URL, env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  // Parse query parameters
  const sortBy = (url.searchParams.get("sort_by") || "confidence") as SortField;
  const order = (url.searchParams.get("order") || "desc") as SortOrder;
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 50;
  const minConfidence = url.searchParams.has("min_confidence")
    ? parseFloat(url.searchParams.get("min_confidence")!)
    : undefined;
  const minTrustScore = url.searchParams.has("min_trust")
    ? parseFloat(url.searchParams.get("min_trust")!)
    : undefined;
  const category = url.searchParams.get("category") || undefined;
  const includeScores = url.searchParams.get("include_scores") === "true";

  // Rank deals
  const result = rankDeals(snapshot.deals, {
    sortBy,
    order,
    limit,
    minConfidence,
    minTrustScore,
    category,
  });

  const response: Record<string, unknown> = {
    deals: result.deals,
    meta: {
      total: result.total,
      filtered: result.filtered,
      returned: result.deals.length,
      sort_by: sortBy,
      order: order,
    },
  };

  if (includeScores) {
    response.scores = result.scores;
  }

  return jsonResponse(response);
}

/**
 * Handle deal highlights endpoint - GET /deals/highlights
 */
export async function handleDealHighlights(
  url: URL,
  env: Env,
): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 5;

  const topDeals = getTopDeals(snapshot.deals, limit);
  const expiringSoon = getExpiringDeals(snapshot.deals, 7);
  const recentlyAdded = getRecentDeals(snapshot.deals, 7);

  return jsonResponse({
    top_deals: topDeals,
    expiring_soon: expiringSoon,
    recently_added: recentlyAdded,
    meta: {
      top_deals_count: topDeals.length,
      expiring_soon_count: expiringSoon.length,
      recently_added_count: recentlyAdded.length,
    },
  });
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
