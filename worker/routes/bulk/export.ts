/**
 * Bulk Export Route - Export deals as CSV or JSON
 *
 * GET /api/bulk/export
 *
 * Features:
 * - Multiple format support (CSV, JSON)
 * - Filtering by domain, category, status
 * - Pagination support
 */

import { handleError } from "../../lib/error-handler";
import type { Env, ReferralInput, ReferralSearchQuery } from "../../types";
import { searchReferrals } from "../../lib/referral-storage";
import { logger } from "../../lib/global-logger";
import { jsonResponse, errorResponse } from "../utils";

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_BULK_EXPORT_SIZE: 1000,
  DEFAULT_EXPORT_LIMIT: 100,
} as const;

// ============================================================================
// Types
// ============================================================================

interface BulkExportRequest {
  format?: "csv" | "json";
  domain?: string;
  category?: string;
  status?: "active" | "inactive" | "expired" | "all";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Bulk Export Handler
// ============================================================================

/**
 * GET /api/bulk/export
 * Export deals as CSV or JSON
 *
 * Query Parameters:
 * - format: 'csv' or 'json' (default: 'json')
 * - domain: Filter by domain
 * - category: Filter by category
 * - status: Filter by status ('active', 'inactive', 'expired', 'all')
 * - limit: Max results (default: 100, max: 1000)
 * - offset: Pagination offset
 *
 * Response (JSON):
 * {
 *   "success": true,
 *   "format": "json",
 *   "total": 150,
 *   "returned": 100,
 *   "deals": [...],
 *   "pagination": { "limit": 100, "offset": 0, "has_more": true }
 * }
 *
 * Response (CSV):
 * id,code,url,domain,title,description,status,...
 */
export async function handleBulkExport(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  try {
    // Parse query parameters
    const format =
      (url.searchParams.get("format") as BulkExportRequest["format"]) || "json";
    const domain = url.searchParams.get("domain") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const status =
      (url.searchParams.get("status") as ReferralSearchQuery["status"]) ||
      "active";
    const limit = Math.min(
      parseInt(
        url.searchParams.get("limit") || String(CONFIG.DEFAULT_EXPORT_LIMIT),
        10,
      ),
      CONFIG.MAX_BULK_EXPORT_SIZE,
    );
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    // Validate format
    if (format !== "csv" && format !== "json") {
      return errorResponse("format must be 'csv' or 'json'", 400);
    }

    logger.info(`Bulk export request`, {
      component: "bulk-api",
      format,
      domain,
      category,
      limit,
      offset,
    });

    // Get deals from D1 if available, otherwise from KV
    let deals: ReferralInput[] = [];
    let total = 0;

    if (env.DEALS_DB) {
      // Use D1 database
      const result = await queryDealsFromD1(env, {
        domain,
        category,
        status,
        limit,
        offset,
      });
      deals = result.deals;
      total = result.total;
    } else {
      // Fall back to KV storage
      const result = await queryDealsFromKV(env, {
        domain,
        category,
        status,
        limit,
        offset,
      });
      deals = result.deals;
      total = result.total;
    }

    // Format response based on requested format
    if (format === "csv") {
      return generateCsvResponse(deals, total, limit, offset);
    }

    return jsonResponse({
      success: true,
      format: "json",
      total,
      returned: deals.length,
      deals: deals.map(formatDealForExport),
      pagination: {
        limit,
        offset,
        has_more: offset + deals.length < total,
      },
    });
  } catch (error) {
    const err = handleError(error, {
      component: "bulk-api",
      handler: "handleBulkExport",
    });
    logger.error(`Bulk export error: ${err.message}`, {
      component: "bulk-api",
    });
    return errorResponse("Bulk export failed", 500, {
      message: err.message,
    });
  }
}

// ============================================================================
// D1 Query Handler
// ============================================================================

/**
 * Query deals from D1 database
 */
async function queryDealsFromD1(
  env: Env,
  params: {
    domain?: string;
    category?: string;
    status?: string;
    limit: number;
    offset: number;
  },
): Promise<{ deals: ReferralInput[]; total: number }> {
  // Build dynamic query
  let whereConditions = ["1=1"];
  const bindings: (string | number)[] = [];

  if (params.domain) {
    whereConditions.push("domain = ?");
    bindings.push(params.domain);
  }

  if (params.status && params.status !== "all") {
    whereConditions.push("status = ?");
    bindings.push(params.status);
  }

  const whereClause = whereConditions.join(" AND ");

  // Get total count
  const countResult = await env
    .DEALS_DB!.prepare(
      `SELECT COUNT(*) as count FROM referrals WHERE ${whereClause}`,
    )
    .bind(...bindings)
    .first<{ count: number }>();

  const total = countResult?.count || 0;

  // Get paginated results
  const query = `
    SELECT id, code, url, domain, status, source, submitted_at,
           submitted_by, expires_at, description,
           metadata, validation
    FROM referrals
    WHERE ${whereClause}
    ORDER BY submitted_at DESC
    LIMIT ? OFFSET ?
  `;

  const result = await env
    .DEALS_DB!.prepare(query)
    .bind(...bindings, params.limit, params.offset)
    .all<Record<string, unknown>>();

  const deals: ReferralInput[] = (result.results || []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    url: row.url as string,
    domain: row.domain as string,
    status: row.status as string,
    source: row.source as string,
    submitted_at: row.submitted_at as string,
    submitted_by: row.submitted_by as string,
    expires_at: row.expires_at as string | undefined,
    description: row.description as string | undefined,
    metadata:
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : (row.metadata as ReferralInput["metadata"]),
  }));

  return { deals, total };
}

// ============================================================================
// KV Query Handler
// ============================================================================

/**
 * Query deals from KV storage
 */
async function queryDealsFromKV(
  env: Env,
  params: {
    domain?: string;
    category?: string;
    status?: string;
    limit: number;
    offset: number;
  },
): Promise<{ deals: ReferralInput[]; total: number }> {
  // Build query without schema validation for internal use
  // (limit is already capped in the handler)
  const query: ReferralSearchQuery = {
    domain: params.domain,
    category: params.category,
    status: params.status as ReferralSearchQuery["status"],
    limit: params.limit,
    offset: params.offset,
  };

  const { referrals, total } = await searchReferrals(env, query);
  return { deals: referrals, total };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format deal for export
 */
function formatDealForExport(deal: ReferralInput): Record<string, unknown> {
  return {
    id: deal.id,
    code: deal.code,
    url: deal.url,
    domain: deal.domain,
    status: deal.status,
    source: deal.source,
    submitted_at: deal.submitted_at,
    submitted_by: deal.submitted_by,
    expires_at: deal.expires_at ?? null,
    description: deal.description,
    title: deal.metadata?.title,
    reward_type: deal.metadata?.reward_type,
    reward_value: deal.metadata?.reward_value,
    category: deal.metadata?.category,
    tags: deal.metadata?.tags,
    confidence_score: deal.metadata?.confidence_score,
  };
}

/**
 * Generate CSV response
 */
function generateCsvResponse(
  deals: ReferralInput[],
  total: number,
  limit: number,
  offset: number,
): Response {
  const headers = [
    "id",
    "code",
    "url",
    "domain",
    "status",
    "source",
    "submitted_at",
    "submitted_by",
    "expires_at",
    "description",
    "title",
    "reward_type",
    "reward_value",
    "category",
    "tags",
    "confidence_score",
  ];

  const csvRows = [headers.join(",")];

  for (const deal of deals) {
    const row = [
      escapeCsvField(deal.id || ""),
      escapeCsvField(deal.code || ""),
      escapeCsvField(deal.url || ""),
      escapeCsvField(deal.domain || ""),
      escapeCsvField(deal.status || ""),
      escapeCsvField(deal.source || ""),
      escapeCsvField(deal.submitted_at || ""),
      escapeCsvField(deal.submitted_by || ""),
      escapeCsvField(deal.expires_at || ""),
      escapeCsvField(deal.description || ""),
      escapeCsvField(deal.metadata?.title || ""),
      escapeCsvField(deal.metadata?.reward_type || ""),
      escapeCsvField(String(deal.metadata?.reward_value || "")),
      escapeCsvField((deal.metadata?.category || []).join(";")),
      escapeCsvField((deal.metadata?.tags || []).join(";")),
      String(deal.metadata?.confidence_score || ""),
    ];
    csvRows.push(row.join(","));
  }

  const csvContent = csvRows.join("\n");

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="deals-export-${Date.now()}.csv"`,
      "X-Total-Count": String(total),
      "X-Returned-Count": String(deals.length),
      "X-Offset": String(offset),
      "X-Limit": String(limit),
      "X-Has-More": String(offset + deals.length < total),
    },
  });
}

/**
 * Escape a field for CSV output
 */
function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
