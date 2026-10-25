/**
 * Admin API Routes - API Key Management
 *
 * Handles POST /api/admin/keys, GET /api/admin/keys, DELETE /api/admin/keys/:hash
 */

import { Env } from "../../types";
import {
  storeApiKey,
  listApiKeys,
  revokeApiKey,
  ApiKeyConfig,
} from "../../lib/auth";
import { jsonResponse } from "../utils";

/**
 * Handle POST /api/admin/keys to generate and store a new API key with role authorization
 * @param request - Incoming HTTP Request with JSON body containing userId, role (admin|user|readonly), and optional rateLimit
 * @param env - Worker environment bindings
 * @returns JSON response containing the generated API key or an error message
 */
export async function handleCreateApiKey(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<ApiKeyConfig>;

    if (!body.userId || !body.role) {
      return jsonResponse(
        { error: "Missing required fields: userId, role" },
        400,
        request,
      );
    }

    // Security check: Validate role against permitted API key roles
    const ALLOWED_API_KEY_ROLES = ["admin", "user", "readonly"] as const;
    if (!ALLOWED_API_KEY_ROLES.includes(body.role as any)) {
      return jsonResponse(
        { error: "Invalid role. Allowed roles: admin, user, readonly" },
        400,
        request,
      );
    }

    const config: ApiKeyConfig = {
      key: "", // Will be generated
      userId: body.userId,
      role: body.role,
      createdAt: new Date().toISOString(),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
      rateLimit: body.rateLimit || {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
      },
    };

    const apiKey = await storeApiKey(env, config);

    return jsonResponse(
      {
        success: true,
        apiKey,
        message:
          "API key created successfully. Store this key securely, it will not be shown again.",
      },
      201,
      request,
    );
  } catch (error) {
    return jsonResponse({ error: "Failed to create API key" }, 500, request);
  }
}

/**
 * Handle GET /api/admin/keys to list registered API keys with sanitized metadata
 * @param request - Incoming HTTP Request
 * @param env - Worker environment bindings
 * @returns JSON response containing sanitized list of API key records
 */
export async function handleListApiKeys(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const keys = await listApiKeys(env);

    // Sanitize output (include hash for revocation, but not the key itself)
    const sanitizedKeys = keys.map((k) => ({
      hash: k.keyHash,
      userId: k.userId,
      role: k.role,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      lastUsed: k.lastUsed,
      rateLimit: k.rateLimit,
    }));

    return jsonResponse({ keys: sanitizedKeys }, 200, request);
  } catch (error) {
    return jsonResponse({ error: "Failed to list API keys" }, 500, request);
  }
}

/**
 * Handle DELETE /api/admin/keys/:hash to revoke an active API key by its hash
 * @param request - Incoming HTTP Request
 * @param keyHash - Key hash identifier to revoke
 * @param env - Worker environment bindings
 * @returns JSON response indicating revocation success or 404 if not found
 */
export async function handleRevokeApiKey(
  request: Request,
  keyHash: string,
  env: Env,
): Promise<Response> {
  try {
    const success = await revokeApiKey(env, keyHash);

    if (!success) {
      return jsonResponse({ error: "API key not found" }, 404, request);
    }

    return jsonResponse(
      { success: true, message: "API key revoked successfully" },
      200,
      request,
    );
  } catch (error) {
    return jsonResponse({ error: "Failed to revoke API key" }, 500, request);
  }
}
