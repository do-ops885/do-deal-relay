import { handleError } from "../lib/error-handler";
import type {
  Env,
  ReferralInput,
  ReferralDeactivateBody,
  ReferralSearchQuery,
} from "../types";
import {
  ReferralInputSchema,
  ReferralDeactivateBodySchema,
  ReferralSearchQuerySchema,
} from "../types";
import {
  storeReferralInput,
  getReferralByCode,
  searchReferrals,
  deactivateReferral,
  reactivateReferral,
} from "../lib/referral-storage";
import { generateDealId } from "../lib/crypto";
import { logger } from "../lib/global-logger";
import { notify } from "../notify";
import { jsonResponse } from "./utils";
import { validateFetchUrl, validateReferralUrl } from "../lib/security";
import { DEFAULT_SOURCES } from "../config";

const ALLOWED_REFERRAL_DOMAINS = new Set(
  DEFAULT_SOURCES.map((s) => s.domain.toLowerCase()),
);

function isAllowedReferralDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  if (ALLOWED_REFERRAL_DOMAINS.has(normalized)) return true;
  // Allow subdomains of allowed domains
  for (const allowed of ALLOWED_REFERRAL_DOMAINS) {
    if (normalized === allowed || normalized.endsWith(`.${allowed}`))
      return true;
  }
  return false;
}

// ============================================================================
// Referral Management Handlers
// ============================================================================

export async function handleGetReferrals(
  url: URL,
  env: Env,
  request?: Request,
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
        ? parseInt(url.searchParams.get("limit") ?? "100", 10)
        : 100,
      offset: url.searchParams.has("offset")
        ? parseInt(url.searchParams.get("offset") ?? "0", 10)
        : 0,
    };

    const validation = ReferralSearchQuerySchema.safeParse(query);
    if (!validation.success) {
      return jsonResponse(
        { error: "Invalid query parameters", details: validation.error.errors },
        400,
        request,
        env,
      );
    }

    const { referrals, total } = await searchReferrals(env, query);

    return jsonResponse(
      {
        referrals,
        total,
        limit: query.limit,
        offset: query.offset,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    handleError(error, {
      component: "api",
      handler: "handleGetReferrals",
    });
    return jsonResponse(
      { error: "Failed to retrieve referrals" },
      500,
      request,
      env,
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
        request,
        env,
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Validate raw body shape before any casts
    if (
      typeof body.code !== "string" ||
      typeof body.url !== "string" ||
      typeof body.domain !== "string" ||
      !body.code ||
      !body.url ||
      !body.domain
    ) {
      return jsonResponse(
        {
          error:
            "Missing required fields: code, url, domain must be non-empty strings",
        },
        400,
        request,
        env,
      );
    }

    const code = body.code;
    const url = body.url;
    const domain = body.domain;

    // Strict body validation: reject unknown mistyped metadata fields before trust
    const rawValidation = ReferralInputSchema.safeParse({
      code,
      url,
      source: body.source,
      metadata: body.metadata,
    });
    if (!rawValidation.success) {
      return jsonResponse(
        {
          error: "Validation failed",
          details: rawValidation.error.errors,
        },
        400,
        request,
        env,
      );
    }

    // Validate referral URL against domain (Security Hardening)
    if (!validateReferralUrl(url, domain)) {
      return jsonResponse(
        {
          error: "Invalid referral URL",
          message: "The URL must use HTTPS and match the provided domain.",
        },
        400,
        request,
        env,
      );
    }

    // SSRF hardening: validate URL against blocked hosts/private IPs (before allowlist so loopback returns Disallowed URL)
    if (!(await validateFetchUrl(url))) {
      return jsonResponse(
        {
          error: "Disallowed URL",
          message:
            "The provided referral URL failed security validation (SSRF protection).",
        },
        400,
        request,
        env,
      );
    }

    // Domain allowlist check: client-supplied domain must be in allowed set
    if (!isAllowedReferralDomain(domain)) {
      return jsonResponse(
        {
          error: "Domain not allowed",
          message: `Domain ${domain} is not in the allowed referral domain list`,
        },
        400,
        request,
        env,
      );
    }

    // TOCTOU guard: check-then-insert with post-insert conflict detection
    const existing = await getReferralByCode(env, code);
    if (existing) {
      return jsonResponse(
        {
          error: "Referral code already exists",
          existing_id: existing.id,
        },
        409,
        request,
        env,
      );
    }

    const id = await generateDealId(
      (body.source as string) || "api",
      code,
      "referral",
    );
    const now = new Date().toISOString();

    const bodyMetadata = (body.metadata as ReferralInput["metadata"]) || {};
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
        reward_type: bodyMetadata.reward_type || "unknown",
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
        request,
        env,
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
      request,
      env,
    );
  } catch (error) {
    handleError(error, {
      component: "api",
      handler: "handleCreateReferral",
    });
    return jsonResponse(
      { error: "Failed to create referral" },
      500,
      request,
      env,
    );
  }
}

export async function handleGetReferralByCode(
  code: string,
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const referral = await getReferralByCode(env, code);

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404, request, env);
    }

    const url = new URL(request?.url || "");
    const redirect = url.searchParams.get("redirect") === "true";

    if (redirect) {
      // Referral-specific redirect validation: ensure stored URL matches its domain and is allowed
      const referralDomain = referral.domain || "";
      if (
        !referral.url ||
        !isAllowedReferralDomain(referralDomain) ||
        !validateReferralUrl(referral.url, referralDomain) ||
        !(await validateFetchUrl(referral.url))
      ) {
        return jsonResponse(
          { error: "Invalid redirect URL" },
          400,
          request,
          env,
        );
      }
      return Response.redirect(referral.url, 302);
    }

    return jsonResponse({ referral }, 200, request, env);
  } catch (error) {
    handleError(error, {
      component: "api",
      handler: "handleGetReferralByCode",
    });
    return jsonResponse(
      { error: "Failed to retrieve referral" },
      500,
      request,
      env,
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
        request,
        env,
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
      return jsonResponse({ error: "Referral not found" }, 404, request, env);
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

    return jsonResponse(
      {
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
      },
      200,
      request,
      env,
    );
  } catch (error) {
    handleError(error, {
      component: "api",
      handler: "handleDeactivateReferral",
    });
    return jsonResponse(
      { error: "Failed to deactivate referral" },
      500,
      request,
      env,
    );
  }
}

export async function handleReactivateReferral(
  code: string,
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    // Atomic check: fetch and let reactivateReferral handle status; pre-check for early 404/409
    const existing = await getReferralByCode(env, code);
    if (!existing) {
      return jsonResponse({ error: "Referral not found" }, 404, request, env);
    }

    if (existing.status === "active") {
      return jsonResponse(
        { error: "Conflict", message: "Referral is already active" },
        409,
        request,
        env,
      );
    }

    const referral = await reactivateReferral(env, code);

    if (!referral) {
      return jsonResponse({ error: "Referral not found" }, 404, request, env);
    }

    logger.info(`Referral reactivated: ${code}`, {
      component: "api",
    });

    await notify(env, {
      type: "trust_anomaly",
      severity: "info",
      run_id: `reactivate-${Date.now()}`,
      message: `Referral code ${code} reactivated`,
    });

    return jsonResponse(
      {
        success: true,
        message: "Referral reactivated successfully",
        referral: {
          id: referral.id,
          code: referral.code,
          url: referral.url,
          domain: referral.domain,
          status: referral.status,
        },
      },
      200,
      request,
      env,
    );
  } catch (error) {
    handleError(error, {
      component: "api",
      handler: "handleReactivateReferral",
    });
    return jsonResponse(
      { error: "Failed to reactivate referral" },
      500,
      request,
      env,
    );
  }
}
