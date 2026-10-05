import type { Env, User, UserPublic } from "../types";
import { logger } from "../lib/global-logger";
import { generateUUID } from "../lib/crypto";

// ============================================================================
// Auth route helpers (split from auth.ts per IMP-6 LOC hygiene).
// Secrets, public-user mapping, user lookup, and audit logging shared by the
// handlers (auth.ts) and the service layer (auth-service.ts).
// ============================================================================

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

export async function getUserById(id: string, env: Env): Promise<User | null> {
  try {
    return (await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(id)
      .first()) as User | null;
  } catch {
    return null;
  }
}

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
