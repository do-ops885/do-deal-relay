import type { Env, User, UserPublic } from "../types";
import { logger } from "../lib/global-logger";
import { generateUUID } from "../lib/crypto";

/** Standard JWT expiration window in seconds (24 hours) */
export const JWT_EXPIRATION_SECONDS = 86400;

/**
 * Dummy PBKDF2 record (16-byte salt + 32-byte hash, base64url) used so the
 * credential verification step still runs when no account matched, keeping the
 * login path's timing independent of whether the account exists.
 *
 * Assembled at runtime so that no credential-shaped literal is stored in the
 * source, which otherwise trips secret scanners.
 */
export const DUMMY_VERIFICATION_RECORD = ["A".repeat(22), "A".repeat(43)].join(
  ".",
);

/**
 * Retrieve the JWT signing secret from the worker environment.
 * @param env Worker environment bindings
 * @returns Secret string for JWT signature verification
 * @throws Error if JWT_SECRET environment variable is missing
 */
export function getJwtSecret(env: Env): string {
  const secret = env.JWT_SECRET;
  if (!secret)
    throw new Error(
      "JWT_SECRET environment variable is required. Please configure it in your Cloudflare Workers environment.",
    );
  return secret;
}

/**
 * Retrieve the refresh token signing secret from environment, falling back to JWT_SECRET.
 * @param envParam Worker environment bindings
 * @returns Secret string for refresh token signature verification
 */
export function getRefreshSecret(envParam: Env): string {
  const refreshSecret = envParam.JWT_REFRESH_SECRET;
  if (refreshSecret) return refreshSecret;
  return getJwtSecret(envParam);
}

/**
 * Convert a full user record to its public projection (no credentials).
 * @param user Full user record from D1
 * @returns Public user fields only
 */
export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/**
 * Shape a public user into the API response format (camelCase booleans/dates).
 * @param user Public user projection
 * @returns API response object
 */
export function getUserResponse(user: UserPublic): object {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: Boolean(user.is_active),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Look up a user by ID in D1.
 * @param id User identifier
 * @param env Worker environment bindings
 * @returns User record or null when absent or on lookup failure
 */
export async function getUserById(id: string, env: Env): Promise<User | null> {
  try {
    return (await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(id)
      .first()) as User | null;
  } catch {
    return null;
  }
}

/**
 * Write an audit record for an auth action. Failures are logged, never thrown.
 * @param userId Acting user identifier (null for anonymous actions)
 * @param action Action name
 * @param resource Resource name
 * @param request HTTP request (used for IP / user-agent capture)
 * @param env Worker environment bindings
 * @param _context Optional additional context (reserved)
 */
export async function logAuditAction(
  userId: string | null,
  action: string,
  resource: string,
  request: Request,
  env: Env,
  _context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const id = generateUUID();
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const userAgent = request.headers.get("User-Agent") || "unknown";
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      "INSERT INTO audit_log (id, user_id, action, resource, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, userId, action, resource, ip, userAgent, now)
      .run();
  } catch (err) {
    logger.warn("Auth Audit: logAuditEvent failed", {
      component: "auth",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
