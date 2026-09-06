import { handleError } from "../lib/error-handler";
import type { Env, ReferralDeactivateBody } from "../types";
import { ReferralDeactivateBodySchema } from "../types";
import {
  getReferralByCode,
  deactivateReferral,
  reactivateReferral,
} from "../lib/referral-storage";
import { logger } from "../lib/global-logger";
import { notify } from "../notify";
import { jsonResponse } from "./utils";

// ============================================================================
// Referral Lifecycle Handlers (deactivate / reactivate)
// Extracted from referrals.ts; re-exported there so importers are unchanged.
// ============================================================================

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
