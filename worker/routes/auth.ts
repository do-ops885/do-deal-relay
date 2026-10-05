import type {
  Env,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
} from "../types";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { toErrCtx } from "../lib/errors";
import type { AuthResult } from "../lib/auth";
import { getUserById, getUserResponse, toPublicUser } from "./auth-helpers";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  updateProfile,
} from "./auth-service";

// Barrel re-exports (IMP-6): auth.ts was split into auth-helpers.ts and
// auth-service.ts; every existing importer of "../routes/auth" is unchanged.
export {
  JWT_EXPIRATION_SECONDS,
  getJwtSecret,
  getRefreshSecret,
} from "./auth-helpers";
export {
  registerUser,
  loginUser,
  refreshAccessToken,
  getProfile,
  updateProfile,
} from "./auth-service";

// ============================================================================
// Handle functions (called by index.ts router)
// ============================================================================

/**
 * HTTP route handler for user registration.
 * @param request HTTP request containing user registration credentials
 * @param env Worker environment bindings
 * @returns Response with public user metadata or error
 */
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

/**
 * HTTP route handler for user authentication.
 * @param request HTTP request containing login credentials
 * @param env Worker environment bindings
 * @returns Response containing JWT access and refresh tokens or error
 */
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

/**
 * HTTP route handler for refreshing access tokens.
 * @param request HTTP request containing refresh token payload
 * @param env Worker environment bindings
 * @returns Response containing new JWT access token or error
 */
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

/**
 * HTTP route handler for retrieving current authenticated user profile.
 * @param auth Authenticated user context
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response containing public user details
 */
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

/**
 * HTTP route handler for updating user profile attributes.
 * @param auth Authenticated user context
 * @param request HTTP request containing user profile updates
 * @param env Worker environment bindings
 * @returns Response containing updated user profile
 */
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

/**
 * HTTP route handler for listing all registered users.
 * @param auth Authenticated user context
 * @param request HTTP request
 * @param env Worker environment bindings
 * @returns Response listing registered users
 */
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
