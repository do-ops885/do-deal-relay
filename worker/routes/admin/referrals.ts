/**
 * Admin API Routes - Referral Store Reconciliation
 *
 * POST /api/admin/referrals/reconcile — read-only divergence report between
 * the KV and D1 referral stores. Wires `reconcileReferralStores`, which was
 * added for issue #903 but never routed until the missing-wiring sweep
 * (2026-10-13). The handler never mutates either store.
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { reconcileReferralStores } from "../../lib/referral-storage/dual-write";

export async function handleReconcileReferrals(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_PROD && !env.DEALS_DB) {
    return jsonResponse(
      {
        error: "Referral stores not configured",
        code: "STORES_UNAVAILABLE",
      },
      503,
      request,
      env,
    );
  }

  const reconciled = await reconcileReferralStores(env);
  return jsonResponse(
    {
      success: true,
      reconciled,
      // Divergence is expected while dual-write backfill is in flight; the
      // caller decides whether to run a backfill.
      action_required: reconciled.divergent,
    },
    200,
    request,
    env,
  );
}
