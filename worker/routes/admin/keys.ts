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

    const validRoles = ["admin", "user", "readonly"] as const;
    if (!validRoles.includes(body.role as any)) {
      return jsonResponse(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        400,
        request,
      );
    }

    const config: ApiKeyConfig = {
      key: "", // Will be generated
      userId: body.userId,
      role: body.role,
      createdAt: new Date().toISOString(),
      expiresAt: body.expiresAt,
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
    return jsonResponse(
      { error: "Failed to create API key", message: (error as Error).message },
      500,
      request,
    );
  }
}

export async function handleListApiKeys(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const keys = await listApiKeys(env);

    // Sanitize output (don't return keyHash)
    const sanitizedKeys = keys.map((k) => ({
      userId: k.userId,
      role: k.role,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      lastUsed: k.lastUsed,
      rateLimit: k.rateLimit,
    }));

    return jsonResponse({ keys: sanitizedKeys }, 200, request);
  } catch (error) {
    return jsonResponse(
      { error: "Failed to list API keys", message: (error as Error).message },
      500,
      request,
    );
  }
}

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
    return jsonResponse(
      { error: "Failed to revoke API key", message: (error as Error).message },
      500,
      request,
    );
  }
}
