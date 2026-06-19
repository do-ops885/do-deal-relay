import type {
  Env,
  User,
  UserPublic,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
} from "../types";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { generateUUID } from "../lib/crypto";
import { createToken, hashPassword, verifyPassword } from "../lib/jwt";
import { toErrCtx } from "../lib/errors";
import type { AuthResult } from "../lib/auth";

function getJwtSecret(env: Env): string {
  const secret = env.JWT_SECRET;
  if (!secret)
    throw new Error(
      "JWT_SECRET environment variable is required. Please configure it in your Cloudflare Workers environment.",
    );
  return secret;
}

function getRefreshSecret(envParam: Env): string {
  const refreshSecret = envParam.JWT_REFRESH_SECRET;
  if (refreshSecret) return refreshSecret;
  return getJwtSecret(envParam);
}

function toPublicUser(user: User): UserPublic {
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

function getUserResponse(user: UserPublic): object {
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

// ============================================================================
// Handle functions (called by index.ts router)
// ============================================================================

export async function handleRegister(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as CreateUserInput;
    if (!body.email || !body.password || !body.name) {
      return errorResponse(
        "Email, password, and name are required",
        400,
        undefined,
        request,
        env,
      );
    }
    return registerUser(body, request, env);
  } catch {
    return errorResponse("Invalid request body", 400, undefined, request, env);
  }
}

export async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as LoginInput;
    if (!body.email || !body.password) {
      return errorResponse(
        "Email and password are required",
        400,
        undefined,
        request,
        env,
      );
    }
    return loginUser(body, request, env);
  } catch {
    return errorResponse("Invalid request body", 400, undefined, request, env);
  }
}

export async function handleRefreshToken(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as { refreshToken: string };
    if (!body.refreshToken) {
      return errorResponse(
        "Refresh token is required",
        400,
        undefined,
        request,
        env,
      );
    }
    return refreshAccessToken(body.refreshToken, request, env);
  } catch {
    return errorResponse("Invalid request body", 400, undefined, request, env);
  }
}

export async function handleGetCurrentUser(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId)
      return errorResponse("Unauthorized", 401, undefined, request, env);
    const user = await getUserById(auth.userId, env);
    if (!user)
      return errorResponse("User not found", 404, undefined, request, env);
    return jsonResponse(getUserResponse(toPublicUser(user)), 200, request, env);
  } catch (error) {
    logger.error("Failed to get profile", toErrCtx(error));
    return errorResponse("Failed to get profile", 500, undefined, request, env);
  }
}

export async function handleUpdateProfile(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId)
      return errorResponse("Unauthorized", 401, undefined, request, env);
    const body = (await request.json()) as UpdateUserInput;
    return updateProfile(auth.userId, body, request, env);
  } catch {
    return errorResponse("Invalid request body", 400, undefined, request, env);
  }
}

export async function handleListUsers(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId)
      return errorResponse("Unauthorized", 401, undefined, request, env);
    const result = await env.DEALS_DB.prepare(
      "SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC",
    ).all();
    const users = (result.results || []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return jsonResponse({ users }, 200, request, env);
  } catch (error) {
    logger.error("Failed to list users", toErrCtx(error));
    return errorResponse("Failed to list users", 500, undefined, request, env);
  }
}

// ============================================================================
// Core auth logic
// ============================================================================

export async function registerUser(
  input: CreateUserInput,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const existing = await env.DEALS_DB.prepare(
      "SELECT id FROM users WHERE email = ?",
    )
      .bind(input.email.toLowerCase())
      .first();
    if (existing)
      return errorResponse(
        "Email already registered",
        400,
        undefined,
        request,
        env,
      );
    const passwordHash = await hashPassword(input.password);
    const id = generateUUID();
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      "INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        input.email.toLowerCase(),
        input.name,
        passwordHash,
        "user",
        1,
        now,
        now,
      )
      .run();
    await logAuditAction(null, "user_register", "users", request, env, {
      email: input.email,
      userId: id,
    });
    const user = await getUserById(id, env);
    if (!user)
      return errorResponse(
        "User registration failed",
        500,
        undefined,
        request,
        env,
      );
    return jsonResponse(getUserResponse(toPublicUser(user)), 201, request, env);
  } catch (error) {
    logger.error("Failed to register user", toErrCtx(error));
    return errorResponse(
      "Failed to register user",
      500,
      undefined,
      request,
      env,
    );
  }
}

export async function loginUser(
  input: LoginInput,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const user = await env.DEALS_DB.prepare(
      "SELECT * FROM users WHERE email = ? AND is_active = 1",
    )
      .bind(input.email.toLowerCase())
      .first<User>();
    if (!user)
      return errorResponse("Invalid credentials", 401, undefined, request, env);
    const isValid = await verifyPassword(input.password, user.password_hash);
    if (!isValid)
      return errorResponse("Invalid credentials", 401, undefined, request, env);
    const accessToken = await createToken(
      { sub: user.id, role: user.role, email: user.email },
      getJwtSecret(env),
      "24h",
    );
    const refreshToken = await createToken(
      { sub: user.id, type: "refresh" },
      getRefreshSecret(env),
      "7d",
    );
    await logAuditAction(user.id, "user_login", "users", request, env, {
      userId: user.id,
    });
    return jsonResponse(
      {
        user: getUserResponse(toPublicUser(user)),
        accessToken,
        refreshToken,
        expiresIn: 86400,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    logger.error("Failed to login user", toErrCtx(error));
    return errorResponse("Failed to login user", 500, undefined, request, env);
  }
}

export async function refreshAccessToken(
  token: string,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const { verifyToken: verifyJwt } = await import("../lib/jwt");
    const refreshSecret = getRefreshSecret(env);
    const payload = await verifyJwt(token, refreshSecret);
    if (!payload)
      return errorResponse(
        "Invalid or expired refresh token",
        401,
        undefined,
        request,
        env,
      );
    if (payload.type !== "refresh")
      return errorResponse("Invalid token type", 401, undefined, request, env);
    const user = await getUserById(payload.sub as string, env);
    if (!user || !user.is_active)
      return errorResponse(
        "User not found or inactive",
        401,
        undefined,
        request,
        env,
      );
    const newAccessToken = await createToken(
      { sub: user.id, role: user.role, email: user.email },
      getJwtSecret(env),
      "24h",
    );
    const newRefreshToken = getRefreshSecret(env)
      ? await createToken(
          { sub: user.id, type: "refresh" },
          getRefreshSecret(env),
          "7d",
        )
      : undefined;
    await logAuditAction(user.id, "token_refresh", "users", request, env, {
      userId: user.id,
    });
    return jsonResponse(
      {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 86400,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    logger.error("Failed to refresh token", toErrCtx(error));
    return errorResponse(
      "Failed to refresh token",
      500,
      undefined,
      request,
      env,
    );
  }
}

export async function getProfile(
  userId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const user = await getUserById(userId, env);
    if (!user)
      return errorResponse("User not found", 404, undefined, request, env);
    return jsonResponse(getUserResponse(toPublicUser(user)), 200, request, env);
  } catch (error) {
    logger.error("Failed to get profile", toErrCtx(error));
    return errorResponse("Failed to get profile", 500, undefined, request, env);
  }
}

export async function updateProfile(
  userId: string,
  input: UpdateUserInput,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const existing = await getUserById(userId, env);
    if (!existing)
      return errorResponse("User not found", 404, undefined, request, env);
    const updates: string[] = [];
    const params: (string | null)[] = [];
    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name);
    }
    if (input.email !== undefined) {
      updates.push("email = ?");
      params.push(input.email.toLowerCase());
    }
    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(userId);
    await env.DEALS_DB.prepare(
      "UPDATE users SET " + updates.join(", ") + " WHERE id = ?",
    )
      .bind(...params)
      .run();
    const updated = await getUserById(userId, env);
    if (!updated)
      return errorResponse("User update failed", 500, undefined, request, env);
    await logAuditAction(userId, "user_update", "users", request, env, {
      userId,
      changes: Object.keys(input),
    });
    return jsonResponse(
      getUserResponse(toPublicUser(updated)),
      200,
      request,
      env,
    );
  } catch (error) {
    logger.error("Failed to update profile", toErrCtx(error));
    return errorResponse(
      "Failed to update profile",
      500,
      undefined,
      request,
      env,
    );
  }
}

async function getUserById(id: string, env: Env): Promise<User | null> {
  try {
    return (await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(id)
      .first()) as User | null;
  } catch {
    return null;
  }
}

async function getUserByEmail(email: string, env: Env): Promise<User | null> {
  try {
    return (await env.DEALS_DB.prepare("SELECT * FROM users WHERE email = ?")
      .bind(email.toLowerCase())
      .first()) as User | null;
  } catch {
    return null;
  }
}

async function logAuditAction(
  userId: string | null,
  action: string,
  resource: string,
  request: Request,
  env: Env,
  context: Record<string, unknown> = {},
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

export { getJwtSecret, getRefreshSecret };
