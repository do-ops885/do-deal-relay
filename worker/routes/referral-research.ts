import { handleError } from "../lib/error-handler";
import type { Env, WebResearchRequest } from "../types";
import { WebResearchRequestSchema } from "../types";
import {
  executeReferralResearch,
  convertResearchToReferrals,
  researchAllReferralPossibilities,
} from "../lib/research-agent";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { validateFetchUrl } from "../lib/security";

// ============================================================================
// Referral Research Handlers
// ============================================================================

export async function handleResearch(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type must be application/json" },
        415,
        request,
        env,
      );
    }

    const body = (await request.json()) as WebResearchRequest;

    const validation = WebResearchRequestSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Invalid request body",
          details: validation.error.errors,
        },
        400,
        request,
        env,
      );
    }

    // SSRF protection for domain/query based fetching
    if (body.domain) {
      const isSafe = await validateFetchUrl(`https://${body.domain}`);
      if (!isSafe) {
        return errorResponse("Domain is blocked for security reasons", 403);
      }
    }

    const researchResult = await executeReferralResearch(env, body);

    const referrals = await convertResearchToReferrals(
      env,
      researchResult,
      0.5,
    );

    logger.info(`Research completed for ${body.query}`, {
      component: "api",
      discovered_count: researchResult.discovered_codes.length,
      stored_count: referrals.length,
    });

    return jsonResponse(
      {
        success: true,
        message: "Research completed",
        query: body.query,
        domain: body.domain,
        discovered_codes: researchResult.discovered_codes.length,
        stored_referrals: referrals.length,
        research_metadata: researchResult.research_metadata,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleResearch",
    });
    return jsonResponse(
      { error: "Research failed", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleGetResearchResults(
  domain: string,
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const researchResult = await researchAllReferralPossibilities(
      env,
      domain,
      "thorough",
    );

    return jsonResponse(
      {
        domain,
        discovered_codes: researchResult.discovered_codes,
        research_metadata: researchResult.research_metadata,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetResearchResults",
    });
    return jsonResponse(
      { error: "Failed to get research results", message: err.message },
      500,
      request,
      env,
    );
  }
}
