import { executePipeline } from "./state-machine";
import { notify } from "./notify";
import { setGitHubToken, initGitHubCircuitBreaker } from "./lib/github/index";
import type { Env, SubmitDealBody } from "./types";
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
  handleAnalytics,
} from "./routes/core";
import {
  handleGetReferrals,
  handleCreateReferral,
  handleGetReferralByCode,
  handleDeactivateReferral,
  handleReactivateReferral,
  handleResearch,
  handleGetResearchResults,
} from "./routes/referrals";
import { jsonResponse, unauthorizedResponse } from "./routes/utils";
import { createAuthMiddleware } from "./lib/auth";
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
import { checkDealExpirations, runFullValidationSweep } from "./lib/expiration";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitMiddleware,
} from "./lib/rate-limit";
import { handleD1Request } from "./routes/d1";
import { handleNLQRequest } from "./routes/nlq/index";
import { handleWebhookRoutes } from "./routes/webhooks";
import { logger } from "./lib/global-logger";
import {
  handleSubmitExperience,
  handleGetExperience,
  handleRunAggregation,
} from "./routes/experience";
import { runAggregation } from "./lib/d1/experience";
import {
  handleEmailIncoming,
  handleEmailParse,
  handleEmailHelp,
} from "./routes/email";

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
      // Health checks
      if (path === "/health") return handleHealth(env);
      if (path === "/health/ready") return handleReady(env);
      if (path === "/health/live") return handleLive(env);

      // Metrics
      if (path === "/metrics") {
        const format = url.searchParams.get("format") || "prometheus";
        return handleMetrics(env, format);
      }

      // Deals
      if (path === "/deals" || path === "/deals.json") {
        return handleGetDeals(url, env);
      }
      if (path === "/deals/ranked") {
        return handleRankedDeals(url, env);
      }
      if (path === "/deals/highlights") {
        return handleDealHighlights(url, env);
      }
      if (path === "/deals/similar") {
        return handleSimilarDeals(url, env);
      }

      // Pipeline API
      if (path === "/api/discover" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env, "admin");
        const rateLimiter = createRateLimitMiddleware(env, "/api/discover");
        return authMiddleware(request, () =>
          rateLimiter(request, () => handleDiscover(env)),
        );
      }
      if (path === "/api/status") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleStatus(env));
      }
      if (path === "/api/log") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleGetLogs(url, env));
      }
      if (path === "/api/analytics") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleAnalytics(url, env));
      }

      // Deal Submission
      if (path === "/api/submit" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        const rateLimiter = createRateLimitMiddleware(env, "/api/submit");
        return authMiddleware(request, () =>
          rateLimiter(request, () => handleSubmit(request, env)),
        );
      }

      // Referral API
      if (path === "/api/referrals") {
        if (request.method === "GET") return handleGetReferrals(url, env);
        if (request.method === "POST") {
          const authMiddleware = createAuthMiddleware(env);
          return authMiddleware(request, () =>
            handleCreateReferral(request, env),
          );
        }
      }

      const referralMatch = path.match(
        /^\/api\/referrals\/([^/]+)(?:\/(deactivate|reactivate))?$/,
      );
      if (referralMatch) {
        const code = referralMatch[1];
        const action = referralMatch[2];
        if (action === "deactivate" && request.method === "POST") {
          const authMiddleware = createAuthMiddleware(env);
          return authMiddleware(request, () =>
            handleDeactivateReferral(request, code, env),
          );
        }
        if (action === "reactivate" && request.method === "POST") {
          const authMiddleware = createAuthMiddleware(env);
          return authMiddleware(request, () =>
            handleReactivateReferral(code, env),
          );
        }
        if (request.method === "GET") return handleGetReferralByCode(code, env);
      }

      // Research API
      if (path === "/api/research" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        const rateLimiter = createRateLimitMiddleware(env, "/api/research");
        return authMiddleware(request, () =>
          rateLimiter(request, () => handleResearch(request, env)),
        );
      }

      // Research results API
      if (path.startsWith("/api/research/") && request.method === "GET") {
        const domain = path.replace("/api/research/", "");
        return handleGetResearchResults(domain, env);
      }

      // Validation API
      if (path === "/api/validate/url" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleValidateUrl(request, env));
      }
      if (path === "/api/validate/batch" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleValidateBatch(request, env));
      }
      if (path === "/api/validation/stats" && request.method === "GET") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleGetValidationStats(env));
      }

      const dealValidateMatch = path.match(/^\/api\/deals\/([^/]+)\/validate$/);
      if (dealValidateMatch && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        const code = dealValidateMatch[1];
        return authMiddleware(request, () =>
          handleValidateDeal(request, code, env),
        );
      }

      // MCP (Model Context Protocol) Endpoints - 2025-11-25 Specification
      if (path === "/mcp") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleMCPRequest(request, env));
      }

      // Legacy MCP v1 Endpoints (for backwards compatibility)
      if (path === "/mcp/v1/tools/list" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleMCPListTools(env));
      }
      if (path === "/mcp/v1/tools/call" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleMCPCall(request, env));
      }
      if (path === "/mcp/v1/info") {
        return handleMCPInfo(env);
      }

      // D1 Database API endpoints
      if (path.startsWith("/api/d1/")) {
        return handleD1Request(request, url, env);
      }

      // NLQ (Natural Language Query) API endpoints
      if (path.startsWith("/api/nlq")) {
        return handleNLQRequest(request, url, env);
      }

      // Webhook routes
      const webhookResponse = await handleWebhookRoutes(request, env, path);
      if (webhookResponse) return webhookResponse;

      // Experience Feedback API
      if (path === "/api/experience" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () =>
          handleSubmitExperience(request, env),
        );
      }

      const experienceMatch = path.match(/^\/api\/experience\/([^/]+)$/);
      if (experienceMatch && request.method === "GET") {
        return handleGetExperience(experienceMatch[1], env);
      }

      if (path === "/api/experience/aggregate" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env, "admin");
        return authMiddleware(request, () => handleRunAggregation(env));
      }

      // Email API
      if (path === "/api/email/incoming" && request.method === "POST") {
        return handleEmailIncoming(request, env);
      }
      if (path === "/api/email/parse" && request.method === "POST") {
        const authMiddleware = createAuthMiddleware(env);
        return authMiddleware(request, () => handleEmailParse(request, env));
      }
      if (path === "/api/email/help" && request.method === "GET") {
        return handleEmailHelp();
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
    const cron = event.cron;
    const timestamp = new Date().toISOString();

    logger.info(`Scheduled event triggered: ${cron}`, {
      component: "scheduled",
      cron,
      timestamp,
    });

    try {
      // Daily cron job at 9am - expiration checks and experience aggregation
      if (cron === "0 9 * * *") {
        logger.info("Running daily expiration check", {
          component: "scheduled",
        });

        const result = await checkDealExpirations(env);

        logger.info("Daily expiration check completed", {
          component: "scheduled",
          expiringFound: result.expiringFound,
          expiredMarked: result.expiredMarked,
          notificationsSent: result.notificationsSent,
        });

        logger.info("Running daily experience aggregation", {
          component: "scheduled",
        });

        const aggResult = await runAggregation(env.DEALS_DB!);

        logger.info("Daily experience aggregation completed", {
          component: "scheduled",
          dealsProcessed: aggResult.dealsProcessed,
          eventsProcessed: aggResult.eventsProcessed,
        });

        return;
      }

      // Weekly cron job - full validation sweep
      if (cron === "0 0 * * 0") {
        logger.info("Running weekly full validation sweep", {
          component: "scheduled",
        });

        const result = await runFullValidationSweep(env);

        logger.info("Weekly validation sweep completed", {
          component: "scheduled",
          validated: result.validated,
          deactivated: result.deactivated,
          expiringNotified: result.expiringNotified,
          errors: result.errors.length,
        });

        if (result.errors.length > 0) {
          await notify(env, {
            type: "system_error",
            severity: "warning",
            run_id: `weekly-validation-${Date.now()}`,
            message: `Weekly validation completed with ${result.errors.length} errors`,
            context: {
              errors: result.errors,
              validated: result.validated,
              deactivated: result.deactivated,
            },
          });
        }

        return;
      }

      // Default pipeline execution (every 6 hours)
      logger.info("Running pipeline execution", {
        component: "scheduled",
      });

      const result = await executePipeline(env);
      if (!result.success) {
        console.error(`Pipeline failed at ${result.phase}: ${result.error}`);
        await notify(env, {
          type: "system_error",
          severity: "critical",
          run_id: `pipeline-${Date.now()}`,
          message: `Pipeline failed at ${result.phase}: ${result.error}`,
          context: {
            phase: result.phase,
            error: result.error,
          },
        });
      } else {
        logger.info("Pipeline execution completed successfully", {
          component: "scheduled",
          phase: result.phase,
        });
      }
    } catch (error) {
      console.error("Scheduled execution error:", error);
      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: "scheduled",
        message: `Scheduled execution failed: ${(error as Error).message}`,
        context: {
          cron,
          error: (error as Error).message,
        },
      });
    }
  },
};
