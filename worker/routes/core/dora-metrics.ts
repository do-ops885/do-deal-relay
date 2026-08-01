import type { Env } from "../../types";
import { jsonResponse, parseDaysParam } from "../utils";
import { logger } from "../../lib/global-logger";
import { getDORASummary, computeDORAMetrics } from "../../lib/metrics/dora";

export async function handleDORAMetrics(
  url: URL,
  env: Env,
  request: Request,
): Promise<Response> {
  try {
    const days = parseDaysParam(url);
    const bypassCache = url.searchParams.get("bypass_cache") === "true";

    const result = bypassCache
      ? await computeDORAMetrics(env, days)
      : await getDORASummary(env);

    return jsonResponse(result, 200, request, env);
  } catch (error) {
    logger.error("handleDORAMetrics failed", {
      component: "dora-metrics",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      { error: "Failed to compute DORA metrics" },
      500,
      request,
      env,
    );
  }
}
