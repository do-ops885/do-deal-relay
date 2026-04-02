import { executePipeline } from "./state-machine";
import { notify } from "./notify";
import { setGitHubToken, initGitHubCircuitBreaker } from "./lib/github";
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
} from "./routes/core";
import {
  handleGetReferrals,
  handleCreateReferral,
  handleGetReferralByCode,
  handleDeactivateReferral,
  handleResearch,
} from "./routes/referrals";
import { jsonResponse } from "./routes/utils";

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

      // Pipeline API
      if (path === "/api/discover" && request.method === "POST") {
        return handleDiscover(env);
      }
      if (path === "/api/status") return handleStatus(env);
      if (path === "/api/log") return handleGetLogs(url, env);

      // Deal Submission
      if (path === "/api/submit" && request.method === "POST") {
        return handleSubmit(request, env);
      }

      // Referral API
      if (path === "/api/referrals") {
        if (request.method === "GET") return handleGetReferrals(url, env);
        if (request.method === "POST") return handleCreateReferral(request, env);
      }

      const referralMatch = path.match(/^\/api\/referrals\/([^/]+)$/);
      if (referralMatch) {
        const code = referralMatch[1];
        if (request.method === "GET") return handleGetReferralByCode(code, env);
        if (path.endsWith("/deactivate") && request.method === "POST") {
          return handleDeactivateReferral(request, code, env);
        }
      }

      // Research API
      if (path === "/api/research" && request.method === "POST") {
        return handleResearch(request, env);
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
      if (!result.success) {
        console.error(`Pipeline failed at ${result.phase}: ${result.error}`);
      }
    } catch (error) {
      console.error("Scheduled execution error:", error);
      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: "scheduled",
        message: `Scheduled pipeline failed: ${(error as Error).message}`,
      });
    }
  },
};
