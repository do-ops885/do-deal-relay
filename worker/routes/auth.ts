import type { Env, User, UserPublic, CreateUserInput, LoginInput, UpdateUserInput } from "../types";
import { handleError } from "../lib/error-handler";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { generateUUID } from "../lib/crypto";
import { createToken, hashPassword, verifyPassword } from "../lib/jwt";
import { hasPermission } from "../middleware/authorization";
import type { AuthResult } from "../lib/auth";


function getJwtSecret(env: Env): string {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required. Please configure it in your Cloudflare Workers environment.");
  return secret;
}

function getRefreshSecret(envParam: Env): string {
  const refreshSecret = envParam.JWT_REFRESH_SECRET;
  if (refreshSecret) return refreshSecret;
  return getJwtSecret(envParam);
}

function toPublicUser(user: User): UserPublic {
  return { id: user.id, email: user.email, name: user.name, role: user.role, is_active: user.is_active, created_at: user.created_at, updated_at: user.updated_at };
}

function getUserResponse(user: UserPublic): object {
  return { id: user.id, email: user.email, name: user.name, role: user.role, isActive: Boolean(user.is_active), createdAt: user.created_at, updatedAt: user.updated_at };
}

export async function registerUser(input: CreateUserInput, request: Request, env: Env): Promise<Response> {
  try {
    const existing = await env.DEALS_DB.prepare("SELECT id FROM users WHERE email = ?").bind(input.email.toLowerCase()).first();
    if (existing) return errorResponse("Email already registered", 400, undefined, request, env);
    const passwordHash = await hashPassword(input.password);
    const id = generateUUID();
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare("INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.email.toLowerCase(), input.name, passwordHash, "user", 1, now, now).run();
    await logAuditAction(null, "user_register", "users", request, env, { email: input.email, userId: id });
    const user = await getUserById(id, env);
    if (!user) return errorResponse("User registration failed", 500, undefined, request, env);
    return jsonResponse(getUserResponse(toPublicUser(user)), 201, request, env);
  } catch (error) { return handleError(error, request, env, "Failed to register user"); }
}

export async function loginUser(input: LoginInput, request: Request, env: Env): Promise<Response> {
  try {
    const user = await env.DEALS_DB.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1").bind(input.email.toLowerCase()).first<User>();
    if (!user) return errorResponse("Invalid credentials", 401, undefined, request, env);
    const isValid = await verifyPassword(input.password, user.password_hash);
    if (!isValid) return errorResponse("Invalid credentials", 401, undefined, request, env);
    const accessToken = await createToken({ sub: user.id, role: user.role, email: user.email }, getJwtSecret(env), "24h");
    const refreshToken = await createToken({ sub: user.id, type: "refresh" }, getRefreshSecret(env), "7d");
    await logAuditAction(user.id, "user_login", "users", request, env, { userId: user.id });
    return jsonResponse({ user: getUserResponse(toPublicUser(user)), accessToken, refreshToken, expiresIn: 86400 }, 200, request, env);
  } catch (error) { return handleError(error, request, env, "Failed to login user"); }
}

export async function refreshAccessToken(token: string, request: Request, env: Env): Promise<Response> {
  try {
    const { verifyToken: verifyJwt } = await import("../lib/jwt");
    const refreshSecret = getRefreshSecret(env);
    const payload = await verifyJwt(token, refreshSecret);
    if (!payload) return errorResponse("Invalid or expired refresh token", 401, undefined, request, env);
    if (payload.type !== "refresh") return errorResponse("Invalid token type", 401, undefined, request, env);
    const user = await getUserById(payload.sub, env);
    if (!user || !user.is_active) return errorResponse("User not found or inactive", 401, undefined, request, env);
    const newAccessToken = await createToken({ sub: user.id, role: user.role, email: user.email }, getJwtSecret(env), "24h");
    const newRefreshToken = getRefreshSecret(env) ? await createToken({ sub: user.id, type: "refresh" }, getRefreshSecret(env), "7d") : undefined;
    await logAuditAction(user.id, "token_refresh", "users", request, env, { userId: user.id });
    return jsonResponse({ accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: 86400 }, 200, request, env);
  } catch (error) { return handleError(error, request, env, "Failed to refresh token"); }
}

export async function getProfile(userId: string, request: Request, env: Env): Promise<Response> {
  try {
    const user = await getUserById(userId, env);
    if (!user) return errorResponse("User not found", 404, undefined, request, env);
    return jsonResponse(getUserResponse(toPublicUser(user)), 200, request, env);
  } catch (error) { return handleError(error, request, env, "Failed to get profile"); }
}

export async function updateProfile(userId: string, input: UpdateUserInput, request: Request, env: Env): Promise<Response> {
  try {
    const existing = await getUserById(userId, env);
    if (!existing) return errorResponse("User not found", 404, undefined, request, env);
    const updates: string[] = [];
    const params: (string | null)[] = [];
    if (input.name !== undefined) { updates.push("name = ?"); params.push(input.name); }
    if (input.email !== undefined) { updates.push("email = ?"); params.push(input.email.toLowerCase()); }
    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(userId);
    await env.DEALS_DB.prepare("UPDATE users SET " + updates.join(", ") + " WHERE id = ?").bind(...params).run();
    const updated = await getUserById(userId, env);
    if (!updated) return errorResponse("User update failed", 500, undefined, request, env);
    await logAuditAction(userId, "user_update", "users", request, env, { userId, changes: Object.keys(input) });
    return jsonResponse(getUserResponse(toPublicUser(updated)), 200, request, env);
  } catch (error) { return handleError(error, request, env, "Failed to update profile"); }
}

export async function validateToken(token: string, request: Request, env: Env): Promise<AuthResult> {
  try {
    const { verifyToken: verifyJwt } = await import("../lib/jwt");
    const payload = await verifyJwt(token, getJwtSecret(env));
    if (!payload) return { valid: false, payload: null, isRefreshToken: false };
    return { valid: true, payload, isRefreshToken: false };
  } catch (error) {
    const { verifyToken: verifyJwt } = await import("../lib/jwt");
    const refreshSecret = getRefreshSecret(env);
    const payload = await verifyJwt(token, refreshSecret);
    if (!payload) throw new Error("Invalid refresh token");
    return { valid: false, payload, isRefreshToken: true };
  }
}

async function getUserById(id: string, env: Env): Promise<User | null> {
  try { return (await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()) as User | null; } catch { return null; }
}

async function getUserByEmail(email: string, env: Env): Promise<User | null> {
  try { return (await env.DEALS_DB.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase()).first()) as User | null; } catch { return null; }
}

async function logAuditAction(userId: string | null, action: string, resource: string, request: Request, env: Env, context: Record<string, unknown> = {}): Promise<void> {
  try {
    const id = generateUUID();
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const userAgent = request.headers.get("User-Agent") || "unknown";
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare("INSERT INTO audit_log (id, user_id, action, resource, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, userId, action, resource, ip, userAgent, now).run();
  } catch {}
}

export { getJwtSecret, getRefreshSecret };