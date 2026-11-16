/**
 * Admin API Routes - Curated Deal Import
 *
 * GET  /api/admin/curated-deals  — list stored operator-curated codes
 * POST /api/admin/curated-deals  — import/upsert codes
 *
 * Curated codes are stored in KV and merged into the next discovery run as
 * candidates. They still pass every validation gate: this endpoint never
 * publishes directly, so an invalid or expired code is rejected downstream.
 */

import { z } from "zod";
import type { Env } from "../../types";
import {
  importCuratedDeals,
  readCuratedDeals,
  MAX_CURATED_DEALS,
} from "../../lib/curated-deals";
import { jsonResponse } from "../utils";

const ImportBodySchema = z
  .object({
    deals: z.array(z.unknown()).min(1).max(MAX_CURATED_DEALS),
  })
  .strict();

export async function handleCuratedDeals(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "GET") {
    const deals = await readCuratedDeals(env);
    return jsonResponse({ deals, count: deals.length }, 200, request);
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return jsonResponse(
      { error: "Content-Type must be application/json" },
      415,
      request,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, request);
  }

  const parsed = ImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: "Invalid request body",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
      request,
    );
  }

  const summary = await importCuratedDeals(env, parsed.data.deals);
  const status = summary.rejected.length > 0 ? 207 : 200;

  return jsonResponse(
    {
      success: summary.rejected.length === 0,
      ...summary,
      next: "POST /api/discover to run the pipeline now, or wait for the 6h cron",
    },
    status,
    request,
  );
}
