import type { Env } from "../../types";
import type { ReferralAnalytics } from "./types";
import { getProductionSnapshot, getSourceRegistry } from "../storage";
import { createD1ReadClient } from "../d1/client";
import type { D1Database } from "@cloudflare/workers-types";

interface SourceRow {
  domain: string;
  total: number;
  active: number;
  quarantined: number;
  avg_confidence: number;
}

interface RewardRow {
  reward_type: string;
  cnt: number;
  total_value: number;
  avg_value: number;
  currency: string;
}

interface ConversionRow {
  domain: string;
  deals: number;
  referrals: number;
  total_uses: number;
  unique_users: number;
}

interface ExpiryRow {
  days_remaining: number | null;
  expiry_date: string | null;
  is_active: number;
  status: string;
}

interface MetricRow {
  metric_name: string;
  avg_value: number;
  cnt: number;
}

function bucketLabel(days: number | null): string {
  if (days === null) return "no_expiry";
  if (days < 0) return "expired";
  if (days <= 7) return "0-7d";
  if (days <= 30) return "7-30d";
  if (days <= 90) return "30-90d";
  return "90d+";
}

export async function generateReferralAnalytics(
  env: Env,
  days = 30,
): Promise<ReferralAnalytics> {
  const now = new Date().toISOString();
  // Try D1 first, fallback to snapshot calculations
  if (env.DEALS_DB) {
    try {
      const d1 = await queryReferralAnalyticsD1(env.DEALS_DB, days);
      if (d1) return { ...d1, generatedAt: now, periodDays: days };
    } catch {
      // fall through to snapshot fallback
    }
  }
  return generateReferralAnalyticsFromSnapshot(env, days);
}

async function queryReferralAnalyticsD1(
  db: D1Database,
  days: number,
): Promise<ReferralAnalytics | null> {
  const client = createD1ReadClient(db);

  const perSourcePromise = client.query<SourceRow>(
    `SELECT domain,
            COUNT(*) as total,
            SUM(CASE WHEN status='active' AND is_active=1 THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status='quarantined' THEN 1 ELSE 0 END) as quarantined,
            AVG(confidence_score) as avg_confidence
     FROM deals GROUP BY domain ORDER BY total DESC LIMIT 50`,
  );

  const rewardPromise = client.query<RewardRow>(
    `SELECT COALESCE(reward_type,'unknown') as reward_type,
            COUNT(*) as cnt,
            COALESCE(SUM(CASE WHEN typeof(reward_value)='real' OR typeof(reward_value)='integer' THEN reward_value ELSE 0 END),0) as total_value,
            COALESCE(AVG(CASE WHEN typeof(reward_value)='real' OR typeof(reward_value)='integer' THEN reward_value ELSE null END),0) as avg_value,
            COALESCE(reward_currency,'USD') as currency
     FROM deals WHERE is_active=1 GROUP BY reward_type, reward_currency ORDER BY cnt DESC`,
  );

  const conversionPromise = client.query<ConversionRow>(
    `SELECT d.domain as domain,
            COUNT(DISTINCT d.id) as deals,
            COUNT(DISTINCT rc.id) as referrals,
            COUNT(ru.id) as total_uses,
            COUNT(DISTINCT ru.used_by) as unique_users
     FROM deals d
     LEFT JOIN referral_codes rc ON rc.deal_id = d.id
     LEFT JOIN referral_usage ru ON ru.referral_code_id = rc.id
       AND ru.used_at >= strftime('%s','now','-' || ? || ' days')
     WHERE d.is_active=1 GROUP BY d.domain ORDER BY total_uses DESC LIMIT 50`,
    [days],
  );

  const expiryPromise = client.query<ExpiryRow>(
    `SELECT julianday(expiry_date) - julianday('now') as days_remaining,
            expiry_date, is_active, status FROM deals WHERE is_active=1`,
  );

  const metricsPromise = client
    .query<MetricRow>(
      `SELECT metric_name, AVG(metric_value) as avg_value, COUNT(*) as cnt
       FROM system_metrics
       WHERE timestamp >= datetime('now','-' || ? || ' days')
       GROUP BY metric_name ORDER BY cnt DESC LIMIT 20`,
      [days],
    )
    .catch(() => ({ success: false, data: [] as MetricRow[] }) as never);

  const trustPromise = client
    .query<{ domain: string; trust_score: number }>(
      `SELECT domain, trust_score FROM trust_scores`,
    )
    .catch(() => ({ success: false, data: [] }) as never);

  const [perSourceRes, rewardRes, convRes, expiryRes, metricsRes, trustRes] =
    await Promise.all([
      perSourcePromise,
      rewardPromise,
      conversionPromise,
      expiryPromise,
      metricsPromise,
      trustPromise,
    ]);

  const trustMap = new Map<string, number>();
  if (
    trustRes &&
    (trustRes as { success: boolean; data?: unknown[] }).success
  ) {
    for (const r of (trustRes.data as {
      domain: string;
      trust_score: number;
    }[]) || []) {
      trustMap.set(r.domain, r.trust_score);
    }
  }

  const perSourceSuccessRate = (
    perSourceRes.success ? perSourceRes.data || [] : []
  ).map((r) => ({
    source: r.domain,
    domain: r.domain,
    total: r.total,
    active: r.active || 0,
    quarantined: r.quarantined || 0,
    successRate:
      r.total > 0 ? Math.round(((r.active || 0) / r.total) * 1000) / 10 : 0,
    avgConfidence: Math.round((r.avg_confidence || 0) * 100) / 100,
    trustScore: trustMap.get(r.domain) ?? null,
  }));

  const rewardRows = rewardRes.success ? rewardRes.data || [] : [];
  const totalDeals = rewardRows.reduce((s, r) => s + r.cnt, 0);
  const totalValue = rewardRows.reduce((s, r) => s + (r.total_value || 0), 0);
  const byCurrencyMap = new Map<
    string,
    { count: number; totalValue: number }
  >();
  for (const r of rewardRows) {
    const cur = r.currency || "USD";
    const curEntry = byCurrencyMap.get(cur) || { count: 0, totalValue: 0 };
    curEntry.count += r.cnt;
    curEntry.totalValue += r.total_value || 0;
    byCurrencyMap.set(cur, curEntry);
  }

  const expiryRows = expiryRes.success ? expiryRes.data || [] : [];
  let exp7 = 0;
  let exp30 = 0;
  let exp90 = 0;
  let expired = 0;
  let noExpiry = 0;
  const bucketCounts = new Map<string, number>();
  const daysList: number[] = [];
  for (const r of expiryRows) {
    const d = r.days_remaining;
    if (r.expiry_date === null || d === null) {
      noExpiry++;
    } else {
      if (d >= 0 && d !== null) daysList.push(d);
      if (d !== null && d < 0) expired++;
      if (d !== null && d >= 0 && d <= 7) exp7++;
      if (d !== null && d >= 0 && d <= 30) exp30++;
      if (d !== null && d >= 0 && d <= 90) exp90++;
    }
    const b = bucketLabel(d);
    bucketCounts.set(b, (bucketCounts.get(b) || 0) + 1);
  }
  const avgDaysToExpiry =
    daysList.length > 0
      ? Math.round(
          (daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10,
        ) / 10
      : null;

  const metricData = (metricsRes as { success: boolean; data?: MetricRow[] })
    .success
    ? (metricsRes as { data: MetricRow[] }).data || []
    : [];

  return {
    periodDays: days,
    generatedAt: new Date().toISOString(),
    perSourceSuccessRate,
    rewardTotals: {
      totalDeals,
      totalValue: Math.round(totalValue * 100) / 100,
      avgValue:
        totalDeals > 0 ? Math.round((totalValue / totalDeals) * 100) / 100 : 0,
      currency: "USD",
      byType: rewardRows.map((r) => ({
        type: r.reward_type,
        count: r.cnt,
        totalValue: Math.round((r.total_value || 0) * 100) / 100,
        avgValue: Math.round((r.avg_value || 0) * 100) / 100,
      })),
      byCurrency: Array.from(byCurrencyMap.entries()).map(([currency, v]) => ({
        currency,
        count: v.count,
        totalValue: Math.round(v.totalValue * 100) / 100,
      })),
    },
    conversionByDomain: (convRes.success ? convRes.data || [] : []).map(
      (r) => ({
        domain: r.domain,
        deals: r.deals,
        referrals: r.referrals,
        totalUses: r.total_uses || 0,
        uniqueUsers: r.unique_users || 0,
        conversionRate:
          r.referrals > 0
            ? Math.round(((r.total_uses || 0) / r.referrals) * 1000) / 10
            : 0,
      }),
    ),
    timeToExpiry: {
      avgDaysToExpiry,
      expiringIn7Days: exp7,
      expiringIn30Days: exp30,
      expiringIn90Days: exp90,
      alreadyExpired: expired,
      noExpiry,
      buckets: Array.from(bucketCounts.entries()).map(([bucket, count]) => ({
        bucket,
        count,
      })),
    },
    systemMetrics: metricData.map((m) => ({
      metric: m.metric_name,
      avgValue: Math.round(m.avg_value * 100) / 100,
      count: m.cnt,
    })),
  };
}

async function generateReferralAnalyticsFromSnapshot(
  env: Env,
  days: number,
): Promise<ReferralAnalytics> {
  const [snapshot, registry] = await Promise.all([
    getProductionSnapshot(env).catch(() => null),
    getSourceRegistry(env),
  ]);
  const deals: import("../../types").Deal[] =
    (snapshot as { deals?: import("../../types").Deal[] } | null)?.deals || [];
  const trustMap = new Map<string, number>();
  for (const s of (registry as { domain: string; trust_initial: number }[]) ||
    []) {
    trustMap.set(s.domain, s.trust_initial);
  }

  const byDomain = new Map<
    string,
    { total: number; active: number; quarantined: number; confSum: number }
  >();
  for (const d of deals) {
    const dom = d.source.domain;
    const e = byDomain.get(dom) || {
      total: 0,
      active: 0,
      quarantined: 0,
      confSum: 0,
    };
    e.total++;
    if (d.metadata.status === "active") e.active++;
    if (d.metadata.status === "quarantined") e.quarantined++;
    e.confSum += d.metadata.confidence_score;
    byDomain.set(dom, e);
  }
  const perSourceSuccessRate = Array.from(byDomain.entries())
    .map(([domain, v]) => ({
      source: domain,
      domain,
      total: v.total,
      active: v.active,
      quarantined: v.quarantined,
      successRate: v.total ? Math.round((v.active / v.total) * 1000) / 10 : 0,
      avgConfidence: v.total
        ? Math.round((v.confSum / v.total) * 100) / 100
        : 0,
      trustScore: trustMap.get(domain) ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  const byType = new Map<string, { count: number; totalValue: number }>();
  const byCurrency = new Map<string, { count: number; totalValue: number }>();
  let totalValue = 0;
  for (const d of deals) {
    const t = d.reward.type || "unknown";
    const val = typeof d.reward.value === "number" ? d.reward.value : 0;
    totalValue += val;
    const te = byType.get(t) || { count: 0, totalValue: 0 };
    te.count++;
    te.totalValue += val;
    byType.set(t, te);
    const cur = d.reward.currency || "USD";
    const ce = byCurrency.get(cur) || { count: 0, totalValue: 0 };
    ce.count++;
    ce.totalValue += val;
    byCurrency.set(cur, ce);
  }

  const now = new Date();
  let exp7 = 0,
    exp30 = 0,
    exp90 = 0,
    expired = 0,
    noExpiry = 0;
  const buckets = new Map<string, number>();
  const daysList: number[] = [];
  for (const d of deals) {
    if (!d.expiry.date) {
      noExpiry++;
      buckets.set("no_expiry", (buckets.get("no_expiry") || 0) + 1);
      continue;
    }
    const diff =
      (new Date(d.expiry.date).getTime() - now.getTime()) /
      (1000 * 60 * 60 * 24);
    if (diff < 0) expired++;
    if (diff >= 0 && diff <= 7) exp7++;
    if (diff >= 0 && diff <= 30) exp30++;
    if (diff >= 0 && diff <= 90) exp90++;
    if (diff >= 0) daysList.push(diff);
    const b = bucketLabel(diff);
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }

  return {
    periodDays: days,
    generatedAt: new Date().toISOString(),
    perSourceSuccessRate,
    rewardTotals: {
      totalDeals: deals.length,
      totalValue: Math.round(totalValue * 100) / 100,
      avgValue: deals.length
        ? Math.round((totalValue / deals.length) * 100) / 100
        : 0,
      currency: "USD",
      byType: Array.from(byType.entries()).map(([type, v]) => ({
        type,
        count: v.count,
        totalValue: Math.round(v.totalValue * 100) / 100,
        avgValue: v.count
          ? Math.round((v.totalValue / v.count) * 100) / 100
          : 0,
      })),
      byCurrency: Array.from(byCurrency.entries()).map(([currency, v]) => ({
        currency,
        count: v.count,
        totalValue: Math.round(v.totalValue * 100) / 100,
      })),
    },
    conversionByDomain: perSourceSuccessRate.map((p) => ({
      domain: p.domain,
      deals: p.total,
      referrals: p.total,
      totalUses: 0,
      uniqueUsers: 0,
      conversionRate: 0,
    })),
    timeToExpiry: {
      avgDaysToExpiry: daysList.length
        ? Math.round(
            (daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10,
          ) / 10
        : null,
      expiringIn7Days: exp7,
      expiringIn30Days: exp30,
      expiringIn90Days: exp90,
      alreadyExpired: expired,
      noExpiry,
      buckets: Array.from(buckets.entries()).map(([bucket, count]) => ({
        bucket,
        count,
      })),
    },
    systemMetrics: [],
  };
}
