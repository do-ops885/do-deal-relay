/**
 * Statistics Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";
import type { DealStats } from "./types";
import { getCategoriesWithCounts } from "./domain-category";

/**
 * Get comprehensive deal statistics
 */
export async function getDealStats(db: D1Database): Promise<DealStats> {
  const client = createD1ReadClient(db);

  const statsResult = await client.query<{
    total: number;
    active: number;
    quarantined: number;
    rejected: number;
    expired: number;
  }>(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'expired' OR (expiry_date < datetime('now') AND expiry_date IS NOT NULL) THEN 1 ELSE 0 END) as expired
    FROM deals`,
  );

  const domainResult = await client.query<{ domain: string; count: number }>(
    `SELECT domain, COUNT(*) as count
     FROM deals
     WHERE is_active = 1
     GROUP BY domain
     ORDER BY count DESC
     LIMIT 10`,
  );

  const rewardResult = await client.query<{ type: string; count: number }>(
    `SELECT reward_type as type, COUNT(*) as count
     FROM deals
     WHERE reward_type IS NOT NULL AND is_active = 1
     GROUP BY reward_type
     ORDER BY count DESC`,
  );

  const stats =
    statsResult.success && statsResult.data && statsResult.data[0]
      ? statsResult.data[0]
      : { total: 0, active: 0, quarantined: 0, rejected: 0, expired: 0 };

  return {
    total: stats.total ?? 0,
    active: stats.active ?? 0,
    quarantined: stats.quarantined ?? 0,
    rejected: stats.rejected ?? 0,
    expired: stats.expired ?? 0,
    byDomain: domainResult.success ? domainResult.data || [] : [],
    byCategory: await getCategoriesWithCounts(db),
    byRewardType: rewardResult.success ? rewardResult.data || [] : [],
  };
}

/**
 * Get time-series statistics
 */
export async function getDealTimeSeries(
  db: D1Database,
  days: number = 30,
): Promise<Array<{ date: string; count: number; new_count: number }>> {
  const client = createD1ReadClient(db);

  const result = await client.query<{
    date: string;
    count: number;
    new_count: number;
  }>(
    `WITH RECURSIVE dates(date) AS (
      SELECT date('now', '-' || ? || ' days')
      UNION ALL
      SELECT date(date, '+1 day')
      FROM dates
      WHERE date < date('now')
    )
    SELECT 
      dates.date,
      (SELECT COUNT(*) FROM deals 
       WHERE date(datetime(created_at, 'unixepoch')) <= dates.date) as count,
      (SELECT COUNT(*) FROM deals 
       WHERE date(datetime(created_at, 'unixepoch')) = dates.date) as new_count
    FROM dates
    ORDER BY dates.date`,
    [days],
  );

  return result.success ? result.data || [] : [];
}
