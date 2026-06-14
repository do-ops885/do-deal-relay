import type { Env } from "./types";
import { logger } from "./lib/global-logger";
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
} from "./routes/core";
import {
  handleGetReferrals,
  handleCreateReferral,
  handleGetReferralByCode,
  handleDeactivateReferral,
  handleReactivateReferral,
} from "./routes/referrals";
import {
  handleResearch,
  handleGetResearchResults,
} from "./routes/referral-research";
import { jsonResponse } from "./routes/utils";
import {
  handleMCPRequest,
  handleMCPListTools,
  handleMCPCall,
  handleMCPInfo,
} from "./routes/mcp";
import {
  handleValidateUrl,
  handleValidateBatch,
  handleGetValidationStats,
  handleValidateDeal,
} from "./routes/validation";
import {
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
} from "./routes/admin/keys";
import { withAuth } from "./lib/auth";
import { createRateLimitMiddleware } from "./lib/rate-limit";
import { handleD1Request } from "./routes/d1";
import { handleNLQRequest } from "./routes/nlq/index";
import { handleWebhookRoutes } from "./routes/webhooks";
import { handleSemanticSearch } from "./routes/semantic-search";
import {
  handleSubmitExperience,
  handleGetExperience,
  handleRunAggregation,
} from "./routes/experience";
import {
  handleEmailIncoming,
  handleEmailParse,
  handleEmailHelp,
} from "./routes/email";

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Health checks
    if (path === "/health") return handleHealth(env, request);
    if (path === "/health/ready") return handleReady(env, request);
    if (path === "/health/live") return handleLive(env, request);

    // Metrics
    if (path === "/metrics") {
      return withAuth(request, env, "admin", () => {
        const format = url.searchParams.get("format") || "prometheus";
        return handleMetrics(env, format, request);
      });
    }

    // Deals
    if (path === "/deals" || path === "/deals.json") {
      return withAuth(request, env, undefined, () =>
        handleGetDeals(url, env, request),
      );
    }
    if (path === "/deals/ranked") {
      return withAuth(request, env, undefined, () =>
        handleRankedDeals(url, env),
      );
    }
    if (path === "/deals/highlights") {
      return withAuth(request, env, undefined, () =>
        handleDealHighlights(url, env),
      );
    }
    if (path === "/deals/similar") {
      return withAuth(request, env, undefined, () =>
        handleSimilarDeals(url, env),
      );
    }

    // Pipeline API
    if (path === "/api/discover" && request.method === "POST") {
      return withAuth(request, env, "admin", (auth) => {
        const rateLimiter = createRateLimitMiddleware(
          env,
          "/api/discover",
          auth,
        );
        return rateLimiter(request, () => handleDiscover(env, request));
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
      return withAuth(request, env, "admin", () =>
        handleAnalytics(url, env, request),
      );
    }

    // Deal Submission
    if (path === "/api/submit" && request.method === "POST") {
      return withAuth(request, env, "user", (auth) => {
        const rateLimiter = createRateLimitMiddleware(env, "/api/submit", auth);
        return rateLimiter(request, () => handleSubmit(request, env));
      });
    }

    // Referral Action Routes (deactivate/reactivate) - Moved up to avoid shadowing
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
      return withAuth(request, env, "user", (auth) => {
        const rateLimiter = createRateLimitMiddleware(
          env,
          "/api/research",
          auth,
        );
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
      return withAuth(request, env, "user", () =>
        handleSemanticSearch(request, env),
      );
    }

    // Validation API
    if (path === "/api/validate/url" && request.method === "POST") {
      return withAuth(request, env, "user", (auth) =>
        handleValidateUrl(request, env, auth),
      );
    }
    if (path === "/api/validate/batch" && request.method === "POST") {
      return withAuth(request, env, "user", (auth) =>
        handleValidateBatch(request, env, auth),
      );
    }
    if (path === "/api/validation/stats" && request.method === "GET") {
      return withAuth(request, env, "admin", () =>
        handleGetValidationStats(env, request),
      );
    }

    const dealExplainMatch = path.match(/^\/api\/deals\/([^/]+)\/explain$/);
    if (dealExplainMatch && request.method === "GET") {
      const dealId = dealExplainMatch[1] ?? "";
      return withAuth(request, env, undefined, () =>
        handleExplainDeal(dealId, env, request),
      );
    }

    const dealValidateMatch = path.match(/^\/api\/deals\/([^/]+)\/validate$/);
    if (dealValidateMatch && request.method === "POST") {
      const code = dealValidateMatch[1] ?? "";
      return withAuth(request, env, "user", (auth) =>
        handleValidateDeal(request, code, env, auth),
      );
    }

    // MCP (Model Context Protocol) Endpoints - 2025-11-25 Specification
    if (path === "/mcp") {
      return withAuth(request, env, "user", () =>
        handleMCPRequest(request, env),
      );
    }

    // Legacy MCP v1 Endpoints (for backwards compatibility)
    if (path === "/mcp/v1/tools/list" && request.method === "POST") {
      return withAuth(request, env, "user", () =>
        handleMCPListTools(env, request),
      );
    }
    if (path === "/mcp/v1/tools/call" && request.method === "POST") {
      return withAuth(request, env, "user", () => handleMCPCall(request, env));
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
      return withAuth(request, env, "user", () =>
        handleNLQRequest(request, url, env),
      );
    }

    // Webhook routes
    const webhookPath = path.startsWith("/api") ? path.slice(4) : path;
    const webhookResponse = await handleWebhookRoutes(
      request,
      env,
      webhookPath,
    );
    if (webhookResponse) return webhookResponse;

    // Experience Feedback API
    if (path === "/api/experience" && request.method === "POST") {
      return withAuth(request, env, "user", () =>
        handleSubmitExperience(request, env),
      );
    }

    const experienceMatch = path.match(/^\/api\/experience\/([^/]+)$/);
    if (experienceMatch && request.method === "GET") {
      if (experienceMatch[1] !== undefined)
        return withAuth(request, env, undefined, () =>
          handleGetExperience(experienceMatch[1]!, env),
        );
    }

    if (path === "/api/experience/aggregate" && request.method === "POST") {
      return withAuth(request, env, "admin", () =>
        handleRunAggregation(env, request),
      );
    }

    // Email API
    if (path === "/api/email/incoming" && request.method === "POST") {
      return handleEmailIncoming(request, env);
    }
    if (path === "/api/email/parse" && request.method === "POST") {
      return withAuth(request, env, "user", () =>
        handleEmailParse(request, env),
      );
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

    // 404
    return jsonResponse({ error: "Not found" }, 404, request, env);
  } catch (error) {
    logger.error("Request handler error:", {
      component: "router",
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
      request,
      env,
    );
  }
}
