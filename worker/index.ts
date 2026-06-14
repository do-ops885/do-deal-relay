import { setGitHubToken, initGitHubCircuitBreaker } from "./lib/github/index";
import type { Env } from "./types";
import { jsonResponse } from "./routes/utils";
import { validateConfig } from "./lib/config-utils";
import { logger } from "./lib/global-logger";
import { handleRequest } from "./router";
import { handleScheduled } from "./scheduled";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await ensureConfigValidated(env);
    } catch (error) {
      logger.error("Configuration error:", {
        component: "worker",
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse(
        {
          error: "Configuration error",
          message: error instanceof Error ? error.message : String(error),
        },
        503,
        request,
      );
    }

    if (env.GITHUB_TOKEN) {
      setGitHubToken(env.GITHUB_TOKEN);
      initGitHubCircuitBreaker(env as unknown as { DEALS_PROD: KVNamespace });
    }

    return handleRequest(request, env);
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      validateConfig(env);
    } catch (error) {
      logger.error("Scheduled execution configuration error:", {
        component: "worker",
        error: error instanceof Error ? error.message : String(error),
      });
      const { notify } = await import("./notify");
      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: "scheduled-init",
        message: `Configuration error: ${(error as Error).message}`,
      });
      return;
    }

    return handleScheduled(event, env);
  },
};
