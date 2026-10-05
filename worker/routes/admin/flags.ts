/**
 * Admin API Routes - Feature Flag Management (ADR-032)
 *
 * GET /api/admin/flags        — list all flags (seeds defaults on first call)
 * PUT /api/admin/flags/:name  — update a flag (enabled, rolloutPercentage,
 *                               userIds, description)
 */

import { z } from "zod";
import type { Env } from "../../types";
import {
  getAllFeatureFlags,
  getFeatureFlag,
  initializeDefaultFlags,
  setFeatureFlag,
} from "../../lib/feature-flags";
import { jsonResponse } from "../utils";

const FLAG_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

const UpdateFlagBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    userIds: z.array(z.string().min(1)).max(1000).optional(),
    description: z.string().max(500).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * GET /api/admin/flags — list every flag (defaults seeded lazily so the
 * response always reflects the effective configuration).
 */
export async function handleListFlags(
  env: Env,
  request: Request,
): Promise<Response> {
  await initializeDefaultFlags(env);
  const flags = await getAllFeatureFlags(env);
  const sorted = [...flags.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return jsonResponse({ flags: sorted, count: sorted.length }, 200, request);
}

/**
 * PUT /api/admin/flags/:name — partial update of an existing flag.
 * Unknown flag names are rejected 404 so typos cannot create junk flags.
 */
export async function handleUpdateFlag(
  request: Request,
  env: Env,
  name: string,
): Promise<Response> {
  if (!FLAG_NAME_PATTERN.test(name)) {
    return jsonResponse({ error: "Invalid flag name" }, 400, request);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, request);
  }

  const parsed = UpdateFlagBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid request body", details: parsed.error.issues },
      400,
      request,
    );
  }

  await initializeDefaultFlags(env);
  const existing = await getFeatureFlag(name, env);
  if (!existing) {
    return jsonResponse(
      { error: "Flag not found", code: "FLAG_NOT_FOUND", feature: name },
      404,
      request,
    );
  }

  const body = parsed.data;
  await setFeatureFlag(
    {
      name: existing.name,
      enabled: body.enabled ?? existing.enabled,
      ...(body.rolloutPercentage !== undefined
        ? { rolloutPercentage: body.rolloutPercentage }
        : existing.rolloutPercentage !== undefined
          ? { rolloutPercentage: existing.rolloutPercentage }
          : {}),
      ...(body.userIds !== undefined
        ? { userIds: body.userIds }
        : existing.userIds !== undefined
          ? { userIds: existing.userIds }
          : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : existing.description !== undefined
          ? { description: existing.description }
          : {}),
    },
    env,
  );

  const updated = await getFeatureFlag(name, env);
  return jsonResponse({ flag: updated }, 200, request);
}
