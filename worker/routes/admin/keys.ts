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
  hashApiKey,
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
    return jsonResponse({ error: "Failed to create API key" }, 500, request);
  }
}

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

/**
 * Rotate an API key: revoke the old key and create a new one with the same config.
 * POST /api/admin/keys/:hash/rotate (NEW-FEAT-4)
 */
export async function handleRotateApiKey(
  request: Request,
  keyHash: string,
  env: Env,
): Promise<Response> {
  try {
    // Look up existing key
    const keys = await listApiKeys(env);
    const existing = keys.find((k) => k.keyHash === keyHash);

    if (!existing) {
      return jsonResponse({ error: "API key not found" }, 404, request);
    }

    // Revoke old key
    await revokeApiKey(env, keyHash);

    // Create new key with same config. Do not propagate an already-past
    // expiresAt: it would make storeApiKey put a past expiration and fail
    // with a 500. A rotated key gets a fresh (unset) expiry instead.
    const config: ApiKeyConfig = {
      key: "",
      userId: existing.userId,
      role: existing.role,
      createdAt: new Date().toISOString(),
      expiresAt:
        existing.expiresAt &&
        new Date(existing.expiresAt).getTime() > Date.now()
          ? existing.expiresAt
          : undefined,
      rateLimit: existing.rateLimit || {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
      },
    };

    const newApiKey = await storeApiKey(env, config);

    return jsonResponse(
      {
        success: true,
        apiKey: newApiKey,
        rotatedFrom: keyHash,
        message:
          "API key rotated successfully. Old key revoked, new key created. Store this key securely.",
      },
      201,
      request,
    );
  } catch (error) {
    return jsonResponse({ error: "Failed to rotate API key" }, 500, request);
  }
}
