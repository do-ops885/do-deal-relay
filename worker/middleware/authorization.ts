import type { AuthResult } from "../lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "../routes/utils";

export type Role = "admin" | "user" | "viewer" | "api_consumer";

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 4,
  user: 3,
  viewer: 2,
  readonly: 2,
  api_consumer: 1,
};

/**
 * Check if a user role has the required permission level.
 *
 * Implements a hierarchical permission model where higher roles
 * automatically inherit permissions of lower roles.
 *
 * @param userRole - The role assigned to the user
 * @param requiredRole - The minimum role required for the action
 * @returns True if the user has sufficient permissions
 */
export function hasPermission(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Middleware factory for role-based access control.
 *
 * Returns a middleware function that verifies the requester's role
 * against the required role level.
 *
 * @param requiredRole - The minimum role required to access the route
 * @returns Middleware function that returns 403 if unauthorized
 */
export function authorize(requiredRole: Role) {
  return (auth: AuthResult): Response | null => {
    if (!auth.authenticated) {
      return unauthorizedResponse("Authentication required");
    }
    if (!auth.role || !hasPermission(auth.role, requiredRole)) {
      return forbiddenResponse(`Required role: ${requiredRole}`);
    }
    return null;
  };
}
