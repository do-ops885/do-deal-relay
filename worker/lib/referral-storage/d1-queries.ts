import type { Env, ReferralInput } from "../../types";
import { createStructuredLogger } from "../logger";
import { createD1Client } from "../d1/client";

function getDualWriteLogger(env: Env) {
  return createStructuredLogger(env, "dual-write", `dw-${Date.now()}`);
}

/**
 * Search referrals using D1 full-text search
 */
export async function searchReferralsD1(
  env: Env,
  query: string,
  options: {
    limit?: number;
    domain?: string;
    status?: string;
  } = {},
): Promise<ReferralInput[]> {
  if (!env.DEALS_DB) {
    return [];
  }

  try {
    const client = createD1Client(env.DEALS_DB);
    const limit = options.limit || 20;

    let sql = `
      SELECT 
        d.deal_id as id,
        rc.code,
        d.url,
        d.domain,
        d.source_url as source,
        rc.status,
        d.title,
        d.description,
        d.reward_type,
        d.reward_value,
        d.category,
        d.tags,
        datetime(rc.submitted_at, 'unixepoch') as submitted_at,
        rc.expires_at
      FROM fts_deals fts
      JOIN deals d ON fts.deal_id = d.deal_id
      LEFT JOIN referral_codes rc ON d.id = rc.deal_id
      WHERE fts_deals MATCH ?
    `;

    const params: unknown[] = [query];

    if (options.domain) {
      sql += ` AND d.domain = ?`;
      params.push(options.domain);
    }

    if (options.status) {
      sql += ` AND rc.status = ?`;
      params.push(options.status);
    } else {
      sql += ` AND d.is_active = 1`;
    }

    sql += ` ORDER BY fts.rank LIMIT ?`;
    params.push(limit);

    const result = await client.queryWithJson<{
      id: string;
      code: string;
      url: string;
      domain: string;
      source: string;
      status: string;
      title: string;
      description: string;
      reward_type: string;
      reward_value: number;
      category: string[];
      tags: string[];
      submitted_at: string;
      expires_at: string;
    }>(sql, params, ["category", "tags"]);

    if (result.success && result.data) {
      return result.data.map((row) => ({
        id: row.id,
        code: row.code,
        url: row.url,
        domain: row.domain,
        source: row.source,
        status: row.status,
        submitted_at: row.submitted_at,
        expires_at: row.expires_at,
        description: row.description,
        metadata: {
          title: row.title,
          description: row.description,
          reward_type: row.reward_type,
          reward_value: row.reward_value,
          category: row.category,
          tags: row.tags,
        },
      }));
    }

    return [];
  } catch (error) {
    const logger = getDualWriteLogger(env);
    logger.error(
      "D1 search error",
      error instanceof Error ? error : new Error(String(error)),
      {
        query,
      },
    );
    return [];
  }
}

/**
 * Get expiring referrals from D1
 */
export async function getExpiringReferralsD1(
  env: Env,
  days: number = 30,
): Promise<ReferralInput[]> {
  if (!env.DEALS_DB) {
    return [];
  }

  try {
    const client = createD1Client(env.DEALS_DB);
    const result = await client.query<{
      code: string;
      domain: string;
      title: string;
      expires_at: string;
      days_remaining: number;
    }>(
      `SELECT 
        rc.code,
        d.domain,
        d.title,
        rc.expires_at,
        julianday(rc.expires_at) - julianday('now') as days_remaining
      FROM referral_codes rc
      JOIN deals d ON rc.deal_id = d.id
      WHERE rc.expires_at IS NOT NULL
      AND rc.expires_at > datetime('now')
      AND rc.expires_at <= datetime('now', '+' || ? || ' days')
      AND rc.is_active = 1
      ORDER BY days_remaining ASC`,
      [days],
    );

    if (result.success && result.data) {
      return result.data.map(
        (row: {
          code: string;
          domain: string;
          title: string;
          expires_at: string;
        }) => ({
          code: row.code,
          url: `https://${row.domain}`,
          domain: row.domain,
          expires_at: row.expires_at,
          metadata: {
            title: row.title,
          },
        }),
      );
    }

    return [];
  } catch (error) {
    const logger = getDualWriteLogger(env);
    logger.error(
      "D1 expiring referrals error",
      error instanceof Error ? error : new Error(String(error)),
      {
        days,
      },
    );
    return [];
  }
}

/**
 * Get referral statistics from D1
 */
export async function getReferralStatsD1(env: Env): Promise<{
  total: number;
  active: number;
  byDomain: Array<{ domain: string; count: number }>;
}> {
  if (!env.DEALS_DB) {
    return { total: 0, active: 0, byDomain: [] };
  }

  try {
    const client = createD1Client(env.DEALS_DB);

    const [statsResult, domainResult] = await Promise.all([
      client.queryFirst<{
        total: number;
        active: number;
      }>(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END) as active
        FROM referral_codes`,
      ),
      client.query<{ domain: string; count: number }>(
        `SELECT 
          d.domain,
          COUNT(*) as count
        FROM referral_codes rc
        JOIN deals d ON rc.deal_id = d.id
        WHERE rc.is_active = 1
        GROUP BY d.domain
        ORDER BY count DESC`,
      ),
    ]);

    return {
      total:
        statsResult.success && statsResult.data ? statsResult.data.total : 0,
      active:
        statsResult.success && statsResult.data ? statsResult.data.active : 0,
      byDomain:
        domainResult.success && domainResult.data ? domainResult.data : [],
    };
  } catch (error) {
    const logger = getDualWriteLogger(env);
    logger.error(
      "D1 referral stats error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { total: 0, active: 0, byDomain: [] };
  }
}
