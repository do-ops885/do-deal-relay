/**
 * D1 Database Client
 * Abstraction layer for Cloudflare D1 database operations
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface ReferralRecord {
  id: string;
  code: string;
  url: string;
  domain: string;
  source: string;
  status: "active" | "inactive" | "quarantined" | "expired";
  title?: string;
  description?: string;
  reward_type?: string;
  reward_value?: string;
  currency: string;
  category?: string; // JSON
  tags?: string; // JSON
  submitted_at: string;
  submitted_by?: string;
  expires_at?: string;
  confidence_score: number;
  use_count: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: "ASC" | "DESC";
}

export class D1Client {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ============================================================================
  // Referral Operations
  // ============================================================================

  async createReferral(
    referral: Omit<ReferralRecord, "submitted_at">,
  ): Promise<void> {
    await this.db
      .prepare(
        `
      INSERT INTO referrals (
        id, code, url, domain, source, status, title, description,
        reward_type, reward_value, currency, category, tags,
        submitted_by, expires_at, confidence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        referral.id,
        referral.code,
        referral.url,
        referral.domain,
        referral.source,
        referral.status,
        referral.title || null,
        referral.description || null,
        referral.reward_type || null,
        referral.reward_value || null,
        referral.currency,
        referral.category || null,
        referral.tags || null,
        referral.submitted_by || null,
        referral.expires_at || null,
        referral.confidence_score || 0.5,
      )
      .run();
  }

  async getReferralById(id: string): Promise<ReferralRecord | null> {
    const result = await this.db
      .prepare("SELECT * FROM referrals WHERE id = ?")
      .bind(id)
      .first<ReferralRecord>();
    return result || null;
  }

  async getReferralByCode(code: string): Promise<ReferralRecord | null> {
    const result = await this.db
      .prepare("SELECT * FROM referrals WHERE code = ? COLLATE NOCASE")
      .bind(code)
      .first<ReferralRecord>();
    return result || null;
  }

  async searchReferrals(
    params: {
      domain?: string;
      status?: string;
      category?: string;
      query?: string;
      minConfidence?: number;
    } & QueryOptions,
  ): Promise<{ results: ReferralRecord[]; total: number }> {
    let sql = "SELECT * FROM referrals WHERE 1=1";
    const bindings: (string | number)[] = [];

    if (params.domain) {
      sql += " AND domain = ?";
      bindings.push(params.domain);
    }
    if (params.status && params.status !== "all") {
      sql += " AND status = ?";
      bindings.push(params.status);
    }
    if (params.minConfidence !== undefined) {
      sql += " AND confidence_score >= ?";
      bindings.push(params.minConfidence);
    }
    if (params.query) {
      sql += " AND (code LIKE ? OR title LIKE ? OR description LIKE ?)";
      const pattern = `%${params.query}%`;
      bindings.push(pattern, pattern, pattern);
    }

    // Get total count
    const countResult = await this.db
      .prepare(sql.replace("SELECT *", "SELECT COUNT(*) as count"))
      .bind(...bindings)
      .first<{ count: number }>();

    // Add ordering and pagination
    sql += ` ORDER BY ${params.orderBy || "confidence_score"} ${params.order || "DESC"}`;
    if (params.limit) {
      sql += " LIMIT ?";
      bindings.push(params.limit);
    }
    if (params.offset) {
      sql += " OFFSET ?";
      bindings.push(params.offset);
    }

    const results = await this.db
      .prepare(sql)
      .bind(...bindings)
      .all<ReferralRecord>();

    return {
      results: results.results || [],
      total: countResult?.count || 0,
    };
  }

  async updateReferralStatus(
    id: string,
    status: ReferralRecord["status"],
    reason?: string,
  ): Promise<void> {
    const updates: string[] = ["status = ?"];
    const bindings: (string | null)[] = [status];

    if (status === "active") {
      updates.push("activated_at = datetime('now')");
    } else if (status === "inactive" || status === "expired") {
      updates.push("deactivated_at = datetime('now')");
      if (reason) {
        updates.push("deactivated_reason = ?");
        bindings.push(reason);
      }
    }

    bindings.push(id);
    await this.db
      .prepare(`UPDATE referrals SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...bindings)
      .run();
  }

  async incrementUseCount(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE referrals SET use_count = use_count + 1 WHERE id = ?")
      .bind(id)
      .run();
  }

  async getExpiringReferrals(days: number = 30): Promise<ReferralRecord[]> {
    const result = await this.db
      .prepare(
        `
      SELECT * FROM v_expiring_referrals
      WHERE days_remaining <= ?
      ORDER BY days_remaining ASC
    `,
      )
      .bind(days)
      .all<ReferralRecord>();
    return result.results || [];
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  async getReferralStats(): Promise<{
    total: number;
    active: number;
    quarantined: number;
    byDomain: Record<string, number>;
  }> {
    const stats = await this.db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
      FROM referrals
    `,
      )
      .first<{ total: number; active: number; quarantined: number }>();

    const byDomain = await this.db
      .prepare(
        `
      SELECT domain, COUNT(*) as count
      FROM referrals
      WHERE status = 'active'
      GROUP BY domain
      ORDER BY count DESC
    `,
      )
      .all<{ domain: string; count: number }>();

    const domainMap: Record<string, number> = {};
    for (const row of byDomain.results || []) {
      domainMap[row.domain] = row.count;
    }

    return {
      total: stats?.total || 0,
      active: stats?.active || 0,
      quarantined: stats?.quarantined || 0,
      byDomain: domainMap,
    };
  }

  // ============================================================================
  // Full-Text Search
  // ============================================================================

  async searchFullText(query: string): Promise<ReferralRecord[]> {
    const result = await this.db
      .prepare(
        `
      SELECT r.* FROM referrals r
      JOIN referrals_fts fts ON r.id = fts.rowid
      WHERE referrals_fts MATCH ?
      AND r.status = 'active'
      ORDER BY rank
    `,
      )
      .bind(query)
      .all<ReferralRecord>();
    return result.results || [];
  }

  // ============================================================================
  // Audit Log
  // ============================================================================

  async logAudit(params: {
    action: string;
    actorId?: string;
    actorType: "user" | "api_key" | "system" | "ai_agent";
    resourceType: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    correlationId?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `
      INSERT INTO audit_log (
        action, actor_id, actor_type, resource_type, resource_id,
        details, ip_address, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        params.action,
        params.actorId || null,
        params.actorType,
        params.resourceType,
        params.resourceId || null,
        params.details ? JSON.stringify(params.details) : null,
        params.ipAddress || null,
        params.correlationId || null,
      )
      .run();
  }

  // ============================================================================
  // Research Cache
  // ============================================================================

  async getCachedResearch(
    query: string,
    domain?: string,
  ): Promise<unknown | null> {
    const result = await this.db
      .prepare(
        `
      SELECT results FROM research_cache
      WHERE query = ? AND (domain = ? OR domain IS NULL)
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      LIMIT 1
    `,
      )
      .bind(query, domain || null)
      .first<{ results: string }>();

    if (result) {
      // Update hit count
      await this.db
        .prepare(
          `
        UPDATE research_cache SET hit_count = hit_count + 1
        WHERE query = ? AND (domain = ? OR domain IS NULL)
      `,
        )
        .bind(query, domain || null)
        .run();

      return JSON.parse(result.results);
    }

    return null;
  }

  async cacheResearch(
    query: string,
    results: unknown,
    domain?: string,
    ttlHours: number = 24,
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    await this.db
      .prepare(
        `
      INSERT OR REPLACE INTO research_cache (query, domain, results, expires_at)
      VALUES (?, ?, ?, ?)
    `,
      )
      .bind(
        query,
        domain || null,
        JSON.stringify(results),
        expiresAt.toISOString(),
      )
      .run();
  }
}
