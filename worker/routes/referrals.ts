import { handleError } from "../lib/error-handler";
import type {
  Env,
  ReferralInput,
  ReferralDeactivateBody,
  ReferralSearchQuery,
  WebResearchRequest,
} from "../types";
import {
  ReferralInputSchema,
  ReferralDeactivateBodySchema,
  ReferralSearchQuerySchema,
  WebResearchRequestSchema,
} from "../types";
import {
  storeReferralInput,
  getReferralByCode,
  searchReferrals,
  deactivateReferral,
  reactivateReferral,
} from "../lib/referral-storage";
import {
  executeReferralResearch,
  convertResearchToReferrals,
  researchAllReferralPossibilities,
} from "../lib/research-agent";
import { generateDealId } from "../lib/crypto";
import { logger } from "../lib/global-logger";
import { notify } from "../notify";
import { jsonResponse } from "./utils";

// ============================================================================
// Referral Management Handlers
// ============================================================================

export async function handleGetReferrals(
  url: URL,
  env: Env,
): Promise<Response> {
  try {
    const query: ReferralSearchQuery = {
      domain: url.searchParams.get("domain") || undefined,
      status:
        (url.searchParams.get("status") as ReferralSearchQuery["status"]) ||
        "all",
      category: url.searchParams.get("category") || undefined,
      source:
        (url.searchParams.get("source") as ReferralSearchQuery["source"]) ||
        "all",
      limit: url.searchParams.has("limit")
        ? parseInt(url.searchParams.get("limit")!, 10)
        : 100,
      offset: url.searchParams.has("offset")
        ? parseInt(url.searchParams.get("offset")!, 10)
        : 0,
    };

    const validation = ReferralSearchQuerySchema.safeParse(query);
    if (!validation.success) {
      return jsonResponse(
        { error: "Invalid query parameters", details: validation.error.errors },
        400,
      );
    }

    const { referrals, total } = await searchReferrals(env, query);

    return jsonResponse({
      referrals,
      total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetReferrals",
    });
    return jsonResponse(
      { error: "Failed to retrieve referrals", message: err.message },
      500,
    );
  }
}

export async function handleCreateReferral(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type must be application/json" },
        415,
      );
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }

    const body = (await request.json()) as Record<string, unknown>;

    const code = body.code as string;
    const url = body.url as string;
    const domain = body.domain as string;

    if (!code || !url || !domain) {
      return jsonResponse(
        { error: "Missing required fields: code, url, domain" },
        400,
      );
    }

    const existing = await getReferralByCode(env, code);
    if (existing) {
      return jsonResponse(
        {
          error: "Referral code already exists",
          existing_id: existing.id,
        },
        409,
      );
    }

    const id = await generateDealId(
      (body.source as string) || "api",
      code,
      "referral",
    );
    const now = new Date().toISOString();

    const bodyMetadata = (body.metadata as Record<string, unknown>) || {};
    const referral: ReferralInput = {
      id,
      code,
      url,
      domain,
      source: (body.source as ReferralInput["source"]) || "api",
      status: "quarantined",
      submitted_at: now,
      submitted_by: (body.submitted_by as string) || "api",
      expires_at: body.expires_at as string | undefined,
      metadata: {
        title: (bodyMetadata.title as string) || `${domain} Referral`,
        description:
          (bodyMetadata.description as string) || `Referral code for ${domain}`,
        reward_type:
          (bodyMetadata.reward_type as ReferralInput["metadata"]["reward_type"]) ||
          "unknown",
        reward_value: bodyMetadata.reward_value as string | number | undefined,
        currency: bodyMetadata.currency as string | undefined,
        category: (bodyMetadata.category as string[]) || ["general"],
        tags: (bodyMetadata.tags as string[]) || ["api-added"],
        requirements: (bodyMetadata.requirements as string[]) || [],
        confidence_score: (bodyMetadata.confidence_score as number) || 0.5,
        notes: bodyMetadata.notes as string | undefined,
      },
    };

    const validation = ReferralInputSchema.safeParse(referral);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Validation failed",
          details: validation.error.errors,
        },
        400,
      );
    }

    await storeReferralInput(env, referral);

    logger.info(`Referral created: ${referral.code} for ${referral.domain}`, {
      component: "api",
      referral_id: referral.id,
    });

    return jsonResponse(
      {
        success: true,
        message: "Referral created successfully",
        referral: {
          id: referral.id,
          code: referral.code,
          url: referral.url,
          domain: referral.domain,
          status: referral.status,
        },
      },
      201,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleCreateReferral",
    });
    return jsonResponse(
      { error: "Failed to create referral", message: err.message },
      500,
    );
  }
}

export async function handleGetReferralByCode(
  code: string,
  env: Env,
): Promise<Response> {
  try {
    const referral = await getReferralByCode(env, code);

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404);
    }

    return jsonResponse({ referral });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetReferralByCode",
    });
    return jsonResponse(
      { error: "Failed to retrieve referral", message: err.message },
      500,
    );
  }
}

export async function handleDeactivateReferral(
  request: Request,
  code: string,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as ReferralDeactivateBody;

    const validation = ReferralDeactivateBodySchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Invalid request body",
          details: validation.error.errors,
        },
        400,
      );
    }

    const referral = await deactivateReferral(
      env,
      code,
      body.reason,
      body.replaced_by,
      body.notes,
    );

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404);
    }

    logger.info(`Referral deactivated: ${code}`, {
      component: "api",
      reason: body.reason,
    });

    await notify(env, {
      type: "trust_anomaly",
      severity: "info",
      run_id: `deactivate-${Date.now()}`,
      message: `Referral code ${code} deactivated: ${body.reason}`,
    });

    return jsonResponse({
      success: true,
      message: "Referral deactivated successfully",
      referral: {
        id: referral.id,
        code: referral.code,
        url: referral.url,
        domain: referral.domain,
        status: referral.status,
        deactivated_at: referral.deactivated_at,
        reason: referral.deactivated_reason,
      },
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleDeactivateReferral",
    });
    return jsonResponse(
      { error: "Failed to deactivate referral", message: err.message },
      500,
    );
  }
}

export async function handleReactivateReferral(
  code: string,
  env: Env,
): Promise<Response> {
  try {
    const referral = await reactivateReferral(env, code);

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404);
    }

    logger.info(`Referral reactivated: ${code}`, {
      component: "api",
    });

    return jsonResponse({
      success: true,
      message: "Referral reactivated successfully",
      referral: {
        id: referral.id,
        code: referral.code,
        url: referral.url,
        domain: referral.domain,
        status: referral.status,
      },
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleReactivateReferral",
    });
    return jsonResponse(
      { error: "Failed to reactivate referral", message: err.message },
      500,
    );
  }
}

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
      );
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

    return jsonResponse({
      success: true,
      message: "Research completed",
      query: body.query,
      domain: body.domain,
      discovered_codes: researchResult.discovered_codes.length,
      stored_referrals: referrals.length,
      research_metadata: researchResult.research_metadata,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleResearch",
    });
    return jsonResponse(
      { error: "Research failed", message: err.message },
      500,
    );
  }
}

export async function handleGetResearchResults(
  domain: string,
  env: Env,
): Promise<Response> {
  try {
    const researchResult = await researchAllReferralPossibilities(
      env,
      domain,
      "thorough",
    );

    return jsonResponse({
      domain,
      discovered_codes: researchResult.discovered_codes,
      research_metadata: researchResult.research_metadata,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "api",
      handler: "handleGetResearchResults",
    });
    return jsonResponse(
      { error: "Failed to get research results", message: err.message },
      500,
    );
  }
}
