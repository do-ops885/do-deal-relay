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

export function hasPermission(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

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
