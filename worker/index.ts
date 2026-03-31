import { executePipeline, getPipelineStatus } from "./state-machine";
import {
  getProductionSnapshot,
  getActiveDeals,
  getDealsByCode,
  writeStagingSnapshot,
  getStagingSnapshot,
} from "./lib/storage";
import {
  appendLog,
  getRunLogs,
  getRecentLogs,
  exportLogsAsJSONL,
} from "./lib/logger";
import { notify } from "./notify";
import { setGitHubToken } from "./lib/github";
import type {
  Env,
  GetDealsQuery,
  SubmitDealBody,
  HealthStatus,
  Deal,
} from "./types";
import { GetDealsQuerySchema, SubmitDealBodySchema } from "./types";
import { generateDealId } from "./lib/crypto";
import { CONFIG } from "./config";

// ============================================================================
// Main Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Initialize GitHub token if available
    if (env.GITHUB_TOKEN) {
      setGitHubToken(env.GITHUB_TOKEN);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === "/health") {
        return handleHealth(env);
      }

      // Metrics
      if (path === "/metrics") {
        return handleMetrics(env);
      }

      // Get deals
      if (path === "/deals" || path === "/deals.json") {
        return handleGetDeals(url, env);
      }

      // API endpoints
      if (path === "/api/discover" && request.method === "POST") {
        return handleDiscover(env);
      }

      if (path === "/api/status") {
        return handleStatus(env);
      }

      if (path === "/api/log") {
        return handleGetLogs(url, env);
      }

      if (path === "/api/submit" && request.method === "POST") {
        const body = await request.json();
        return handleSubmit(body as SubmitDealBody, env);
      }

      // 404
      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Request handler error:", error);
      return jsonResponse(
        { error: "Internal server error", message: (error as Error).message },
        500,
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log(`Scheduled event triggered at ${new Date().toISOString()}`);

    try {
      const result = await executePipeline(env);

      if (result.success) {
        console.log("Pipeline completed successfully");
      } else {
        console.error(`Pipeline failed at ${result.phase}: ${result.error}`);
      }
    } catch (error) {
      console.error("Scheduled execution error:", error);

      // Notify on critical failure
      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: "scheduled",
        message: `Scheduled pipeline failed: ${(error as Error).message}`,
      });
    }
  },
};

// ============================================================================
// Route Handlers
// ============================================================================

async function handleHealth(env: Env): Promise<Response> {
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
          duration_ms: 0, // Would need to store this
          deals_count: snapshot?.stats.active || 0,
        }
      : undefined,
  };

  const statusCode = health.status === "healthy" ? 200 : 503;
  return jsonResponse(health, statusCode);
}

async function handleMetrics(env: Env): Promise<Response> {
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
# TYPE deals_publish_success_total counter
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

async function handleGetDeals(url: URL, env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  // Parse query params
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

  // Filter by status
  deals = deals.filter((d) => d.metadata.status === "active");

  // Filter by category
  if (query.category) {
    deals = deals.filter((d) =>
      d.metadata.category.some(
        (c) => c.toLowerCase() === query.category!.toLowerCase(),
      ),
    );
  }

  // Filter by reward
  if (query.min_reward !== undefined) {
    deals = deals.filter((d) => {
      if (typeof d.reward.value === "number") {
        return d.reward.value >= query.min_reward!;
      }
      return false;
    });
  }

  // Limit
  deals = deals.slice(0, query.limit);

  // Return full snapshot or filtered array
  if (url.pathname === "/deals.json") {
    return jsonResponse({
      ...snapshot,
      deals,
    });
  }

  return jsonResponse(deals);
}

async function handleDiscover(env: Env): Promise<Response> {
  // Trigger manual discovery
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

async function handleStatus(env: Env): Promise<Response> {
  const status = await getPipelineStatus(env);
  return jsonResponse(status);
}

async function handleGetLogs(url: URL, env: Env): Promise<Response> {
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

async function handleSubmit(body: SubmitDealBody, env: Env): Promise<Response> {
  const validation = SubmitDealBodySchema.safeParse(body);

  if (!validation.success) {
    return jsonResponse(
      { error: "Invalid request body", details: validation.error.errors },
      400,
    );
  }

  // Check if deal already exists in production
  const existing = await getDealsByCode(env, body.code);
  if (existing.length > 0) {
    return jsonResponse(
      { error: "Deal with this code already exists", existing: existing[0].id },
      409,
    );
  }

  // Generate deal ID
  const dealId = await generateDealId(
    body.source || "manual",
    body.code,
    "cash",
  );

  // Get existing staging snapshot or create new one
  const stagingSnapshot = await getStagingSnapshot(env);
  const now = new Date().toISOString();

  // Extract metadata with type assertions
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const reward = (metadata.reward || {}) as Record<string, unknown>;
  const expiry = (metadata.expiry || {}) as Record<string, unknown>;

  // Create deal object from SubmitDealBody
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

  // Prepare deals array
  const deals = stagingSnapshot
    ? [...stagingSnapshot.deals, newDeal]
    : [newDeal];

  // Create or update staging snapshot
  const snapshotData = {
    version: stagingSnapshot?.version || CONFIG.VERSION,
    generated_at: now,
    run_id: stagingSnapshot?.run_id || `manual-${Date.now()}`,
    trace_id: stagingSnapshot?.trace_id || `manual-${dealId}`,
    previous_hash: stagingSnapshot?.snapshot_hash || "",
    schema_version: stagingSnapshot?.schema_version || "1.0.0",
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

  // Write to staging
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

// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
