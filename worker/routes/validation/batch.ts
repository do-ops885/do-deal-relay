import type { Env } from "../../types";
import { AuthResult } from "../../lib/auth";
import { jsonResponse, errorResponse } from "../utils";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";
import {
  checkUrlStatusBatch,
  getValidationSummary,
} from "../../lib/validation/url-validator";
import { batchScrapeRewards } from "../../lib/validation/reward-scraper";
import { getProductionSnapshot } from "../../lib/storage";
import { logger } from "../../lib/global-logger";

interface ValidateBatchBody {
  urls: string[];
  checkRewards?: boolean;
}

export async function handleValidateBatch(
  request: Request,
  env: Env,
  auth?: AuthResult,
): Promise<Response> {
  const clientId = await getClientIdentifier(request, auth);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/validate/batch",
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
    const body = (await request.json()) as ValidateBatchBody;

    if (!Array.isArray(body.urls)) {
      return errorResponse(
        "urls array is required",
        400,
        undefined,
        request,
        env,
      );
    }

    if (body.urls.length === 0) {
      return errorResponse(
        "urls array cannot be empty",
        400,
        undefined,
        request,
        env,
      );
    }

    if (body.urls.length > 50) {
      return errorResponse(
        "Maximum 50 URLs per batch",
        400,
        undefined,
        request,
        env,
      );
    }

    for (const url of body.urls) {
      if (typeof url !== "string") {
        return errorResponse(
          "All URLs must be strings",
          400,
          undefined,
          request,
          env,
        );
      }
      try {
        new URL(url);
      } catch {
        return errorResponse(
          `Invalid URL: ${url}`,
          400,
          undefined,
          request,
          env,
        );
      }
    }

    logger.info("Batch validation request", {
      component: "validation-api",
      count: body.urls.length,
      clientId: clientId.slice(0, 8),
    });

    const urlResults = await checkUrlStatusBatch(body.urls, env);

    let rewardResults = null;
    if (body.checkRewards) {
      const snapshot = await getProductionSnapshot(env);
      if (snapshot) {
        const dealsToCheck = snapshot.deals.filter((d) =>
          body.urls.includes(d.url),
        );
        rewardResults = await batchScrapeRewards(dealsToCheck, env);
      }
    }

    const summary = getValidationSummary(urlResults.results);

    const result = {
      summary,
      urls: urlResults.results,
      rewards: rewardResults?.map((r) => ({
        url: r.url,
        rewardChanged: r.rewardChanged,
        currentReward: r.currentReward,
        previousReward: r.previousReward,
      })),
      errors: urlResults.errors,
    };

    const headers = createRateLimitHeaders(rateLimitResult);
    const response = jsonResponse(
      result,
      urlResults.errors.length > 0 ? 207 : 200,
      request,
      env,
    );
    headers.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Batch validation failed";
    logger.error("Batch validation error", {
      component: "validation-api",
      error: errorMessage,
    });
    return errorResponse(
      "Batch validation failed",
      500,
      { detail: errorMessage },
      request,
      env,
    );
  }
}
