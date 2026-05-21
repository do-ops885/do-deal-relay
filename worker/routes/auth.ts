import type {
  Env,
  User,
  UserPublic,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
} from "../types";
import { handleError } from "../lib/error-handler";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { generateUUID } from "../lib/crypto";
import { createToken, hashPassword, verifyPassword } from "../lib/jwt";
import { hasPermission } from "../middleware/authorization";
import type { AuthResult } from "../lib/auth";

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

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  return null;
}

async function createAuditLog(
  env: Env,
  userId: string | null,
  action: string,
  resource: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  try {
    if (!env.DEALS_DB) return;
    const id = generateUUID();
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      "INSERT INTO audit_log (id, user_id, action, resource, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, userId, action, resource, ip, userAgent, now)
      .run();
  } catch (error) {
    logger.error("Failed to create audit log entry", {
      component: "auth",
      action,
      resource,
      error: (error as Error).message,
    });
  }
}

export async function handleRegister(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!env.DEALS_DB) {
      return errorResponse(
        "Database not available",
        503,
        undefined,
        request,
        env,
      );
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return errorResponse(
        "Content-Type must be application/json",
        415,
        undefined,
        request,
        env,
      );
    }

    const body = (await request.json()) as CreateUserInput;
    const { email, name, password } = body;

    if (!email || !name || !password) {
      return errorResponse(
        "Missing required fields: email, name, password",
        400,
        undefined,
        request,
        env,
      );
    }

    if (!validateEmail(email)) {
      return errorResponse(
        "Invalid email format",
        400,
        undefined,
        request,
        env,
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return errorResponse(passwordError, 400, undefined, request, env);
    }

    const existing = await env.DEALS_DB.prepare(
      "SELECT id FROM users WHERE email = ?",
    )
      .bind(email.toLowerCase())
      .first();

    if (existing) {
      return errorResponse(
        "Email already registered",
        409,
        undefined,
        request,
        env,
      );
    }

    const id = generateUUID();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    await env.DEALS_DB.prepare(
      "INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'viewer', 1, ?, ?)",
    )
      .bind(id, email.toLowerCase(), name, passwordHash, now, now)
      .run();

    const token = await createToken(
      { sub: id, role: "viewer", email: email.toLowerCase() },
      env.JWT_SECRET,
      "24h",
    );

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      null;
    const userAgent = request.headers.get("User-Agent") || null;
    await createAuditLog(env, id, "user.register", `user:${id}`, ip, userAgent);

    logger.info("User registered", {
      component: "auth",
      userId: id,
      email: email.toLowerCase(),
    });

    return jsonResponse(
      {
        success: true,
        message: "Registration successful",
        user: toPublicUser({
          id,
          email: email.toLowerCase(),
          name,
          password_hash: passwordHash,
          role: "viewer",
          is_active: 1,
          created_at: now,
          updated_at: now,
        }),
        token,
      },
      201,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleRegister",
    });
    return jsonResponse(
      { error: "Registration failed", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!env.DEALS_DB) {
      return errorResponse(
        "Database not available",
        503,
        undefined,
        request,
        env,
      );
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return errorResponse(
        "Content-Type must be application/json",
        415,
        undefined,
        request,
        env,
      );
    }

    const body = (await request.json()) as LoginInput;
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse(
        "Missing required fields: email, password",
        400,
        undefined,
        request,
        env,
      );
    }

    const user = await env.DEALS_DB.prepare(
      "SELECT * FROM users WHERE email = ?",
    )
      .bind(email.toLowerCase())
      .first<User>();

    if (!user) {
      return errorResponse(
        "Invalid email or password",
        401,
        undefined,
        request,
        env,
      );
    }

    if (!user.is_active) {
      return errorResponse(
        "Account is deactivated",
        403,
        undefined,
        request,
        env,
      );
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return errorResponse(
        "Invalid email or password",
        401,
        undefined,
        request,
        env,
      );
    }

    const token = await createToken(
      { sub: user.id, role: user.role, email: user.email },
      env.JWT_SECRET || "dev-secret",
      "24h",
    );

    const refreshToken = env.JWT_REFRESH_SECRET
      ? await createToken(
          { sub: user.id, type: "refresh" },
          env.JWT_REFRESH_SECRET,
          "7d",
        )
      : undefined;

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      null;
    const userAgent = request.headers.get("User-Agent") || null;
    await createAuditLog(
      env,
      user.id,
      "user.login",
      `user:${user.id}`,
      ip,
      userAgent,
    );

    logger.info("User logged in", { component: "auth", userId: user.id });

    return jsonResponse(
      {
        success: true,
        message: "Login successful",
        user: toPublicUser(user),
        token,
        refresh_token: refreshToken,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleLogin",
    });
    return jsonResponse(
      { error: "Login failed", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleRefreshToken(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!env.DEALS_DB) {
      return errorResponse(
        "Database not available",
        503,
        undefined,
        request,
        env,
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse(
        "Missing or invalid token",
        401,
        undefined,
        request,
        env,
      );
    }

    const token = authHeader.slice(7);
    if (!token) {
      return errorResponse("Missing token", 401, undefined, request, env);
    }

    const { verifyToken: verifyJwt } = await import("../lib/jwt");
    const refreshSecret =
      env.JWT_REFRESH_SECRET || env.JWT_SECRET || "dev-secret";
    const payload = await verifyJwt(token, refreshSecret);

    if (!payload) {
      return errorResponse(
        "Invalid or expired refresh token",
        401,
        undefined,
        request,
        env,
      );
    }

    const userId = payload.sub as string;
    const user = await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first<User>();

    if (!user) {
      return errorResponse("User not found", 404, undefined, request, env);
    }

    if (!user.is_active) {
      return errorResponse(
        "Account is deactivated",
        403,
        undefined,
        request,
        env,
      );
    }

    const newToken = await createToken(
      { sub: user.id, role: user.role, email: user.email },
      env.JWT_SECRET || "dev-secret",
      "24h",
    );

    const newRefreshToken = env.JWT_REFRESH_SECRET
      ? await createToken(
          { sub: user.id, type: "refresh" },
          env.JWT_REFRESH_SECRET,
          "7d",
        )
      : undefined;

    logger.info("Token refreshed", { component: "auth", userId: user.id });

    return jsonResponse(
      {
        success: true,
        token: newToken,
        refresh_token: newRefreshToken,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleRefreshToken",
    });
    return jsonResponse(
      { error: "Token refresh failed", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleGetCurrentUser(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!env.DEALS_DB) {
      return errorResponse(
        "Database not available",
        503,
        undefined,
        request,
        env,
      );
    }

    const userId = auth.userId;
    if (!userId) {
      return errorResponse(
        "User not authenticated",
        401,
        undefined,
        request,
        env,
      );
    }

    const user = await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first<User>();

    if (!user) {
      return errorResponse("User not found", 404, undefined, request, env);
    }

    return jsonResponse({ user: toPublicUser(user) }, 200, request, env);
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetCurrentUser",
    });
    return jsonResponse(
      { error: "Failed to get user", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleUpdateProfile(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!env.DEALS_DB) {
      return errorResponse(
        "Database not available",
        503,
        undefined,
        request,
        env,
      );
    }

    const userId = auth.userId;
    if (!userId) {
      return errorResponse(
        "User not authenticated",
        401,
        undefined,
        request,
        env,
      );
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return errorResponse(
        "Content-Type must be application/json",
        415,
        undefined,
        request,
        env,
      );
    }

    const body = (await request.json()) as UpdateUserInput;
    const { name, email } = body;

    if (!name && !email) {
      return errorResponse("Nothing to update", 400, undefined, request, env);
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }

    if (email !== undefined) {
      if (!validateEmail(email)) {
        return errorResponse(
          "Invalid email format",
          400,
          undefined,
          request,
          env,
        );
      }

      const existing = await env.DEALS_DB.prepare(
        "SELECT id FROM users WHERE email = ? AND id != ?",
      )
        .bind(email.toLowerCase(), userId)
        .first();

      if (existing) {
        return errorResponse(
          "Email already in use",
          409,
          undefined,
          request,
          env,
        );
      }

      updates.push("email = ?");
      values.push(email.toLowerCase());
    }

    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(userId);

    await env.DEALS_DB.prepare(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
    )
      .bind(...values)
      .run();

    const user = await env.DEALS_DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first<User>();

    logger.info("User profile updated", { component: "auth", userId });

    return jsonResponse(
      {
        success: true,
        message: "Profile updated",
        user: user ? toPublicUser(user) : undefined,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleUpdateProfile",
    });
    return jsonResponse(
      { error: "Failed to update profile", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleListUsers(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!env.DEALS_DB) {
      return errorResponse(
        "Database not available",
        503,
        undefined,
        request,
        env,
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10),
      100,
    );
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const { results } = await env.DEALS_DB.prepare(
      "SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
      .bind(limit, offset)
      .all<UserPublic>();

    const totalResult = await env.DEALS_DB.prepare(
      "SELECT COUNT(*) as count FROM users",
    ).first<{ count: number }>();

    return jsonResponse(
      {
        users: results,
        total: totalResult?.count ?? 0,
        limit,
        offset,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleListUsers",
    });
    return jsonResponse(
      { error: "Failed to list users", message: err.message },
      500,
      request,
      env,
    );
  }
}
