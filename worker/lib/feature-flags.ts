/**
 * Feature Flags System
 *
 * Provides feature toggle functionality without redeployment.
 * Supports boolean flags, percentage rollouts, and user-specific flags.
 * Uses Cloudflare KV for persistence.
 *
 * @module worker/lib/feature-flags
 */

import type { Env } from "../types";

// ============================================================================
// Configuration
// ============================================================================

const FEATURE_FLAG_PREFIX = "ff:";
const DEFAULT_FLAGS_INITIALIZED_KEY = "__ff_initialized__";

// Default feature flags to initialize
const DEFAULT_FLAGS: Omit<FeatureFlag, "createdAt" | "updatedAt">[] = [
  {
    name: "bulk_import_export",
    enabled: false,
    description: "Enable bulk import/export endpoints",
  },
  {
    name: "nlq_ai_enhancement",
    enabled: true,
    description: "Enable AI-powered NLQ enhancement",
  },
  {
    name: "email_processing",
    enabled: false,
    description: "Enable email API endpoints",
  },
  {
    name: "analytics_dashboard",
    enabled: true,
    description: "Enable analytics endpoints",
  },
  {
    name: "webhook_system",
    enabled: true,
    description: "Enable webhook endpoints",
  },
];

// ============================================================================
// Types
// ============================================================================

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  userIds?: string[]; // Specific users
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagResult {
  enabled: boolean;
  flag: FeatureFlag;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check if a feature flag is enabled.
 *
 * Evaluates the flag based on its configuration:
 * - If flag is disabled, returns false
 * - If flag has userIds, checks if userId is in the list
 * - If flag has rolloutPercentage, uses deterministic hash for percentage
 * - Otherwise returns the enabled value
 *
 * @param flagName - Name of the feature flag
 * @param env - Worker environment with KV bindings
 * @param userId - Optional user ID for user-specific flags
 * @returns Whether the feature is enabled for this request
 * @example
 * ```typescript
 * const enabled = await isFeatureEnabled("new-dashboard", env);
 * if (enabled) {
 *   return renderNewDashboard();
 * }
 * ```
 */
export async function isFeatureEnabled(
  flagName: string,
  env: Env,
  userId?: string,
): Promise<boolean> {
  const flag = await getFeatureFlag(flagName, env);

  if (!flag) {
    return false;
  }

  if (!flag.enabled) {
    return false;
  }

  // Check user-specific flags first
  if (flag.userIds && flag.userIds.length > 0) {
    if (!userId) {
      return false;
    }
    return flag.userIds.includes(userId);
  }

  // Check rollout percentage
  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
    if (!userId) {
      // No userId, use flag name for deterministic hash
      return hashString(`${flagName}:default`) % 100 < flag.rolloutPercentage;
    }
    // Use userId for consistent rollout
    return hashString(`${flagName}:${userId}`) % 100 < flag.rolloutPercentage;
  }

  return flag.enabled;
}

/**
 * Get a feature flag by name.
 *
 * Retrieves the full flag configuration from KV storage.
 *
 * @param flagName - Name of the feature flag
 * @param env - Worker environment with KV bindings
 * @returns Feature flag configuration or null if not found
 * @example
 * ```typescript
 * const flag = await getFeatureFlag("new-feature", env);
 * console.log(flag?.rolloutPercentage);
 * ```
 */
export async function getFeatureFlag(
  flagName: string,
  env: Env,
): Promise<FeatureFlag | null> {
  try {
    const key = `${FEATURE_FLAG_PREFIX}${flagName}`;
    const flag = await env.DEALS_LOCK.get<FeatureFlag>(key, "json");
    return flag;
  } catch {
    return null;
  }
}

/**
 * Set a feature flag.
 *
 * Creates or updates a feature flag in KV storage.
 * Automatically sets createdAt for new flags and updatedAt for updates.
 *
 * @param flag - Feature flag configuration
 * @param env - Worker environment with KV bindings
 * @example
 * ```typescript
 * await setFeatureFlag({
 *   name: "new-feature",
 *   enabled: true,
 *   rolloutPercentage: 50,
 *   description: "New feature for testing"
 * }, env);
 * ```
 */
export async function setFeatureFlag(
  flag: Omit<FeatureFlag, "createdAt" | "updatedAt">,
  env: Env,
): Promise<void> {
  const now = new Date().toISOString();
  const existingFlag = await getFeatureFlag(flag.name, env);

  const updatedFlag: FeatureFlag = {
    ...flag,
    createdAt: existingFlag?.createdAt ?? now,
    updatedAt: now,
  };

  const key = `${FEATURE_FLAG_PREFIX}${flag.name}`;
  await env.DEALS_LOCK.put(key, JSON.stringify(updatedFlag));
}

/**
 * Delete a feature flag.
 *
 * Removes a feature flag from KV storage.
 *
 * @param flagName - Name of the feature flag to delete
 * @param env - Worker environment with KV bindings
 * @example
 * ```typescript
 * await deleteFeatureFlag("old-feature", env);
 * ```
 */
export async function deleteFeatureFlag(
  flagName: string,
  env: Env,
): Promise<void> {
  const key = `${FEATURE_FLAG_PREFIX}${flagName}`;
  await env.DEALS_LOCK.delete(key);
}

/**
 * Get all feature flags.
 *
 * Retrieves all feature flags from KV storage.
 * Use with caution on large datasets.
 *
 * @param env - Worker environment with KV bindings
 * @returns Map of flag names to feature flags
 * @example
 * ```typescript
 * const allFlags = await getAllFeatureFlags(env);
 * for (const [name, flag] of allFlags) {
 *   console.log(`${name}: ${flag.enabled}`);
 * }
 * ```
 */
export async function getAllFeatureFlags(
  env: Env,
): Promise<Map<string, FeatureFlag>> {
  const flags = new Map<string, FeatureFlag>();

  try {
    const list = await env.DEALS_LOCK.list({ prefix: FEATURE_FLAG_PREFIX });

    for (const key of list.keys) {
      const flag = await env.DEALS_LOCK.get<FeatureFlag>(key.name, "json");
      if (flag) {
        flags.set(flag.name, flag);
      }
    }
  } catch (error) {
    console.error("Failed to list feature flags:", error);
  }

  return flags;
}

/**
 * Initialize default feature flags.
 *
 * Creates default feature flags if they don't exist.
 * Safe to call multiple times - will not overwrite existing flags.
 * Checks for initialization flag to avoid repeated setup.
 *
 * @param env - Worker environment with KV bindings
 * @example
 * ```typescript
 * await initializeDefaultFlags(env);
 * ```
 */
export async function initializeDefaultFlags(env: Env): Promise<void> {
  try {
    // Check if already initialized
    const initialized = await env.DEALS_LOCK.get(DEFAULT_FLAGS_INITIALIZED_KEY);
    if (initialized) {
      return;
    }

    // Create default flags
    const now = new Date().toISOString();
    for (const flag of DEFAULT_FLAGS) {
      const existing = await getFeatureFlag(flag.name, env);
      if (!existing) {
        const fullFlag: FeatureFlag = {
          ...flag,
          createdAt: now,
          updatedAt: now,
        };
        const key = `${FEATURE_FLAG_PREFIX}${flag.name}`;
        await env.DEALS_LOCK.put(key, JSON.stringify(fullFlag));
      }
    }

    // Mark as initialized
    await env.DEALS_LOCK.put(DEFAULT_FLAGS_INITIALIZED_KEY, "true");
  } catch (error) {
    console.error("Failed to initialize default flags:", error);
  }
}

/**
 * Get feature flag statistics.
 *
 * Provides aggregate statistics about feature flags.
 *
 * @param env - Worker environment
 * @returns Statistics about feature flags
 */
export async function getFeatureFlagStats(env: Env): Promise<{
  totalFlags: number;
  enabledFlags: number;
  disabledFlags: number;
  flagsWithRollout: number;
  flagsWithUserIds: number;
}> {
  const flags = await getAllFeatureFlags(env);

  let enabled = 0;
  let disabled = 0;
  let withRollout = 0;
  let withUserIds = 0;

  for (const flag of flags.values()) {
    if (flag.enabled) {
      enabled++;
    } else {
      disabled++;
    }
    if (flag.rolloutPercentage !== undefined) {
      withRollout++;
    }
    if (flag.userIds && flag.userIds.length > 0) {
      withUserIds++;
    }
  }

  return {
    totalFlags: flags.size,
    enabledFlags: enabled,
    disabledFlags: disabled,
    flagsWithRollout: withRollout,
    flagsWithUserIds: withUserIds,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple string hash function for percentage rollouts.
 *
 * Uses djb2 hash algorithm for deterministic distribution.
 *
 * @param str - String to hash
 * @returns Hash value
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Create feature flag middleware.
 *
 * Creates a middleware that checks a feature flag before
 * allowing access to a route. Returns 404 if feature is disabled.
 *
 * @param env - Worker environment
 * @param flagName - Feature flag to check
 * @param options - Middleware options
 * @returns Middleware function
 * @example
 * ```typescript
 * const newFeatureMiddleware = createFeatureFlagMiddleware(env, "new-feature");
 * app.use("/api/new", newFeatureMiddleware);
 * ```
 */
export function createFeatureFlagMiddleware(
  env: Env,
  flagName: string,
  options?: {
    getUserId?: (request: Request) => string | undefined;
    onDisabled?: (request: Request) => Response;
  },
) {
  const getUserId =
    options?.getUserId ?? ((r) => r.headers.get("X-User-Id") ?? undefined);
  const onDisabled =
    options?.onDisabled ??
    (() =>
      new Response(JSON.stringify({ error: "Feature not available" }), {
        status: 404,
      }));

  return async (
    request: Request,
    handler: () => Promise<Response>,
  ): Promise<Response> => {
    const userId = getUserId(request);
    const enabled = await isFeatureEnabled(flagName, env, userId);

    if (!enabled) {
      return onDisabled(request);
    }

    return handler();
  };
}

/**
 * Batch check multiple feature flags.
 *
 * Efficiently checks multiple flags in a single operation.
 *
 * @param flagNames - Array of flag names to check
 * @param env - Worker environment
 * @param userId - Optional user ID
 * @returns Map of flag name to enabled status
 * @example
 * ```typescript
 * const results = await batchCheckFlags(["a", "b", "c"], env, "user-1");
 * ```
 */
export async function batchCheckFlags(
  flagNames: string[],
  env: Env,
  userId?: string,
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  await Promise.all(
    flagNames.map(async (name) => {
      const enabled = await isFeatureEnabled(name, env, userId);
      results.set(name, enabled);
    }),
  );

  return results;
}
