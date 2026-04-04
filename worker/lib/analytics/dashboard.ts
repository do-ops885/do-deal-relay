import type { DealAnalytics } from "./types";

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
