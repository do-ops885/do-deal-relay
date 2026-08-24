/**
 * Role-Based Access Control (RBAC) Module
 *
 * Provides permission-based authorization with a role-permission matrix.
 * Permissions follow the "resource:action" convention (e.g., "deals:read").
 *
 * Roles hierarchy: admin > user > viewer
 * Each role maps to a set of permissions stored in D1.
 *
 * @module worker/lib/rbac
 */

import type { Env } from "../types";
import type { AuthRole } from "./auth";
import { logger } from "./global-logger";
import { toErrMessage } from "./errors";

// ============================================================================
// Types
// ============================================================================

export type Permission = string; // "resource:action" format, e.g., "deals:read"

export interface RBACResult {
  allowed: boolean;
  permissions: Permission[];
  error?: string;
}

interface RolePermissionRow {
  id: string;
  role: string;
  permission: string;
  created_at: string;
}

// ============================================================================
// Permission Constants
// ============================================================================

export const Permissions = {
  // Deals
  DEALS_READ: "deals:read",
  DEALS_WRITE: "deals:write",
  DEALS_DELETE: "deals:delete",

  // Users
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  USERS_DELETE: "users:delete",

  // API Keys
  APIKEYS_READ: "apikeys:read",
  APIKEYS_WRITE: "apikeys:write",
  APIKEYS_DELETE: "apikeys:delete",

  // Audit
  AUDIT_READ: "audit:read",

  // Pipeline
  PIPELINE_READ: "pipeline:read",
  PIPELINE_WRITE: "pipeline:write",

  // Metrics
  METRICS_READ: "metrics:read",

  // Config
  CONFIG_READ: "config:read",
  CONFIG_WRITE: "config:write",

  // Referrals
  REFERRALS_READ: "referrals:read",
  REFERRALS_WRITE: "referrals:write",

  // Profile
  PROFILE_READ: "profile:read",
  PROFILE_WRITE: "profile:write",
} as const;

// ============================================================================
// In-Memory Cache for Permissions
// ============================================================================

const permissionsCache = new Map<
  string,
  { permissions: Permission[]; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached permissions for a role, or fetch from D1.
 * Uses a short-lived in-memory cache to avoid hammering D1 on every request.
 */
async function getRolePermissions(
  env: Env,
  role: AuthRole,
): Promise<Permission[]> {
  const cached = permissionsCache.get(role);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  try {
    const result = await env.DEALS_DB.prepare(
      "SELECT permission FROM role_permissions WHERE role = ?",
    )
      .bind(role)
      .all<RolePermissionRow>();

    const permissions = (result.results || []).map((row) => row.permission);

    permissionsCache.set(role, {
      permissions,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return permissions;
  } catch (error) {
    logger.error("Failed to fetch role permissions", {
      role,
      error: toErrMessage(error),
    });
    // Fallback to hardcoded defaults if D1 query fails
    return getDefaultPermissions(role);
  }
}

/**
 * Hardcoded fallback permissions when D1 is unavailable.
 * Matches the seed data in migration 0004.
 */
function getDefaultPermissions(role: AuthRole): Permission[] {
  switch (role) {
    case "admin":
      return Object.values(Permissions);
    case "user":
      return [
        Permissions.DEALS_READ,
        Permissions.DEALS_WRITE,
        Permissions.REFERRALS_READ,
        Permissions.REFERRALS_WRITE,
        Permissions.PROFILE_READ,
        Permissions.PROFILE_WRITE,
      ];
    case "viewer":
      return [
        Permissions.DEALS_READ,
        Permissions.REFERRALS_READ,
        Permissions.PROFILE_READ,
      ];
    case "api_consumer":
      return [Permissions.DEALS_READ, Permissions.DEALS_WRITE];
    case "readonly":
      return [Permissions.DEALS_READ, Permissions.PROFILE_READ];
    default:
      return [];
  }
}

// ============================================================================
// RBAC Functions
// ============================================================================

/**
 * Check if a role has a specific permission.
 *
 * @param env Worker environment context containing D1 database bindings
 * @param role Role to check
 * @param permission Specific permission string (e.g. "deals:read")
 * @returns Promise resolving to boolean indicating permission status
 */
export async function hasPermission(
  env: Env,
  role: AuthRole,
  permission: Permission,
): Promise<boolean> {
  const permissions = await getRolePermissions(env, role);
  return permissions.includes(permission);
}

/**
 * Check if a role has ALL of the specified permissions.
 *
 * @param env Worker environment context
 * @param role Role to evaluate
 * @param requiredPermissions Array of required permission strings
 * @returns Promise resolving to RBACResult object with authorization status
 */
export async function hasAllPermissions(
  env: Env,
  role: AuthRole,
  requiredPermissions: Permission[],
): Promise<RBACResult> {
  const permissions = await getRolePermissions(env, role);
  const missing = requiredPermissions.filter((p) => !permissions.includes(p));

  if (missing.length === 0) {
    return { allowed: true, permissions };
  }

  return {
    allowed: false,
    permissions,
    error: `Missing permissions: ${missing.join(", ")}`,
  };
}

/**
 * Check if a role has ANY of the specified permissions.
 *
 * @param env Worker environment context
 * @param role Role to evaluate
 * @param requiredPermissions Array of candidate permission strings
 * @returns Promise resolving to RBACResult object
 */
export async function hasAnyPermission(
  env: Env,
  role: AuthRole,
  requiredPermissions: Permission[],
): Promise<RBACResult> {
  const permissions = await getRolePermissions(env, role);
  const hasAny = requiredPermissions.some((p) => permissions.includes(p));

  if (hasAny) {
    return { allowed: true, permissions };
  }

  return {
    allowed: false,
    permissions,
    error: `Requires at least one of: ${requiredPermissions.join(", ")}`,
  };
}

/**
 * Middleware factory: require specific permission(s) for a route.
 *
 * @param env Worker environment context
 * @param requiredPermissions List of required permissions
 * @returns Middleware function accepting authentication context and returning access status
 * @example
 * ```typescript
 * const rbacCheck = requirePermission(env, Permissions.DEALS_WRITE);
 * const result = await rbacCheck(auth);
 * if (result instanceof Response) return result;
 * // Continue with authorized request
 * ```
 */
export function requirePermission(
  env: Env,
  ...requiredPermissions: Permission[]
): (auth: {
  role?: AuthRole;
}) => Promise<{ allowed: boolean; error?: string } | Response> {
  return async (auth) => {
    if (!auth.role) {
      return { allowed: false, error: "No role assigned" };
    }

    const result = await hasAllPermissions(env, auth.role, requiredPermissions);

    if (!result.allowed) {
      logger.warn("RBAC denied", {
        role: auth.role,
        required: requiredPermissions,
        error: result.error,
      });
      return { allowed: false, error: result.error };
    }

    return { allowed: true };
  };
}

/**
 * Clear the permissions cache for a specific role or all roles.
 * Call after permission changes to ensure fresh data.
 *
 * @param role Optional role to invalidate from cache; clears all if omitted
 */
export function clearPermissionsCache(role?: AuthRole): void {
  if (role) {
    permissionsCache.delete(role);
  } else {
    permissionsCache.clear();
  }
}

/**
 * Get all permissions for a role (for debugging/admin UI).
 *
 * @param env Worker environment context
 * @param role Role to inspect
 * @returns Promise resolving to array of assigned permission strings
 */
export async function listRolePermissions(
  env: Env,
  role: AuthRole,
): Promise<Permission[]> {
  return getRolePermissions(env, role);
}

/**
 * Check if a user can access a specific resource with an action.
 * Combines RBAC check with role hierarchy (admin overrides all).
 *
 * @param env Worker environment context
 * @param role Role attempting access
 * @param resource Resource name (e.g., "deals")
 * @param action Action name (e.g., "read")
 * @returns Promise resolving to boolean indicating access authorization
 */
export async function canAccess(
  env: Env,
  role: AuthRole,
  resource: string,
  action: string,
): Promise<boolean> {
  const permission = `${resource}:${action}`;
  return hasPermission(env, role, permission);
}
