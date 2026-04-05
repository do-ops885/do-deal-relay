/**
 * Core API Routes - Submit Handler
 *
 * Handles POST /api/submit
 */

import {
  getDealsByCode,
  getStagingSnapshot,
  writeStagingSnapshot,
} from "../../lib/storage";
import { generateDealId } from "../../lib/crypto";
import { CONFIG } from "../../config";
import type { Env, SubmitDealBody, Deal } from "../../types";
import { SubmitDealBodySchema } from "../../types";
import { jsonResponse } from "../utils";

export async function handleSubmit(
  request: Request,
  env: Env,
): Promise<Response> {
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

  const body = (await request.json()) as SubmitDealBody;
  const validation = SubmitDealBodySchema.safeParse(body);

  if (!validation.success) {
    return jsonResponse(
      { error: "Invalid request body", details: validation.error.errors },
      400,
    );
  }

  const existing = await getDealsByCode(env, body.code);
  if (existing.length > 0) {
    return jsonResponse(
      { error: "Deal with this code already exists", existing: existing[0].id },
      409,
    );
  }

  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const reward = (metadata.reward || {}) as Record<string, unknown>;
  const rewardType = ((reward.type as string) || "cash") as
    | "cash"
    | "credit"
    | "percent"
    | "item";

  const dealId = await generateDealId(
    body.source || "manual",
    body.code,
    rewardType,
  );

  const stagingSnapshot = await getStagingSnapshot(env);
  const now = new Date().toISOString();
  const expiry = (metadata.expiry || {}) as Record<string, unknown>;

  const newDeal: Deal = {
    id: dealId,
    source: {
      url: body.url,
      domain: body.source || "manual",
      discovered_at: now,
      trust_score: 0.5,
    },
    title: (metadata.title as string) || `Manual Deal: ${body.code}`,
    description:
      (metadata.description as string) ||
      `Manually submitted deal with code ${body.code}`,
    code: body.code,
    url: body.url,
    reward: {
      type: ((reward.type as string) || "cash") as
        | "cash"
        | "credit"
        | "percent"
        | "item",
      value: (reward.value as number) || 0,
      currency: (reward.currency as string) || "USD",
      description: reward.description as string | undefined,
    },
    requirements: (metadata.requirements as string[]) || [],
    expiry: {
      date: expiry.date as string | undefined,
      confidence: (expiry.confidence as number) || 0.5,
      type: ((expiry.type as string) || "unknown") as
        | "hard"
        | "soft"
        | "unknown",
    },
    metadata: {
      category: (metadata.category as string[]) || ["general"],
      tags: (metadata.tags as string[]) || [],
      normalized_at: now,
      confidence_score: (metadata.confidence_score as number) || 0.5,
      status: "quarantined",
    },
  };

  const deals = stagingSnapshot
    ? [...stagingSnapshot.deals, newDeal]
    : [newDeal];

  const snapshotData = {
    version: stagingSnapshot?.version || CONFIG.VERSION,
    generated_at: now,
    run_id: stagingSnapshot?.run_id || `manual-${Date.now()}`,
    trace_id: stagingSnapshot?.trace_id || `manual-${dealId}`,
    previous_hash: stagingSnapshot?.snapshot_hash || "",
    schema_version: stagingSnapshot?.schema_version || CONFIG.SCHEMA_VERSION,
    stats: {
      total: deals.length,
      active: deals.filter((d) => d.metadata.status === "active").length,
      quarantined: deals.filter((d) => d.metadata.status === "quarantined")
        .length,
      rejected: deals.filter((d) => d.metadata.status === "rejected").length,
      duplicates: 0,
    },
    deals,
  };

  const updatedSnapshot = await writeStagingSnapshot(env, snapshotData);

  return jsonResponse(
    {
      success: true,
      message: "Deal submitted for review",
      deal_id: dealId,
      code: body.code,
      status: "quarantined",
      snapshot_hash: updatedSnapshot.snapshot_hash,
    },
    201,
  );
}
