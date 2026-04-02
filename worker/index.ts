import { executePipeline, getPipelineStatus } from "./state-machine";
import { logger, setLogContext } from "./lib/global-logger";
import { handleError } from "./lib/error-handler";
import { notify } from "./notify";
import { handleWebhookRoutes } from "./routes/webhooks";
import {
  handleEmailIncoming,
  handleEmailParse,
  handleEmailHelp,
} from "./routes/email";
import {
  handleGetReferrals,
  handleCreateReferral,
  handleGetReferralByCode,
  handleDeactivateReferral,
  handleReactivateReferral,
  handleResearch,
  handleGetResearchResults,
} from "./routes/referrals";
import {
  handleHealth,
  handleMetrics,
  handleGetDeals,
  handleDiscover,
  handleStatus,
  handleGetLogs,
  handleSubmit,
} from "./routes/core";
import type { Env, SubmitDealBody } from "./types";
import { jsonResponse } from "./routes/utils";

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

      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: "scheduled",
        message: `Scheduled pipeline failed: ${(error as Error).message}`,
      });
    }
  },
};
