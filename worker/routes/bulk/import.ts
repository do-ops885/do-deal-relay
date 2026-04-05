/**
 * Bulk Import Route - Import multiple referral codes at once
 *
 * POST /api/bulk/import
 *
 * Features:
 * - Batch validation with per-item status reporting
 * - Rate limiting protection
 * - Duplicate detection
 */

import { handleError } from "../../lib/error-handler";
import type { Env, ReferralInput } from "../../types";
import { ReferralInputSchema } from "../../types";
import {
  storeReferralInput,
  getReferralByCode,
} from "../../lib/referral-storage";
import { generateDealId } from "../../lib/crypto";
import { logger } from "../../lib/global-logger";
import { jsonResponse, errorResponse } from "../utils";
import { checkRateLimit, getClientIdentifier } from "../../lib/rate-limit";

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_BULK_IMPORT_SIZE: 100,
} as const;

// ============================================================================
// Types
// ============================================================================

interface BulkImportItem {
  code: string;
  url: string;
  domain: string;
  source?: string;
  submitted_by?: string;
  expires_at?: string;
  metadata?: {
    title?: string;
    description?: string;
    reward_type?: string;
    reward_value?: string | number;
    category?: string[];
    tags?: string[];
    requirements?: string[];
    confidence_score?: number;
    notes?: string;
  };
}

interface BulkImportRequest {
  deals: BulkImportItem[];
}

export interface BulkImportResult {
  index: number;
  success: boolean;
  code: string;
  message: string;
  referral_id: string | null;
  errors: string[] | null;
}

// ============================================================================
// Bulk Import Handler
// ============================================================================

/**
 * POST /api/bulk/import
 * Import multiple referral codes at once
 *
 * Request Body:
 * {
 *   "deals": [
 *     { "code": "ABC123", "url": "...", "domain": "example.com", ... },
 *     ...
 *   ]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "total": 10,
 *   "imported": 8,
 *   "failed": 2,
 *   "skipped": 0,
 *   "results": [
 *     { "index": 0, "success": true, "code": "ABC123", "referral_id": "...", ... },
 *     ...
 *   ]
 * }
 */
export async function handleBulkImport(
  request: Request,
  env: Env,
): Promise<Response> {
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/bulk/import",
  );

  if (!rateLimitResult.allowed) {
    return errorResponse("Rate limit exceeded", 429, {
      retry_after: rateLimitResult.resetTime,
    });
  }

  try {
    // Validate content type
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return errorResponse("Content-Type must be application/json", 415);
    }

    // Parse request body
    let body: BulkImportRequest;
    try {
      body = (await request.json()) as BulkImportRequest;
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    // Validate deals array exists
    if (!body.deals || !Array.isArray(body.deals)) {
      return errorResponse("deals array is required", 400);
    }

    // Validate batch size
    if (body.deals.length === 0) {
      return errorResponse("deals array cannot be empty", 400);
    }

    if (body.deals.length > CONFIG.MAX_BULK_IMPORT_SIZE) {
      return errorResponse(
        `Maximum ${CONFIG.MAX_BULK_IMPORT_SIZE} deals per request`,
        400,
      );
    }

    logger.info(`Bulk import request`, {
      component: "bulk-api",
      count: body.deals.length,
      clientId: clientId.slice(0, 8),
    });

    // Process each deal
    const results: BulkImportResult[] = [];
    let imported = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < body.deals.length; i++) {
      const item = body.deals[i];
      const result = await processBulkImportItem(item, i, env);
      results.push(result);

      if (result.success) {
        imported++;
      } else if (result.message === "already exists") {
        skipped++;
      } else {
        failed++;
      }
    }

    const response = {
      success: failed === 0,
      total: body.deals.length,
      imported,
      failed,
      skipped,
      results,
    };

    return jsonResponse(response, failed > 0 ? 207 : 200);
  } catch (error) {
    const err = handleError(error, {
      component: "bulk-api",
      handler: "handleBulkImport",
    });
    logger.error(`Bulk import error: ${err.message}`, {
      component: "bulk-api",
    });
    return errorResponse("Bulk import failed", 500, {
      message: err.message,
    });
  }
}

// ============================================================================
// Bulk Import Item Processor
// ============================================================================

/**
 * Process a single bulk import item
 */
export async function processBulkImportItem(
  item: BulkImportItem,
  index: number,
  env: Env,
): Promise<BulkImportResult> {
  const errors: string[] = [];

  // Validate required fields
  if (!item.code || typeof item.code !== "string") {
    errors.push("code is required and must be a string");
  }

  if (!item.url || typeof item.url !== "string") {
    errors.push("url is required and must be a string");
  } else {
    try {
      new URL(item.url);
    } catch {
      errors.push("url must be a valid URL");
    }
  }

  if (!item.domain || typeof item.domain !== "string") {
    errors.push("domain is required and must be a string");
  }

  if (errors.length > 0) {
    return {
      index,
      success: false,
      code: item.code || "",
      message: "validation failed",
      referral_id: null,
      errors,
    };
  }

  // Check for existing referral
  try {
    const existing = await getReferralByCode(env, item.code);
    if (existing) {
      return {
        index,
        success: false,
        code: item.code,
        message: "already exists",
        referral_id: existing.id ?? null,
        errors: null,
      };
    }
  } catch (error) {
    return {
      index,
      success: false,
      code: item.code,
      message: "database error",
      referral_id: null,
      errors: [`Failed to check existing: ${(error as Error).message}`],
    };
  }

  // Create referral
  try {
    const id = await generateDealId(
      item.source || "bulk_api",
      item.code,
      "referral",
    );
    const now = new Date().toISOString();

    const metadata = item.metadata || {};
    const referral: ReferralInput = {
      id,
      code: item.code,
      url: item.url,
      domain: item.domain,
      source: item.source || "bulk_api",
      status: "quarantined",
      submitted_at: now,
      submitted_by: item.submitted_by || "bulk_api",
      expires_at: item.expires_at,
      metadata: {
        title: metadata.title || `${item.domain} Referral`,
        description: metadata.description || `Referral code for ${item.domain}`,
        reward_type: metadata.reward_type || "unknown",
        reward_value: metadata.reward_value,
        category: metadata.category || ["general"],
        tags: metadata.tags || ["bulk-added"],
        requirements: metadata.requirements || [],
        confidence_score: metadata.confidence_score || 0.5,
        notes: metadata.notes,
      },
    };

    // Validate referral
    const validation = ReferralInputSchema.safeParse(referral);
    if (!validation.success) {
      return {
        index,
        success: false,
        code: item.code,
        message: "validation failed",
        referral_id: null,
        errors: validation.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      };
    }

    // Store referral
    await storeReferralInput(env, referral);

    logger.info(`Bulk imported referral: ${referral.code}`, {
      component: "bulk-api",
      referral_id: id,
    });

    return {
      index,
      success: true,
      code: item.code,
      message: "created",
      referral_id: id,
      errors: null,
    };
  } catch (error) {
    return {
      index,
      success: false,
      code: item.code,
      message: "storage error",
      referral_id: null,
      errors: [`Failed to store: ${(error as Error).message}`],
    };
  }
}
