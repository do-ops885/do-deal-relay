import type {
  Env,
  User,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
} from "../types";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { generateUUID } from "../lib/crypto";
import { createToken, hashPassword, verifyPassword } from "../lib/jwt";
import { toErrCtx } from "../lib/errors";
import {
  JWT_EXPIRATION_SECONDS,
  DUMMY_VERIFICATION_RECORD,
  getJwtSecret,
  getRefreshSecret,
  toPublicUser,
  getUserResponse,
  getUserById,
  logAuditAction,
} from "./auth-helpers";

// ============================================================================
// Core auth logic
// ============================================================================

/**
 * Register a new user in D1 database and log audit event.
 * @param input User registration input data
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response with created public user profile
 */
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

/**
 * Authenticate user credentials and issue access/refresh JWT tokens.
 * @param input Login input credentials
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response with access token, refresh token, and token expiration
 */
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
    // Execute verifyPassword even if user is not found to prevent user enumeration via timing side-channels
    const recordToVerify = user
      ? user.password_hash
      : DUMMY_VERIFICATION_RECORD;
    const isValid = await verifyPassword(input.password, recordToVerify);
    if (!user || !isValid)
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
        expiresIn: JWT_EXPIRATION_SECONDS,
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

/**
 * Verify refresh token and generate new access/refresh token pair.
 * @param token Encoded refresh token string
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response containing new access token and optional refreshed token
 */
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
        expiresIn: JWT_EXPIRATION_SECONDS,
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

/**
 * Retrieve public profile for given user ID.
 * @param userId Unique identifier of user
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response containing public user profile
 */
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

/**
 * Update user attributes in D1 database and write audit record.
 * @param userId Unique identifier of user
 * @param input Updatable user attributes
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response with updated public user profile
 */
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
