import type { Env } from "../../types";
import { AuthResult } from "../../lib/auth";
import { jsonResponse, errorResponse } from "../utils";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";
import { validateUrl } from "../../lib/validation/url-validator";
import { validateCodeComplete } from "../../lib/validation/code-validator";
import { scrapeCurrentRewards } from "../../lib/validation/reward-scraper";
import { getDealsByCode } from "../../lib/storage";
import { logger } from "../../lib/global-logger";

interface ValidateDealBody {
  checkUrl?: boolean;
  checkCode?: boolean;
  checkRewards?: boolean;
}

export async function handleValidateDeal(
  request: Request,
  code: string,
  env: Env,
  auth?: AuthResult,
): Promise<Response> {
  const clientId = await getClientIdentifier(request, auth);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/deals/validate",
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
    let options: ValidateDealBody = {};
    if (request.headers.get("content-type")?.includes("application/json")) {
      options = (await request.json()) as ValidateDealBody;
    }

    const checkUrl = options.checkUrl !== false;
    const checkCode = options.checkCode !== false;
    const checkRewards = options.checkRewards === true;

    logger.info(`Deal validation request: ${code}`, {
      component: "validation-api",
      code,
      checkUrl,
      checkCode,
      checkRewards,
    });

    const deals = await getDealsByCode(env, code);

    if (deals.length === 0) {
      return errorResponse("Deal not found", 404, undefined, request, env);
    }

    const deal = deals[0];
    if (!deal)
      return errorResponse("Deal not found", 404, undefined, request, env);

    const results: {
      deal: {
        id: string;
        code: string;
        domain: string;
        url: string;
        status: string;
      };
      url?: Awaited<ReturnType<typeof validateUrl>>;
      code?: Awaited<ReturnType<typeof validateCodeComplete>>;
      rewards?: Awaited<ReturnType<typeof scrapeCurrentRewards>>;
      valid: boolean;
      issues: string[];
    } = {
      deal: {
        id: deal.id,
        code: deal.code,
        domain: deal.source.domain,
        url: deal.url,
        status: deal.metadata.status,
      },
      valid: true,
      issues: [],
    };

    if (checkUrl) {
      results.url = await validateUrl(deal.url, env);
      if (!results.url.valid) {
        results.valid = false;
        results.issues.push(`URL validation failed: ${results.url.error}`);
      }
    }

    if (checkCode) {
      results.code = await validateCodeComplete(
        deal.code,
        "auto",
        deal.url,
        env,
      );
      if (!results.code.valid) {
        results.valid = false;
        results.issues.push(
          `Code validation failed: ${results.code.errors.join(", ")}`,
        );
      }
    }

    if (checkRewards) {
      results.rewards = await scrapeCurrentRewards(deal.url, env);
      if (results.rewards.rewardChanged) {
        results.issues.push("Reward has changed since last update");
      }
    }

    const headers = createRateLimitHeaders(rateLimitResult);
    const response = jsonResponse(
      results,
      results.valid ? 200 : 400,
      request,
      env,
    );
    headers.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Deal validation failed";
    logger.error("Deal validation error", {
      component: "validation-api",
      code,
      error: errorMessage,
    });
    return errorResponse(
      "Deal validation failed",
      500,
      { detail: errorMessage },
      request,
      env,
    );
  }
}
