// ============================================================================
// Feature Flag Gate Middleware (ADR-032)
// ============================================================================

import type { Env } from "../types";
import { jsonResponse } from "../routes/utils";
import { logger } from "../lib/global-logger";
import { isFeatureEnabledWithDefaults } from "../lib/feature-flags";

/**
 * Feature-flag gate middleware.
 *
 * Returns `null` when the flag is enabled (request may proceed), or a
 * 503 `FEATURE_DISABLED` response when the flag is off. Flags are seeded
 * lazily from DEFAULT_FLAGS on first read, so a flag that has never been
 * managed resolves to its declared default (ADR-032).
 *
 * 503 is used instead of 404 because the gated endpoints are publicly
 * documented; an explicit machine-readable code is more debuggable and
 * matches the existing REMOTE_BINDING_REQUIRED pattern.
 *
 * @example
 * ```typescript
 * const featureOff = await requireFeature("bulk_import_export", request, env);
 * if (featureOff) return featureOff;
 * ```
 */
export async function requireFeature(
  flagName: string,
  request: Request,
  env: Env,
): Promise<Response | null> {
  const enabled = await isFeatureEnabledWithDefaults(flagName, env);
  if (enabled) {
    return null;
  }
  logger.warn("Request blocked by disabled feature flag", {
    component: "feature-gate",
    flag: flagName,
    path: new URL(request.url).pathname,
  });
  return jsonResponse(
    {
      error: "Feature disabled",
      code: "FEATURE_DISABLED",
      feature: flagName,
    },
    503,
    request,
  );
}
