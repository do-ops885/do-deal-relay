import { executePipeline, getPipelineStatus } from "./state-machine";
import {
  getProductionSnapshot,
  getActiveDeals,
  getDealsByCode,
  writeStagingSnapshot,
  getStagingSnapshot,
  getLastRunMetadata,
} from "./lib/storage";
import {
  appendLog,
  getRunLogs,
  getRecentLogs,
  exportLogsAsJSONL,
} from "./lib/logger";
import { notify } from "./notify";
import { setGitHubToken, initGitHubCircuitBreaker } from "./lib/github";
import type {
  Env,
  GetDealsQuery,
  SubmitDealBody,
  HealthStatus,
  Deal,
  LogEntry,
} from "./types";
import { GetDealsQuerySchema, SubmitDealBodySchema } from "./types";
import { generateDealId } from "./lib/crypto";
import { CONFIG } from "./config";
import { getLockStatus } from "./lib/lock";
import { getAllCircuitBreakerMetrics } from "./lib/circuit-breaker";
import {
  getRecentMetrics,
  calculateAggregateStats,
  formatMetricsForPrometheus,
  getPhaseTimingStats,
} from "./lib/metrics";
import { checkDealExpirations } from "./lib/expiration";

// ============================================================================
// Main Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Initialize GitHub token and circuit breaker if available
    if (env.GITHUB_TOKEN) {
      setGitHubToken(env.GITHUB_TOKEN);
      initGitHubCircuitBreaker(env);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === "/health") {
        return handleHealth(env);
      }

      // Kubernetes-style readiness check
      if (path === "/health/ready") {
        return handleReady(env);
      }

      // Kubernetes-style liveness check
      if (path === "/health/live") {
        return handleLive(env);
      }

      // Metrics
      if (path === "/metrics") {
        const format = url.searchParams.get("format") || "prometheus";
        return handleMetrics(env, format);
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

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`Scheduled event triggered at ${new Date().toISOString()}`);
    console.log(`Cron schedule: ${event.cron}`);

    // Check if this is the daily 9am expiration check
    // The cron "0 9 * * *" runs at 9am daily
    if (event.cron === "0 9 * * *") {
      console.log("Running daily expiration check...");
      try {
        const expiryResult = await checkDealExpirations(env);
        console.log(
          `Expiration check completed: ${expiryResult.expiringFound} expiring, ${expiryResult.expiredMarked} marked as expired`,
        );
      } catch (error) {
        console.error("Expiration check failed:", error);
        await notify(env, {
          type: "system_error",
          severity: "warning",
          run_id: `expiry-check-${Date.now()}`,
          message: `Expiration check failed: ${(error as Error).message}`,
        });
      }
      return;
    }

    // Otherwise run the discovery pipeline (every 6 hours)
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
  const health = await performHealthCheck(env);
  const statusCode = health.status === "healthy" ? 200 : 503;
  return jsonResponse(health, statusCode);
}

async function handleReady(env: Env): Promise<Response> {
  // Kubernetes-style readiness check
  // Returns 200 when the service is ready to accept traffic
  // Returns 503 when the service is not ready (e.g., still initializing or degraded)
  const health = await performHealthCheck(env);

  // Service is ready if all KV stores are accessible and pipeline is not locked
  const isReady =
    health.status !== "unhealthy" &&
    Object.values(health.components.kv_stores).every((v) => v);

  const statusCode = isReady ? 200 : 503;
  const body = {
    ready: isReady,
    timestamp: new Date().toISOString(),
    version: CONFIG.VERSION,
    status: health.status,
  };

  return jsonResponse(body, statusCode);
}

async function handleLive(env: Env): Promise<Response> {
  // Kubernetes-style liveness check
  // Returns 200 as long as the process is running
  // Returns 500 if the process is in a bad state and should be restarted

  // Basic liveness - just check if we can respond
  const timestamp = new Date().toISOString();

  // Check if KV stores are accessible (critical for functioning)
  const kvChecks = await checkKVStores(env);
  const criticalFailure = !kvChecks.deals_prod || !kvChecks.deals_staging;

  if (criticalFailure) {
    return jsonResponse(
      {
        alive: false,
        timestamp,
        error: "Critical KV stores unavailable",
      },
      500,
    );
  }

  return jsonResponse(
    {
      alive: true,
      timestamp,
      version: CONFIG.VERSION,
    },
    200,
  );
}

/**
 * Perform comprehensive health check
 */
async function performHealthCheck(env: Env): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();

  // Check all KV stores
  const kvStores = await checkKVStores(env);

  // Check pipeline status
  const pipelineStatus = await getPipelineStatus(env);
  const lastRun = await getLastRunMetadata(env);

  // Check external services
  const externalServices = await checkExternalServices(env);

  // Calculate metrics from logs
  const metrics = await calculateHealthMetrics(env);

  // Determine overall status
  const kvHealthy = Object.values(kvStores).every((v) => v);
  const pipelineHealthy = !pipelineStatus.locked;

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (!kvHealthy) {
    status = "unhealthy";
  } else if (!pipelineHealthy || !externalServices.github_api) {
    status = "degraded";
  }

  // Calculate average duration from recent logs
  const recentLogs = await getRecentLogs(env, 100);
  const logsWithDuration = recentLogs.filter(
    (l) => l.duration_ms !== undefined,
  );
  const avgDuration =
    logsWithDuration.length > 0
      ? logsWithDuration.reduce((sum, l) => sum + (l.duration_ms || 0), 0) /
        logsWithDuration.length
      : 0;

  // Determine last run success
  const lastSuccess = recentLogs.some(
    (l) => l.phase === "finalize" && l.status === "complete",
  );

  return {
    status,
    timestamp,
    version: CONFIG.VERSION,
    components: {
      kv_stores: kvStores,
      pipeline: {
        last_run:
          lastRun?.timestamp || pipelineStatus.last_run?.timestamp || timestamp,
        last_success: lastSuccess || !!lastRun,
        average_duration_ms: Math.round(avgDuration),
      },
      external_services: externalServices,
    },
    metrics,
  };
}

/**
 * Check connectivity to all KV stores
 */
async function checkKVStores(
  env: Env,
): Promise<HealthStatus["components"]["kv_stores"]> {
  const stores: HealthStatus["components"]["kv_stores"] = {
    deals_prod: false,
    deals_staging: false,
    deals_log: false,
    deals_lock: false,
    deals_sources: false,
  };

  try {
    // Test each KV store with a simple read/write/delete cycle
    // Test deals_prod
    const testKey = `health:${Date.now()}`;
    await env.DEALS_PROD.put(testKey, "test");
    const prodValue = await env.DEALS_PROD.get(testKey);
    await env.DEALS_PROD.delete(testKey);
    stores.deals_prod = prodValue === "test";
  } catch (error) {
    console.error("KV check failed for deals_prod:", error);
    stores.deals_prod = false;
  }

  try {
    // Test deals_staging
    const testKey = `health:${Date.now()}`;
    await env.DEALS_STAGING.put(testKey, "test");
    const stagingValue = await env.DEALS_STAGING.get(testKey);
    await env.DEALS_STAGING.delete(testKey);
    stores.deals_staging = stagingValue === "test";
  } catch (error) {
    console.error("KV check failed for deals_staging:", error);
    stores.deals_staging = false;
  }

  try {
    // Test deals_log
    const testKey = `health:${Date.now()}`;
    await env.DEALS_LOG.put(testKey, "test");
    const logValue = await env.DEALS_LOG.get(testKey);
    await env.DEALS_LOG.delete(testKey);
    stores.deals_log = logValue === "test";
  } catch (error) {
    console.error("KV check failed for deals_log:", error);
    stores.deals_log = false;
  }

  try {
    // Test deals_lock
    const testKey = `health:${Date.now()}`;
    await env.DEALS_LOCK.put(testKey, "test");
    const lockValue = await env.DEALS_LOCK.get(testKey);
    await env.DEALS_LOCK.delete(testKey);
    stores.deals_lock = lockValue === "test";
  } catch (error) {
    console.error("KV check failed for deals_lock:", error);
    stores.deals_lock = false;
  }

  try {
    // Test deals_sources
    const testKey = `health:${Date.now()}`;
    await env.DEALS_SOURCES.put(testKey, "test");
    const sourcesValue = await env.DEALS_SOURCES.get(testKey);
    await env.DEALS_SOURCES.delete(testKey);
    stores.deals_sources = sourcesValue === "test";
  } catch (error) {
    console.error("KV check failed for deals_sources:", error);
    stores.deals_sources = false;
  }

  return stores;
}

/**
 * Check external service connectivity
 */
async function checkExternalServices(
  env: Env,
): Promise<HealthStatus["components"]["external_services"]> {
  const services: HealthStatus["components"]["external_services"] = {
    github_api: false,
  };

  // Check GitHub API if token is configured
  if (env.GITHUB_TOKEN) {
    try {
      const response = await fetch("https://api.github.com/rate_limit", {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      services.github_api = response.ok;
    } catch (error) {
      console.error("GitHub API check failed:", error);
      services.github_api = false;
    }
  } else {
    // If no token configured, mark as true (not required)
    services.github_api = true;
  }

  // Check Telegram API if configured
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`,
        { method: "POST" },
      );
      services.telegram_api = response.ok;
    } catch (error) {
      console.error("Telegram API check failed:", error);
      services.telegram_api = false;
    }
  }

  return services;
}

/**
 * Calculate health metrics from recent logs
 */
async function calculateHealthMetrics(
  env: Env,
): Promise<HealthStatus["metrics"]> {
  // Get logs from last 24 hours
  const logs = await getRecentLogs(env, 1000);
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentLogs = logs.filter((l) => new Date(l.ts) >= twentyFourHoursAgo);

  // Count runs (by unique run_id in finalize phase)
  const runIds = new Set<string>();
  recentLogs.forEach((l) => {
    if (l.phase === "finalize" || l.phase === "publish") {
      runIds.add(l.run_id);
    }
  });
  const totalRuns24h = runIds.size;

  // Calculate success rate
  const finalizeLogs = recentLogs.filter((l) => l.phase === "finalize");
  const successfulRuns = finalizeLogs.filter(
    (l) => l.status === "complete",
  ).length;
  const successRate24h =
    totalRuns24h > 0 ? (successfulRuns / totalRuns24h) * 100 : 100;

  // Calculate average deals per run
  const logsWithCandidates = recentLogs.filter(
    (l) => l.candidate_count !== undefined,
  );
  const avgDealsPerRun =
    logsWithCandidates.length > 0
      ? logsWithCandidates.reduce(
          (sum, l) => sum + (l.candidate_count || 0),
          0,
        ) / logsWithCandidates.length
      : 0;

  return {
    total_runs_24h: totalRuns24h,
    success_rate_24h: Math.round(successRate24h * 100) / 100,
    avg_deals_per_run: Math.round(avgDealsPerRun * 100) / 100,
  };
}

async function handleMetrics(
  env: Env,
  format: string = "prometheus",
): Promise<Response> {
  // Get recent pipeline metrics from KV storage
  const recentMetrics = await getRecentMetrics(env, 50);
  const aggregateStats = calculateAggregateStats(recentMetrics);
  const phaseTimingStats = getPhaseTimingStats(recentMetrics);

  // Get legacy log-based metrics for compatibility
  const snapshot = await getProductionSnapshot(env);
  const logs = await getRecentLogs(env, 1000);

  const runs = logs.filter((l) => l.phase === "finalize").length;
  const successes = logs.filter(
    (l) => l.phase === "publish" && l.status === "complete",
  ).length;
  const candidates = logs.reduce((sum, l) => sum + (l.candidate_count || 0), 0);
  const valid = logs.reduce((sum, l) => sum + (l.valid_count || 0), 0);
  const duplicates = logs.reduce((sum, l) => sum + (l.duplicate_count || 0), 0);

  // Circuit breaker metrics
  const cbMetrics = getAllCircuitBreakerMetrics();
  const cbSections: string[] = [];
  for (const [name, metrics] of Object.entries(cbMetrics)) {
    const prefix = name.replace(/[^a-zA-Z0-9]/g, "_");
    cbSections.push(`
# HELP circuit_${prefix}_total_calls Total calls for ${name}
# TYPE circuit_${prefix}_total_calls counter
circuit_${prefix}_total_calls ${metrics.totalCalls}

# HELP circuit_${prefix}_successful_calls Successful calls for ${name}
# TYPE circuit_${prefix}_successful_calls counter
circuit_${prefix}_successful_calls ${metrics.successfulCalls}

# HELP circuit_${prefix}_failed_calls Failed calls for ${name}
# TYPE circuit_${prefix}_failed_calls counter
circuit_${prefix}_failed_calls ${metrics.failedCalls}

# HELP circuit_${prefix}_rejected_calls Rejected calls (circuit open) for ${name}
# TYPE circuit_${prefix}_rejected_calls counter
circuit_${prefix}_rejected_calls ${metrics.rejectedCalls}

# HELP circuit_${prefix}_state_changes Circuit state changes for ${name}
# TYPE circuit_${prefix}_state_changes counter
circuit_${prefix}_state_changes ${metrics.stateChanges}`);
  }

  // Return JSON format if requested
  if (format === "json") {
    const jsonMetrics = {
      timestamp: new Date().toISOString(),
      summary: {
        total_runs: aggregateStats.total_runs,
        successful_runs: aggregateStats.successful_runs,
        failed_runs: aggregateStats.failed_runs,
        success_rate: aggregateStats.success_rate,
        avg_duration_ms: aggregateStats.avg_duration_ms,
        total_errors: aggregateStats.total_errors,
        total_retries: aggregateStats.total_retries,
      },
      deals: {
        active: snapshot?.stats.active || 0,
        discovered_total: candidates,
        validated_total: valid,
        duplicate_total: duplicates,
        avg_per_run: aggregateStats.avg_deals_per_run,
      },
      phase_timings: aggregateStats.avg_phase_timings,
      phase_timing_stats: phaseTimingStats,
      recent_runs: recentMetrics.slice(0, 10).map((m) => ({
        run_id: m.run_id,
        start_time: m.start_time,
        end_time: m.end_time,
        success: m.success,
        final_phase: m.final_phase,
        total_duration_ms: m.total_duration_ms,
        deals_processed: m.deals_processed,
        errors: m.errors,
        retries: m.retries,
      })),
      circuit_breakers: cbMetrics,
    };

    return jsonResponse(jsonMetrics);
  }

  // New comprehensive pipeline metrics (Prometheus format)
  const prometheusMetrics = formatMetricsForPrometheus(aggregateStats);

  // Phase timing percentiles
  const phaseTimingLines: string[] = [];
  for (const [phase, stats] of Object.entries(phaseTimingStats)) {
    phaseTimingLines.push(`
# HELP deals_pipeline_phase_timing_${phase}_ms Phase timing statistics for ${phase}
# TYPE deals_pipeline_phase_timing_${phase}_ms gauge
deals_pipeline_phase_timing_${phase}_ms{type="min"} ${stats.min}
deals_pipeline_phase_timing_${phase}_ms{type="max"} ${stats.max}
deals_pipeline_phase_timing_${phase}_ms{type="avg"} ${stats.avg}
deals_pipeline_phase_timing_${phase}_ms{type="p95"} ${stats.p95}`);
  }

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

${prometheusMetrics}

${phaseTimingLines.join("\n")}

${cbSections.join("\n")}
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
