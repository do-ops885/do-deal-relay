import type { Env } from "../types";
import { checkBodySize } from "../middleware/body-limit";
import { withAuth } from "../lib/auth";
import { createRateLimitMiddleware } from "../lib/rate-limit";
import {
  handleHealth,
  handleReady,
  handleLive,
  handleMetrics,
  handleGetDeals,
  handleDiscover,
  handleStatus,
  handleGetLogs,
  handleSubmit,
  handleRankedDeals,
  handleDealHighlights,
  handleSimilarDeals,
  handleExplainDeal,
  handleAnalytics,
  handleDORAMetrics,
} from "../routes/core";
import {
  handleGetReferrals,
  handleCreateReferral,
  handleGetReferralByCode,
  handleDeactivateReferral,
  handleReactivateReferral,
} from "../routes/referrals";
import {
  handleResearch,
  handleGetResearchResults,
} from "../routes/referral-research";
import {
  handleMCPRequest,
  handleMCPListTools,
  handleMCPCall,
  handleMCPInfo,
} from "../routes/mcp";
import {
  handleValidateUrl,
  handleValidateBatch,
  handleGetValidationStats,
  handleValidateDeal,
} from "../routes/validation";
import {
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
} from "../routes/admin/keys";
import {
  handleRegister,
  handleLogin,
  handleRefreshToken,
  handleGetCurrentUser,
  handleUpdateProfile,
  handleListUsers,
} from "../routes/auth";
import { handleD1Request } from "../routes/d1";
import { handleNLQRequest } from "../routes/nlq/index";
import { handleWebhookRoutes } from "../routes/webhooks/index";
import { handleSemanticSearch } from "../routes/semantic-search";
import {
  handleSubmitExperience,
  handleGetExperience,
  handleRunAggregation,
} from "../routes/experience";
import {
  handleEmailIncoming,
  handleEmailParse,
  handleEmailHelp,
} from "../routes/email";

/**
 * Legacy (pre-pipeline) per-route dispatch. Kept incrementally migrated to
 * the ADR-016 middleware pipeline; this catch-all preserves the original
 * if/else ladder so existing clients are unaffected.
 *
 * Returns the matching Response, or `null` if no legacy route matched
 * (the caller should then return 404).
 */
export async function tryHandleLegacyRoutes(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  path: string,
): Promise<Response | null> {
  // Health checks (kept as fallback; primary routes now in pipeline)
  if (path === "/health") return handleHealth(env, request);
  if (path === "/health/ready") return handleReady(env, request);
  if (path === "/health/live") return handleLive(env, request);

  // Auth & User Management
  if (path === "/api/auth/register" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/auth/register");
    return rateLimiter(request, () => handleRegister(request, env));
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/auth/login");
    return rateLimiter(request, () => handleLogin(request, env));
  }
  if (path === "/api/auth/refresh" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/auth/refresh");
    return rateLimiter(request, () => handleRefreshToken(request, env));
  }
  if (path === "/api/auth/me" && request.method === "GET") {
    return withAuth(request, env, undefined, (auth) =>
      handleGetCurrentUser(auth, request, env),
    );
  }
  if (path === "/api/auth/me" && request.method === "PUT") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) =>
      handleUpdateProfile(auth, request, env),
    );
  }

  // Admin: User management
  if (path === "/api/admin/users" && request.method === "GET") {
    return withAuth(request, env, "admin", (auth) =>
      handleListUsers(auth, request, env),
    );
  }

  // Metrics
  if (path === "/metrics") {
    return withAuth(request, env, "admin", () => {
      const format = url.searchParams.get("format") || "prometheus";
      return handleMetrics(env, format, request);
    });
  }

  // Deals
  if (path === "/deals" || path === "/deals.json") {
    return withAuth(request, env, undefined, (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/deals", auth);
      return rateLimiter(request, () => handleGetDeals(url, env, request));
    });
  }
  if (path === "/deals/ranked") {
    return withAuth(request, env, undefined, (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/deals", auth);
      return rateLimiter(request, () => handleRankedDeals(url, env));
    });
  }
  if (path === "/deals/highlights") {
    return withAuth(request, env, undefined, (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/deals", auth);
      return rateLimiter(request, () => handleDealHighlights(url, env));
    });
  }
  if (path === "/deals/similar") {
    return withAuth(request, env, undefined, (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/deals", auth);
      return rateLimiter(request, () => handleSimilarDeals(url, env));
    });
  }

  // Pipeline API
  if (path === "/api/discover" && request.method === "POST") {
    return withAuth(request, env, "admin", (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/api/discover", auth);
      return rateLimiter(request, () => handleDiscover(env, request, ctx));
    });
  }
  if (path === "/api/status") {
    return withAuth(request, env, "admin", () => handleStatus(env, request));
  }
  if (path === "/api/log") {
    return withAuth(request, env, "admin", () =>
      handleGetLogs(url, env, request),
    );
  }
  if (path === "/api/analytics") {
    return withAuth(request, env, "admin", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/analytics",
        auth,
      );
      return rateLimiter(request, () => handleAnalytics(url, env, request));
    });
  }

  // DORA Metrics (also exposed at /dora alias for human-readability)
  if ((path === "/api/dora-metrics" || path === "/dora") && request.method === "GET") {
    return withAuth(request, env, "admin", () =>
      handleDORAMetrics(url, env, request),
    );
  }

  // Deal Submission
  if (path === "/api/submit" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 10 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/api/submit", auth);
      return rateLimiter(request, () => handleSubmit(request, env));
    });
  }

  // Referral Action Routes (deactivate/reactivate) — registered before
  // /api/referrals/<code> to avoid being shadowed by it.
  const referralActionMatch = path.match(
    /^\/api\/referrals\/([^/]+)\/(deactivate|reactivate)$/,
  );
  if (referralActionMatch && request.method === "POST") {
    const code = referralActionMatch[1];
    const action = referralActionMatch[2];

    if (code && action === "deactivate") {
      return withAuth(request, env, "user", () =>
        handleDeactivateReferral(request, code, env),
      );
    }
    if (code && action === "reactivate") {
      return withAuth(request, env, "user", () =>
        handleReactivateReferral(code, env),
      );
    }
  }

  // Referral API
  if (path === "/api/referrals") {
    if (request.method === "GET") {
      return withAuth(request, env, undefined, () =>
        handleGetReferrals(url, env),
      );
    }
    if (request.method === "POST") {
      const bodyTooLarge = checkBodySize(request, 5 * 1024);
      if (bodyTooLarge) return bodyTooLarge;
      return withAuth(request, env, "user", () =>
        handleCreateReferral(request, env),
      );
    }
  }

  // Referral Detail Route (GET by code)
  const referralDetailMatch = path.match(/^\/api\/referrals\/([^/]+)$/);
  if (referralDetailMatch && request.method === "GET") {
    const code = referralDetailMatch[1];
    if (code) {
      return withAuth(request, env, undefined, () =>
        handleGetReferralByCode(code, env, request),
      );
    }
  }

  // Research API
  if (path === "/api/research" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 10 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/api/research", auth);
      return rateLimiter(request, () => handleResearch(request, env));
    });
  }

  // Research results API
  if (path.startsWith("/api/research/") && request.method === "GET") {
    const domain = path.replace("/api/research/", "");
    return withAuth(request, env, undefined, () =>
      handleGetResearchResults(domain, env),
    );
  }

  // Semantic search (Vectorize + Workers AI)
  if (path === "/api/semantic-search" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/semantic-search",
        auth,
      );
      return rateLimiter(request, () => handleSemanticSearch(request, env));
    });
  }

  // Validation API
  if (path === "/api/validate/url" && request.method === "POST") {
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/validate/url",
        auth,
      );
      return rateLimiter(request, () => handleValidateUrl(request, env, auth));
    });
  }
  if (path === "/api/validate/batch" && request.method === "POST") {
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/validate/batch",
        auth,
      );
      return rateLimiter(request, () =>
        handleValidateBatch(request, env, auth),
      );
    });
  }
  if (path === "/api/validation/stats" && request.method === "GET") {
    return withAuth(request, env, "admin", () =>
      handleGetValidationStats(env, request),
    );
  }

  const dealExplainMatch = path.match(/^\/api\/deals\/([^/]+)\/explain$/);
  if (dealExplainMatch && request.method === "GET") {
    const dealId = dealExplainMatch[1];
    if (dealId) {
      return withAuth(request, env, undefined, () =>
        handleExplainDeal(dealId, env, request),
      );
    }
  }

  const dealValidateMatch = path.match(/^\/api\/deals\/([^/]+)\/validate$/);
  if (dealValidateMatch && request.method === "POST") {
    const code = dealValidateMatch[1];
    if (code) {
      return withAuth(request, env, "user", (auth) =>
        handleValidateDeal(request, code, env, auth),
      );
    }
  }

  // MCP (Model Context Protocol) Endpoints - 2025-11-25 Specification
  if (path === "/mcp") {
    const bodyTooLarge = checkBodySize(request, 10 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", () => handleMCPRequest(request, env));
  }

  // Legacy MCP v1 Endpoints (for backwards compatibility)
  if (path === "/mcp/v1/tools/list" && request.method === "POST") {
    return withAuth(request, env, "user", () =>
      handleMCPListTools(env, request),
    );
  }
  if (path === "/mcp/v1/tools/call" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 10 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/mcp/v1/tools/call",
        auth,
      );
      return rateLimiter(request, () => handleMCPCall(request, env));
    });
  }
  if (path === "/mcp/v1/info") {
    return withAuth(request, env, "user", () => handleMCPInfo(env, request));
  }

  // D1 Database API endpoints
  if (path.startsWith("/api/d1/")) {
    return withAuth(request, env, "admin", () =>
      handleD1Request(request, url, env),
    );
  }

  // NLQ (Natural Language Query) API endpoints
  if (path.startsWith("/api/nlq")) {
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/api/nlq", auth);
      return rateLimiter(request, () => handleNLQRequest(request, url, env));
    });
  }

  // Webhook routes
  const webhookPath = path.startsWith("/api") ? path.slice(4) : path;
  const webhookResponse = await handleWebhookRoutes(request, env, webhookPath);
  if (webhookResponse) return webhookResponse;

  // Experience Feedback API
  if (path === "/api/experience" && request.method === "POST") {
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/experience",
        auth,
      );
      return rateLimiter(request, () => handleSubmitExperience(request, env));
    });
  }

  const experienceMatch = path.match(/^\/api\/experience\/([^/]+)$/);
  if (experienceMatch && request.method === "GET") {
    const experienceId = experienceMatch[1];
    if (experienceId) {
      return withAuth(request, env, undefined, () =>
        handleGetExperience(experienceId, env),
      );
    }
  }

  if (path === "/api/experience/aggregate" && request.method === "POST") {
    return withAuth(request, env, "admin", () =>
      handleRunAggregation(env, request),
    );
  }

  // Email API
  if (path === "/api/email/incoming" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 100 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/email/incoming");
    return rateLimiter(request, () => handleEmailIncoming(request, env));
  }
  if (path === "/api/email/parse" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 10 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/email/parse",
        auth,
      );
      return rateLimiter(request, () => handleEmailParse(request, env));
    });
  }
  if (path === "/api/email/help" && request.method === "GET") {
    return withAuth(request, env, undefined, () => handleEmailHelp());
  }

  // Admin API Key Management
  if (path === "/api/admin/keys") {
    if (request.method === "POST") {
      return withAuth(request, env, "admin", () =>
        handleCreateApiKey(request, env),
      );
    }
    if (request.method === "GET") {
      return withAuth(request, env, "admin", () =>
        handleListApiKeys(request, env),
      );
    }
  }

  const apiKeyRevokeMatch = path.match(/^\/api\/admin\/keys\/([^/]+)$/);
  if (apiKeyRevokeMatch && request.method === "DELETE") {
    const hash = apiKeyRevokeMatch[1];
    if (hash) {
      return withAuth(request, env, "admin", () =>
        handleRevokeApiKey(request, hash, env),
      );
    }
  }

  // No legacy route matched.
  return null;
}
