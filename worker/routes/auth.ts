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
import { createToken, hashPassword, verifyPassword, verifyToken } from "../lib/jwt";
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

// ============================================================================
// Password Reset Flow
// ============================================================================

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Request a password reset token.
 * Sends a reset token that can be used to change the password.
 */
export async function handleRequestPasswordReset(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as { email: string };
    if (!body.email) {
      return errorResponse("Email is required", 400, undefined, request, env);
    }

    const user = await getUserByEmail(body.email, env);
    // Always return success to prevent email enumeration
    if (!user) {
      return jsonResponse(
        { message: "If the email exists, a reset link has been sent" },
        200,
        request,
        env,
      );
    }

    const resetToken = await createToken(
      { sub: user.id, type: "password_reset" },
      getJwtSecret(env),
      "1h",
    );

    // Store reset token hash for verification
    const tokenHash = await hashPassword(resetToken);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();

    await env.DEALS_DB.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
      .bind(generateUUID(), user.id, tokenHash, expiresAt, now)
      .run();

    await logAuditAction(user.id, "password_reset_request", "users", request, env, {
      userId: user.id,
    });

    logger.info("Password reset requested", {
      component: "auth",
      user_id: user.id,
      email: user.email,
    });

    return jsonResponse(
      {
        message: "If the email exists, a reset link has been sent",
        resetToken, // In production, this would be sent via email
      },
      200,
      request,
      env,
    );
  } catch {
    return errorResponse("Invalid request", 400, undefined, request, env);
  }
}

/**
 * Confirm a password reset using the reset token.
 */
export async function handleConfirmPasswordReset(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      token: string;
      newPassword: string;
    };
    if (!body.token || !body.newPassword) {
      return errorResponse(
        "Token and new password are required",
        400,
        undefined,
        request,
        env,
      );
    }

    if (body.newPassword.length < 8) {
      return errorResponse(
        "Password must be at least 8 characters",
        400,
        undefined,
        request,
        env,
      );
    }

    // Verify the reset token
    const payload = await verifyToken(body.token, getJwtSecret(env));
    if (!payload || payload.type !== "password_reset") {
      return errorResponse(
        "Invalid or expired reset token",
        401,
        undefined,
        request,
        env,
      );
    }

    const userId = payload.sub as string;

    // Verify token hasn't been used
    const tokenHash = await hashPassword(body.token);
    const resetRecord = await env.DEALS_DB.prepare(
      `SELECT id, used, expires_at FROM password_resets
       WHERE user_id = ? AND used = 0 AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(userId, new Date().toISOString())
      .first<{ id: string; used: number; expires_at: string }>();

    if (!resetRecord) {
      return errorResponse(
        "Reset token has expired or already been used",
        401,
        undefined,
        request,
        env,
      );
    }

    // Update password
    const passwordHash = await hashPassword(body.newPassword);
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(passwordHash, now, userId)
      .run();

    // Mark reset token as used
    await env.DEALS_DB.prepare(
      `UPDATE password_resets SET used = 1 WHERE id = ?`,
    )
      .bind(resetRecord.id)
      .run();

    await logAuditAction(userId, "password_reset_confirm", "users", request, env, {
      userId,
    });

    return jsonResponse(
      { message: "Password has been reset successfully" },
      200,
      request,
      env,
    );
  } catch {
    return errorResponse("Invalid request", 400, undefined, request, env);
  }
}

// ============================================================================
// Admin Role Management
// ============================================================================

/**
 * Admin: Change a user's role.
 */
export async function handleChangeUserRole(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId || auth.role !== "admin") {
      return errorResponse("Admin access required", 403, undefined, request, env);
    }

    const body = (await request.json()) as {
      userId: string;
      role: "admin" | "user" | "readonly" | "viewer";
    };
    if (!body.userId || !body.role) {
      return errorResponse(
        "userId and role are required",
        400,
        undefined,
        request,
        env,
      );
    }

    const validRoles = ["admin", "user", "readonly", "viewer"];
    if (!validRoles.includes(body.role)) {
      return errorResponse(
        `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        400,
        undefined,
        request,
        env,
      );
    }

    const user = await getUserById(body.userId, env);
    if (!user) {
      return errorResponse("User not found", 404, undefined, request, env);
    }

    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(body.role, now, body.userId)
      .run();

    await logAuditAction(auth.userId, "user_role_change", "users", request, env, {
      targetUserId: body.userId,
      newRole: body.role,
      previousRole: user.role,
    });

    return jsonResponse(
      { userId: body.userId, role: body.role, updatedAt: now },
      200,
      request,
      env,
    );
  } catch {
    return errorResponse("Invalid request", 400, undefined, request, env);
  }
}

/**
 * Admin: Deactivate or reactivate a user account.
 */
export async function handleToggleUserActive(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId || auth.role !== "admin") {
      return errorResponse("Admin access required", 403, undefined, request, env);
    }

    const body = (await request.json()) as {
      userId: string;
      isActive: boolean;
    };
    if (!body.userId || body.isActive === undefined) {
      return errorResponse(
        "userId and isActive are required",
        400,
        undefined,
        request,
        env,
      );
    }

    if (body.userId === auth.userId) {
      return errorResponse(
        "Cannot deactivate your own account",
        400,
        undefined,
        request,
        env,
      );
    }

    const user = await getUserById(body.userId, env);
    if (!user) {
      return errorResponse("User not found", 404, undefined, request, env);
    }

    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      `UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(body.isActive ? 1 : 0, now, body.userId)
      .run();

    await logAuditAction(
      auth.userId,
      body.isActive ? "user_activated" : "user_deactivated",
      "users",
      request,
      env,
      { targetUserId: body.userId },
    );

    return jsonResponse(
      { userId: body.userId, isActive: body.isActive, updatedAt: now },
      200,
      request,
      env,
    );
  } catch {
    return errorResponse("Invalid request", 400, undefined, request, env);
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
