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
 * @param userRole - The role of the authenticated user
 * @param requiredRole - The minimum role required for the operation
 * @returns True if the user has sufficient permissions
 */
export function hasPermission(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Middleware factory to authorize requests based on user roles.
 *
 * @param requiredRole - The minimum role required to access the route
 * @returns A function that takes an AuthResult and returns a Response if unauthorized, or null if authorized
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
