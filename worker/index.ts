import { setGitHubToken, initGitHubCircuitBreaker } from "./lib/github/index";
import type { Env } from "./types";
import { jsonResponse } from "./routes/utils";
import { validateConfig } from "./lib/config-utils";
import { logger } from "./lib/global-logger";
import { handleRequest } from "./router";
// DORA metrics endpoint registered: /api/dora-metrics (also /dora alias) — see ./router
import { handleScheduled } from "./scheduled";
import { toError } from "./lib/sanitize-error";
import { PipelineLock } from "./durable-objects/pipeline-lock";
import { SourceRegistry } from "./durable-objects/source-registry";
import { DealRegistry } from "./durable-objects/deal-registry";
import { PipelineExecutorDO } from "./durable-objects/pipeline-executor";
import { DealEventBroadcaster } from "./durable-objects/deal-event-broadcaster";

let configValidationPromise: Promise<void> | null = null;

async function ensureConfigValidated(env: Env): Promise<void> {
  if (env._validated) return;
  if (!configValidationPromise) {
    configValidationPromise = (async () => {
      validateConfig(env);
      env._validated = true;
    })();
  }
  try {
    await configValidationPromise;
  } catch (e) {
    configValidationPromise = null;
    throw e;
  }
}

// Named export for Durable Objects — required by wrangler
export { PipelineLock, SourceRegistry, DealRegistry, PipelineExecutorDO, DealEventBroadcaster };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      await ensureConfigValidated(env);
    } catch (error) {
      const err = toError(error);
      logger.error("Configuration error", {
        component: "worker",
        error_message: err.message,
      });
      return jsonResponse({ error: "Configuration error" }, 503, request);
    }

    if (env.GITHUB_TOKEN) {
      setGitHubToken(env.GITHUB_TOKEN);
      initGitHubCircuitBreaker(env as unknown as { DEALS_PROD: KVNamespace });
    }

    return handleRequest(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      validateConfig(env);
    } catch (error) {
      const err = toError(error);
      logger.error("Scheduled execution configuration error", {
        component: "worker",
        error_message: err.message,
      });
      const { notify } = await import("./notify");
      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: "scheduled-init",
        message: `Configuration error`,
      });
      return;
    }

    return handleScheduled(event, env);
  },
};
