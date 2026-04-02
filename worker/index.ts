import { executePipeline, getPipelineStatus } from "./state-machine";
import {
  getProductionSnapshot,
  getActiveDeals,
  getDealsByCode,
  writeStagingSnapshot,
  getStagingSnapshot,
} from "./lib/storage";
import {
  storeReferralInput,
  getReferralByCode,
  getReferralsByDomain,
  getReferralsByStatus,
  deactivateReferral,
  reactivateReferral,
  searchReferrals,
} from "./lib/referral-storage";
import {
  executeReferralResearch,
  convertResearchToReferrals,
  researchAllReferralPossibilities,
} from "./lib/research-agent";
import {
  appendLog,
  getRunLogs,
  getRecentLogs,
  exportLogsAsJSONL,
} from "./lib/logger";
import { logger, setLogContext } from "./lib/global-logger";
import { handleError } from "./lib/error-handler";
import { notify } from "./notify";
import { handleWebhookRoutes } from "./routes/webhooks";
import {
  handleEmailIncoming,
  handleEmailParse,
  handleEmailHelp,
} from "./routes/email";
import type {
  Env,
  GetDealsQuery,
  SubmitDealBody,
  HealthStatus,
  Deal,
  ReferralInput,
  ReferralDeactivateBody,
  ReferralSearchQuery,
  WebResearchRequest,
} from "./types";
import {
  GetDealsQuerySchema,
  SubmitDealBodySchema,
  ReferralInputSchema,
  ReferralDeactivateBodySchema,
  ReferralSearchQuerySchema,
  WebResearchRequestSchema,
} from "./types";
import { generateDealId } from "./lib/crypto";
import { CONFIG } from "./config";

// ============================================================================
// Main Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    setLogContext({ component: "http", path, method: request.method });

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
        // Validate content type
        const contentType = request.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          return jsonResponse(
            { error: "Content-Type must be application/json" },
            415,
          );
        }

        // Validate body size (1MB limit)
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > 1024 * 1024) {
          return jsonResponse({ error: "Request body too large" }, 413);
        }

        const body = (await request.json()) as Record<string, unknown>;
        return handleSubmit(body as SubmitDealBody, env);
      }

      // Referral management API endpoints
      if (path === "/api/referrals" && request.method === "GET") {
        return handleGetReferrals(url, env);
      }

      if (path === "/api/referrals" && request.method === "POST") {
        return handleCreateReferral(request, env);
      }

      if (path.startsWith("/api/referrals/") && request.method === "GET") {
        const code = path.replace("/api/referrals/", "").split("/")[0];
        return handleGetReferralByCode(code, env);
      }

      if (
        path.startsWith("/api/referrals/") &&
        path.endsWith("/deactivate") &&
        request.method === "POST"
      ) {
        const code = path
          .replace("/api/referrals/", "")
          .replace("/deactivate", "")
          .split("/")[0];
        return handleDeactivateReferral(request, code, env);
      }

      if (
        path.startsWith("/api/referrals/") &&
        path.endsWith("/reactivate") &&
        request.method === "POST"
      ) {
        const code = path
          .replace("/api/referrals/", "")
          .replace("/reactivate", "")
          .split("/")[0];
        return handleReactivateReferral(code, env);
      }

      if (path === "/api/research" && request.method === "POST") {
        return handleResearch(request, env);
      }

      if (path.startsWith("/api/research/") && request.method === "GET") {
        const domain = path.replace("/api/research/", "").split("/")[0];
        return handleGetResearchResults(domain, env);
      }

      // Webhook routes
      if (path.startsWith("/webhooks/")) {
        const webhookResponse = await handleWebhookRoutes(request, env, path);
        if (webhookResponse) return webhookResponse;
      }

      // Email routes
      if (path === "/api/email/incoming" && request.method === "POST") {
        return handleEmailIncoming(request, env);
      }

      if (path === "/api/email/parse" && request.method === "POST") {
        return handleEmailParse(request, env);
      }

      if (path === "/api/email/help" && request.method === "GET") {
        return handleEmailHelp();
      }

      // 404
      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      const err = handleError(error, { component: "http", path });
      return jsonResponse(
        { error: "Internal server error", class: err.errorClass },
        500,
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    logger.info("Scheduled event triggered", { component: "scheduler" });

    try {
      const result = await executePipeline(env);

      if (result.success) {
        logger.info("Pipeline completed successfully", {
          component: "scheduler",
        });
      } else {
        logger.error(`Pipeline failed at ${result.phase}: ${result.error}`, {
          component: "scheduler",
        });
      }
    } catch (error) {
      handleError(error, { component: "scheduler", phase: "init" });

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
// Referral Management Handlers
// ============================================================================

async function handleGetReferrals(url: URL, env: Env): Promise<Response> {
  try {
    const query: ReferralSearchQuery = {
      domain: url.searchParams.get("domain") || undefined,
      status:
        (url.searchParams.get("status") as ReferralSearchQuery["status"]) ||
        "all",
      category: url.searchParams.get("category") || undefined,
      source:
        (url.searchParams.get("source") as ReferralSearchQuery["source"]) ||
        "all",
      limit: url.searchParams.has("limit")
        ? parseInt(url.searchParams.get("limit")!, 10)
        : 100,
      offset: url.searchParams.has("offset")
        ? parseInt(url.searchParams.get("offset")!, 10)
        : 0,
    };

    const validation = ReferralSearchQuerySchema.safeParse(query);
    if (!validation.success) {
      return jsonResponse(
        { error: "Invalid query parameters", details: validation.error.errors },
        400,
      );
    }

    const { referrals, total } = await searchReferrals(env, query);

    return jsonResponse({
      referrals,
      total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetReferrals",
    });
    return jsonResponse(
      { error: "Failed to retrieve referrals", message: err.message },
      500,
    );
  }
}

async function handleCreateReferral(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Validate content type
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type must be application/json" },
        415,
      );
    }

    // Validate body size
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Validate required fields
    const code = body.code as string;
    const url = body.url as string;
    const domain = body.domain as string;

    if (!code || !url || !domain) {
      return jsonResponse(
        { error: "Missing required fields: code, url, domain" },
        400,
      );
    }

    // Check if code already exists
    const existing = await getReferralByCode(env, code);
    if (existing) {
      return jsonResponse(
        {
          error: "Referral code already exists",
          existing_id: existing.id,
        },
        409,
      );
    }

    // Generate referral ID
    const id = await generateDealId(
      (body.source as string) || "api",
      code,
      "referral",
    );
    const now = new Date().toISOString();

    // Create referral input
    const bodyMetadata = (body.metadata as Record<string, unknown>) || {};
    const referral: ReferralInput = {
      id,
      code,
      url,
      domain,
      source: (body.source as ReferralInput["source"]) || "api",
      status: "quarantined", // Start as quarantined for review
      submitted_at: now,
      submitted_by: (body.submitted_by as string) || "api",
      expires_at: body.expires_at as string | undefined,
      metadata: {
        title: (bodyMetadata.title as string) || `${domain} Referral`,
        description:
          (bodyMetadata.description as string) || `Referral code for ${domain}`,
        reward_type:
          (bodyMetadata.reward_type as ReferralInput["metadata"]["reward_type"]) ||
          "unknown",
        reward_value: bodyMetadata.reward_value as string | number | undefined,
        currency: bodyMetadata.currency as string | undefined,
        category: (bodyMetadata.category as string[]) || ["general"],
        tags: (bodyMetadata.tags as string[]) || ["api-added"],
        requirements: (bodyMetadata.requirements as string[]) || [],
        confidence_score: (bodyMetadata.confidence_score as number) || 0.5,
        notes: bodyMetadata.notes as string | undefined,
      },
    };

    // Validate with schema
    const validation = ReferralInputSchema.safeParse(referral);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Validation failed",
          details: validation.error.errors,
        },
        400,
      );
    }

    // Store referral
    await storeReferralInput(env, referral);

    logger.info(`Referral created: ${referral.code} for ${referral.domain}`, {
      component: "api",
      referral_id: referral.id,
    });

    return jsonResponse(
      {
        success: true,
        message: "Referral created successfully",
        referral: {
          id: referral.id,
          code: referral.code,
          url: referral.url,
          domain: referral.domain,
          status: referral.status,
        },
      },
      201,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleCreateReferral",
    });
    return jsonResponse(
      { error: "Failed to create referral", message: err.message },
      500,
    );
  }
}

async function handleGetReferralByCode(
  code: string,
  env: Env,
): Promise<Response> {
  try {
    const referral = await getReferralByCode(env, code);

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404);
    }

    return jsonResponse({ referral });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetReferralByCode",
    });
    return jsonResponse(
      { error: "Failed to retrieve referral", message: err.message },
      500,
    );
  }
}

async function handleDeactivateReferral(
  request: Request,
  code: string,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as ReferralDeactivateBody;

    const validation = ReferralDeactivateBodySchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Invalid request body",
          details: validation.error.errors,
        },
        400,
      );
    }

    const referral = await deactivateReferral(
      env,
      code,
      body.reason,
      body.replaced_by,
      body.notes,
    );

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404);
    }

    logger.info(`Referral deactivated: ${code}`, {
      component: "api",
      reason: body.reason,
    });

    // Send notification
    await notify(env, {
      type: "trust_anomaly",
      severity: "info",
      run_id: `deactivate-${Date.now()}`,
      message: `Referral code ${code} deactivated: ${body.reason}`,
    });

    return jsonResponse({
      success: true,
      message: "Referral deactivated successfully",
      referral: {
        id: referral.id,
        code: referral.code,
        url: referral.url,
        domain: referral.domain,
        status: referral.status,
        deactivated_at: referral.deactivated_at,
        reason: referral.deactivated_reason,
      },
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleDeactivateReferral",
    });
    return jsonResponse(
      { error: "Failed to deactivate referral", message: err.message },
      500,
    );
  }
}

async function handleReactivateReferral(
  code: string,
  env: Env,
): Promise<Response> {
  try {
    const referral = await reactivateReferral(env, code);

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404);
    }

    logger.info(`Referral reactivated: ${code}`, {
      component: "api",
    });

    return jsonResponse({
      success: true,
      message: "Referral reactivated successfully",
      referral: {
        id: referral.id,
        code: referral.code,
        url: referral.url,
        domain: referral.domain,
        status: referral.status,
      },
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleReactivateReferral",
    });
    return jsonResponse(
      { error: "Failed to reactivate referral", message: err.message },
      500,
    );
  }
}

async function handleResearch(request: Request, env: Env): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type must be application/json" },
        415,
      );
    }

    const body = (await request.json()) as WebResearchRequest;

    const validation = WebResearchRequestSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Invalid request body",
          details: validation.error.errors,
        },
        400,
      );
    }

    // Execute research
    const researchResult = await executeReferralResearch(env, body);

    // Convert discovered codes to referrals
    const referrals = await convertResearchToReferrals(
      env,
      researchResult,
      0.5,
    );

    logger.info(`Research completed for ${body.query}`, {
      component: "api",
      discovered_count: researchResult.discovered_codes.length,
      stored_count: referrals.length,
    });

    return jsonResponse({
      success: true,
      message: "Research completed",
      query: body.query,
      domain: body.domain,
      discovered_codes: researchResult.discovered_codes.length,
      stored_referrals: referrals.length,
      research_metadata: researchResult.research_metadata,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleResearch",
    });
    return jsonResponse(
      { error: "Research failed", message: err.message },
      500,
    );
  }
}

async function handleGetResearchResults(
  domain: string,
  env: Env,
): Promise<Response> {
  try {
    const researchResult = await researchAllReferralPossibilities(
      env,
      domain,
      "thorough",
    );

    return jsonResponse({
      domain,
      discovered_codes: researchResult.discovered_codes,
      research_metadata: researchResult.research_metadata,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetResearchResults",
    });
    return jsonResponse(
      { error: "Failed to get research results", message: err.message },
      500,
    );
  }
}

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
