import type { Deal, Env, Snapshot, LogEntry } from "../types";
import { getProductionSnapshot, getSourceRegistry } from "./storage";
import { getRecentLogs } from "./logger";
import { getRecentMetrics } from "./metrics";

// ============================================================================
// Analytics Types
// ============================================================================

export interface DealAnalytics {
  // Deal volume trends
  dealsOverTime: {
    date: string;
    discovered: number;
    published: number;
    expired: number;
  }[];

  // Category distribution
  categoryBreakdown: {
    category: string;
    count: number;
    avgConfidence: number;
    avgValue: number;
  }[];

  // Source performance
  sourcePerformance: {
    domain: string;
    dealsDiscovered: number;
    dealsPublished: number;
    avgConfidence: number;
    trustScore: number;
  }[];

  // Value distribution
  valueDistribution: {
    range: string;
    count: number;
    percentage: number;
  }[];

  // Expiry forecast
  expiringSoon: {
    next7Days: number;
    next30Days: number;
    next90Days: number;
  };

  // Quality metrics
  qualityMetrics: {
    avgConfidence: number;
    validationSuccessRate: number;
    quarantineRate: number;
  };
}

export interface AnalyticsSummary {
  totalActiveDeals: number;
  totalDealsDiscovered: number;
  totalDealsPublished: number;
  avgDealsPerDay: number;
  topCategory: string;
  topSource: string;
  expiringNext7Days: number;
  lastUpdated: string;
}

// ============================================================================
// Main Analytics Generator
// ============================================================================

export async function generateDealAnalytics(
  env: Env,
  days: number = 30,
): Promise<DealAnalytics> {
  const [snapshot, sourceRegistry, logs, metrics] = await Promise.all([
    getProductionSnapshot(env),
    getSourceRegistry(env),
    getRecentLogs(env, 1000),
    getRecentMetrics(env, 100),
  ]);

  const deals = snapshot?.deals || [];

  return {
    dealsOverTime: calculateDealsOverTime(deals, logs, days),
    categoryBreakdown: calculateCategoryBreakdown(deals),
    sourcePerformance: calculateSourcePerformance(deals, sourceRegistry),
    valueDistribution: calculateValueDistribution(deals),
    expiringSoon: calculateExpiringSoon(deals),
    qualityMetrics: calculateQualityMetrics(deals, logs, metrics),
  };
}

export async function generateAnalyticsSummary(
  env: Env,
  days: number = 30,
): Promise<AnalyticsSummary> {
  const [snapshot, logs] = await Promise.all([
    getProductionSnapshot(env),
    getRecentLogs(env, 1000),
  ]);

  const deals = snapshot?.deals || [];
  const activeDeals = deals.filter((d) => d.metadata.status === "active");

  // Calculate totals from logs
  const recentLogs = logs.filter((log) => {
    const logDate = new Date(log.ts);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return logDate >= cutoffDate;
  });

  const discovered = recentLogs.reduce(
    (sum, log) => sum + (log.candidate_count || 0),
    0,
  );
  const published = recentLogs.reduce(
    (sum, log) => sum + (log.valid_count || 0),
    0,
  );

  // Find top category
  const categoryCounts = new Map<string, number>();
  activeDeals.forEach((deal) => {
    deal.metadata.category.forEach((cat) => {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    });
  });
  const topCategory =
    Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "N/A";

  // Find top source
  const sourceCounts = new Map<string, number>();
  activeDeals.forEach((deal) => {
    sourceCounts.set(
      deal.source.domain,
      (sourceCounts.get(deal.source.domain) || 0) + 1,
    );
  });
  const topSource =
    Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "N/A";

  // Count expiring in next 7 days
  const now = new Date();
  const next7Days = new Date(now);
  next7Days.setDate(next7Days.getDate() + 7);

  const expiringNext7Days = activeDeals.filter((deal) => {
    if (!deal.expiry.date) return false;
    const expiryDate = new Date(deal.expiry.date);
    return expiryDate <= next7Days && expiryDate >= now;
  }).length;

  return {
    totalActiveDeals: activeDeals.length,
    totalDealsDiscovered: discovered,
    totalDealsPublished: published,
    avgDealsPerDay: Math.round((discovered / days) * 100) / 100,
    topCategory,
    topSource,
    expiringNext7Days,
    lastUpdated: snapshot?.generated_at || new Date().toISOString(),
  };
}

// ============================================================================
// Individual Analytics Calculators
// ============================================================================

function calculateDealsOverTime(
  deals: Deal[],
  logs: LogEntry[],
  days: number,
): DealAnalytics["dealsOverTime"] {
  const result: DealAnalytics["dealsOverTime"] = [];
  const now = new Date();

  // Create date buckets for the lookback period
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    // Count deals discovered on this date (from logs)
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const discovered = logs.filter((log) => {
      const logDate = new Date(log.ts);
      return (
        logDate >= dayStart &&
        logDate <= dayEnd &&
        log.phase === "discover" &&
        log.candidate_count
      );
    }).length;

    // Count deals published on this date
    const published = logs.filter((log) => {
      const logDate = new Date(log.ts);
      return (
        logDate >= dayStart &&
        logDate <= dayEnd &&
        log.phase === "publish" &&
        log.status === "complete"
      );
    }).length;

    // Count deals that expired on this date
    const expired = deals.filter((deal) => {
      if (!deal.expiry.date) return false;
      const expiryDate = new Date(deal.expiry.date);
      return (
        expiryDate >= dayStart &&
        expiryDate <= dayEnd &&
        deal.metadata.status !== "active"
      );
    }).length;

    result.push({
      date: dateStr,
      discovered,
      published,
      expired,
    });
  }

  return result;
}

function calculateCategoryBreakdown(
  deals: Deal[],
): DealAnalytics["categoryBreakdown"] {
  const categoryStats = new Map<
    string,
    {
      count: number;
      confidenceSum: number;
      valueSum: number;
    }
  >();

  deals.forEach((deal) => {
    deal.metadata.category.forEach((category) => {
      const stats = categoryStats.get(category) || {
        count: 0,
        confidenceSum: 0,
        valueSum: 0,
      };

      stats.count++;
      stats.confidenceSum += deal.metadata.confidence_score;

      // Add value if numeric
      if (typeof deal.reward.value === "number") {
        stats.valueSum += deal.reward.value;
      }

      categoryStats.set(category, stats);
    });
  });

  return Array.from(categoryStats.entries()).map(([category, stats]) => ({
    category,
    count: stats.count,
    avgConfidence: Math.round((stats.confidenceSum / stats.count) * 100) / 100,
    avgValue:
      stats.count > 0
        ? Math.round((stats.valueSum / stats.count) * 100) / 100
        : 0,
  }));
}

function calculateSourcePerformance(
  deals: Deal[],
  sourceRegistry: Awaited<ReturnType<typeof getSourceRegistry>>,
): DealAnalytics["sourcePerformance"] {
  const sourceStats = new Map<
    string,
    {
      dealsDiscovered: number;
      dealsPublished: number;
      confidenceSum: number;
    }
  >();

  // Count deals per source
  deals.forEach((deal) => {
    const domain = deal.source.domain;
    const stats = sourceStats.get(domain) || {
      dealsDiscovered: 0,
      dealsPublished: 0,
      confidenceSum: 0,
    };

    stats.dealsDiscovered++;
    stats.confidenceSum += deal.metadata.confidence_score;

    if (deal.metadata.status === "active") {
      stats.dealsPublished++;
    }

    sourceStats.set(domain, stats);
  });

  // Merge with registry data for trust scores
  return Array.from(sourceStats.entries()).map(([domain, stats]) => {
    const registrySource = sourceRegistry.find((s) => s.domain === domain);
    const trustScore = registrySource?.trust_initial || 0.5;

    return {
      domain,
      dealsDiscovered: stats.dealsDiscovered,
      dealsPublished: stats.dealsPublished,
      avgConfidence:
        Math.round((stats.confidenceSum / stats.dealsDiscovered) * 100) / 100,
      trustScore,
    };
  });
}

function calculateValueDistribution(
  deals: Deal[],
): DealAnalytics["valueDistribution"] {
  const ranges = [
    { min: 0, max: 50, label: "0-50" },
    { min: 50, max: 100, label: "50-100" },
    { min: 100, max: 500, label: "100-500" },
    { min: 500, max: Infinity, label: "500+" },
  ];

  const rangeCounts = new Map<string, number>();

  deals.forEach((deal) => {
    const value = deal.reward.value;
    if (typeof value === "number") {
      const range = ranges.find((r) => value >= r.min && value < r.max);
      if (range) {
        rangeCounts.set(range.label, (rangeCounts.get(range.label) || 0) + 1);
      }
    }
  });

  const total = deals.filter((d) => typeof d.reward.value === "number").length;

  return ranges.map((range) => {
    const count = rangeCounts.get(range.label) || 0;
    return {
      range: range.label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}

function calculateExpiringSoon(deals: Deal[]): DealAnalytics["expiringSoon"] {
  const now = new Date();

  const next7Days = new Date(now);
  next7Days.setDate(next7Days.getDate() + 7);

  const next30Days = new Date(now);
  next30Days.setDate(next30Days.getDate() + 30);

  const next90Days = new Date(now);
  next90Days.setDate(next90Days.getDate() + 90);

  let expiring7Days = 0;
  let expiring30Days = 0;
  let expiring90Days = 0;

  deals.forEach((deal) => {
    if (!deal.expiry.date) return;

    const expiryDate = new Date(deal.expiry.date);

    if (expiryDate >= now && expiryDate <= next7Days) {
      expiring7Days++;
    }
    if (expiryDate >= now && expiryDate <= next30Days) {
      expiring30Days++;
    }
    if (expiryDate >= now && expiryDate <= next90Days) {
      expiring90Days++;
    }
  });

  return {
    next7Days: expiring7Days,
    next30Days: expiring30Days,
    next90Days: expiring90Days,
  };
}

function calculateQualityMetrics(
  deals: Deal[],
  logs: LogEntry[],
  metrics: Awaited<ReturnType<typeof getRecentMetrics>>,
): DealAnalytics["qualityMetrics"] {
  // Calculate average confidence
  const avgConfidence =
    deals.length > 0
      ? Math.round(
          (deals.reduce((sum, d) => sum + d.metadata.confidence_score, 0) /
            deals.length) *
            100,
        ) / 100
      : 0;

  // Calculate validation success rate from recent logs
  const validationLogs = logs.filter(
    (log) => log.phase === "validate" && log.candidate_count !== undefined,
  );

  const totalCandidates = validationLogs.reduce(
    (sum, log) => sum + (log.candidate_count || 0),
    0,
  );
  const totalValid = validationLogs.reduce(
    (sum, log) => sum + (log.valid_count || 0),
    0,
  );

  const validationSuccessRate =
    totalCandidates > 0
      ? Math.round((totalValid / totalCandidates) * 1000) / 10
      : 100;

  // Calculate quarantine rate
  const quarantined = deals.filter(
    (d) => d.metadata.status === "quarantined",
  ).length;
  const quarantineRate =
    deals.length > 0 ? Math.round((quarantined / deals.length) * 1000) / 10 : 0;

  return {
    avgConfidence,
    validationSuccessRate,
    quarantineRate,
  };
}

// ============================================================================
// HTML Dashboard Generator
// ============================================================================

export function generateDashboardHTML(analytics: DealAnalytics): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deal Analytics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 2rem;
      font-size: 2.5rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }
    .card h2 {
      color: #333;
      font-size: 1.25rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card h2::before {
      content: '';
      width: 4px;
      height: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
    }
    .metric {
      text-align: center;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 12px;
    }
    .metric-value {
      font-size: 2rem;
      font-weight: bold;
      color: #667eea;
    }
    .metric-label {
      font-size: 0.875rem;
      color: #666;
      margin-top: 0.25rem;
    }
    .chart-container {
      position: relative;
      height: 250px;
      margin-top: 1rem;
    }
    .table-container {
      overflow-x: auto;
      margin-top: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      font-weight: 600;
      color: #333;
      background: #f8f9fa;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-success {
      background: #d4edda;
      color: #155724;
    }
    .badge-warning {
      background: #fff3cd;
      color: #856404;
    }
    .badge-info {
      background: #d1ecf1;
      color: #0c5460;
    }
    .timestamp {
      text-align: center;
      color: rgba(255,255,255,0.8);
      font-size: 0.875rem;
      margin-top: 2rem;
    }
    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
      body {
        padding: 1rem;
      }
      h1 {
        font-size: 1.75rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Deal Analytics Dashboard</h1>

    <!-- Quality Metrics -->
    <div class="grid">
      <div class="card">
        <h2>Quality Metrics</h2>
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-value">${(analytics.qualityMetrics.avgConfidence * 100).toFixed(0)}%</div>
            <div class="metric-label">Avg Confidence</div>
          </div>
          <div class="metric">
            <div class="metric-value">${analytics.qualityMetrics.validationSuccessRate.toFixed(1)}%</div>
            <div class="metric-label">Validation Rate</div>
          </div>
          <div class="metric">
            <div class="metric-value">${analytics.qualityMetrics.quarantineRate.toFixed(1)}%</div>
            <div class="metric-label">Quarantine Rate</div>
          </div>
        </div>
      </div>

      <!-- Expiry Forecast -->
      <div class="card">
        <h2>Expiring Soon</h2>
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-value">${analytics.expiringSoon.next7Days}</div>
            <div class="metric-label">Next 7 Days</div>
          </div>
          <div class="metric">
            <div class="metric-value">${analytics.expiringSoon.next30Days}</div>
            <div class="metric-label">Next 30 Days</div>
          </div>
          <div class="metric">
            <div class="metric-value">${analytics.expiringSoon.next90Days}</div>
            <div class="metric-label">Next 90 Days</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Deal Volume Trend -->
    <div class="grid">
      <div class="card" style="grid-column: 1 / -1;">
        <h2>Deal Volume Over Time</h2>
        <div class="chart-container">
          <canvas id="volumeChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Category & Value Distribution -->
    <div class="grid">
      <div class="card">
        <h2>Category Distribution</h2>
        <div class="chart-container">
          <canvas id="categoryChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>Value Distribution</h2>
        <div class="chart-container">
          <canvas id="valueChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Source Performance -->
    <div class="grid">
      <div class="card" style="grid-column: 1 / -1;">
        <h2>Source Performance</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Deals Discovered</th>
                <th>Published</th>
                <th>Avg Confidence</th>
                <th>Trust Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${analytics.sourcePerformance
                .sort((a, b) => b.dealsDiscovered - a.dealsDiscovered)
                .slice(0, 10)
                .map(
                  (source) => `
                <tr>
                  <td>${source.domain}</td>
                  <td>${source.dealsDiscovered}</td>
                  <td>${source.dealsPublished}</td>
                  <td>${(source.avgConfidence * 100).toFixed(0)}%</td>
                  <td>${(source.trustScore * 100).toFixed(0)}%</td>
                  <td>
                    <span class="badge ${source.trustScore >= 0.7 ? "badge-success" : source.trustScore >= 0.4 ? "badge-warning" : "badge-info"}">
                      ${source.trustScore >= 0.7 ? "Trusted" : source.trustScore >= 0.4 ? "Probationary" : "Unverified"}
                    </span>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
  </div>

  <script>
    // Volume Chart
    const volumeCtx = document.getElementById('volumeChart').getContext('2d');
    new Chart(volumeCtx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(analytics.dealsOverTime.map((d) => d.date))},
        datasets: [
          {
            label: 'Discovered',
            data: ${JSON.stringify(analytics.dealsOverTime.map((d) => d.discovered))},
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Published',
            data: ${JSON.stringify(analytics.dealsOverTime.map((d) => d.published))},
            borderColor: '#48bb78',
            backgroundColor: 'rgba(72, 187, 120, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Expired',
            data: ${JSON.stringify(analytics.dealsOverTime.map((d) => d.expired))},
            borderColor: '#f56565',
            backgroundColor: 'rgba(245, 101, 101, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });

    // Category Chart
    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    new Chart(categoryCtx, {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(analytics.categoryBreakdown.map((c) => c.category))},
        datasets: [{
          data: ${JSON.stringify(analytics.categoryBreakdown.map((c) => c.count))},
          backgroundColor: [
            '#667eea', '#764ba2', '#f093fb', '#f5576c',
            '#4facfe', '#00f2fe', '#43e97b', '#38f9d7'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
          }
        }
      }
    });

    // Value Distribution Chart
    const valueCtx = document.getElementById('valueChart').getContext('2d');
    new Chart(valueCtx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(analytics.valueDistribution.map((v) => v.range))},
        datasets: [{
          label: 'Deals',
          data: ${JSON.stringify(analytics.valueDistribution.map((v) => v.count))},
          backgroundColor: [
            '#667eea', '#764ba2', '#f093fb', '#f5576c'
          ],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  </script>
</body>
</html>`;
}
