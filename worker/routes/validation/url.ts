import type { Env } from "../../types";
import { AuthResult } from "../../lib/auth";
import { jsonResponse, errorResponse } from "../utils";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";
import { validateFetchUrl } from "../../lib/security";
import { validateUrl } from "../../lib/validation/url-validator";
import { logger } from "../../lib/global-logger";

interface ValidateUrlBody {
  url: string;
}

export async function handleValidateUrl(
  request: Request,
  env: Env,
  auth?: AuthResult,
): Promise<Response> {
  const clientId = await getClientIdentifier(request, auth);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/validate/url",
  );

  if (!rateLimitResult.allowed) {
    return errorResponse(
      "Rate limit exceeded",
      429,
      { retry_after: rateLimitResult.resetTime },
      request,
      env,
    );
  }

  try {
    const body = (await request.json()) as ValidateUrlBody;

    if (!body.url || typeof body.url !== "string") {
      return errorResponse("URL is required", 400, undefined, request, env);
    }

    try {
      new URL(body.url);
    } catch {
      return errorResponse("Invalid URL format", 400, undefined, request, env);
    }

    logger.info("URL validation request", {
      component: "validation-api",
      url: body.url,
      clientId: clientId.slice(0, 8),
    });

    const isSafe = await validateFetchUrl(body.url);
    if (!isSafe) {
      return errorResponse("URL is blocked for security reasons", 403);
    }

    const result = await validateUrl(body.url, env);

    const headers = createRateLimitHeaders(rateLimitResult);
    const response = jsonResponse(
      result,
      result.valid ? 200 : 400,
      request,
      env,
    );
    headers.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Validation failed";
    logger.error("URL validation error", {
      component: "validation-api",
      error: errorMessage,
    });
    return errorResponse(
      "Validation failed",
      500,
      { detail: errorMessage },
      request,
      env,
    );
  }
}
