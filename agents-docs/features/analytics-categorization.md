# Analytics & Categorization

**Feature**: Automated deal analytics, category scoring, and dashboard generation
**Version**: 0.1.3
**Status**: Implemented

## Overview

The Analytics & Categorization system provides deal performance insights and automatic deal classification. Analytics cover volume trends, category distribution, source performance, value distribution, and quality metrics. Categorization uses keyword and domain scoring to assign categories and tags to deals.

## Analytics

### Metrics

| Metric | Description |
|--------|-------------|
| **Deals Over Time** | Daily discovered, published, and expired deal counts |
| **Category Breakdown** | Deal count, avg confidence, and avg value per category |
| **Source Performance** | Deals discovered/published, avg confidence, trust score per domain |
| **Value Distribution** | Deal counts in value ranges: 0-50, 50-100, 100-500, 500+ |
| **Expiring Soon** | Counts of deals expiring in next 7, 30, and 90 days |
| **Quality Metrics** | Avg confidence, validation success rate, quarantine rate |

### Analytics Summary

Aggregated overview: total active deals, discovered/published counts, avg deals/day, top category, top source, expiring in 7 days.

### Dashboard Generation

`generateDashboardHTML()` produces a responsive HTML dashboard with Chart.js visualizations: line chart for volume trends, doughnut for categories, bar chart for value distribution, and a sortable source performance table.

## Categorization

### Auto-Categorization Pipeline

1. **Category Scoring** — Score each category based on domain match (+10), keyword matches (+1 each), code relevance (+0.5)
2. **Category Selection** — Top category with score >= 2 selected; second category included if within 50% of top score
3. **Default** — Falls back to "general" if no category scores >= 2
4. **Tag Scoring** — Score tags by keyword matches; add domain tag, "auto-categorized" tag, and high-value tag (reward >= 50)
5. **Deduplication** — Max 8 unique tags per deal

### Batch Processing

`batchAutoCategorize()` applies categorization to multiple deals in parallel.

### Category Definitions (13 categories)

| Category | Description | Example Domains |
|----------|-------------|-----------------|
| `finance` | Banking, investing, trading, crypto | robinhood.com, coinbase.com |
| `food_delivery` | Food delivery and meal services | doordash.com, ubereats.com |
| `transportation` | Ride-sharing and mobility | uber.com, lyft.com |
| `travel` | Travel and accommodation | airbnb.com, booking.com |
| `shopping` | Retail and cashback platforms | amazon.com, rakuten.com |
| `cloud_storage` | Cloud storage and hosting | dropbox.com, aws.amazon.com |
| `communication` | Mobile carriers and ISPs | verizon.com, t-mobile.com |
| `entertainment` | Streaming and gaming | netflix.com, spotify.com |
| `health` | Fitness and wellness | peloton.com, headspace.com |
| `education` | Online learning platforms | coursera.org, udemy.com |
| `software` | SaaS and applications | github.com, notion.so |
| `referral` | General referral programs | (keyword-based) |

### Tag Types (7 types)

| Tag | Keywords | Related Categories |
|-----|----------|-------------------|
| `signup_bonus` | "sign up", "new account", "first deposit", "welcome bonus" | finance, referral, shopping |
| `cashback` | "cashback", "cash back", "percent back", "reward" | finance, shopping |
| `crypto` | "bitcoin", "ethereum", "crypto", "btc", "eth", "wallet" | finance |
| `stock_trading` | "stock", "share", "equity", "trade", "commission free" | finance |
| `high_value` | (based on reward value >= 50) | (dynamic) |
| `limited_time` | "limited", "expires", "deadline", "ends soon" | (dynamic) |
| `recurring` | "monthly", "annual", "subscription", "recurring" | (dynamic) |

## Source Files

| File | Purpose |
|------|---------|
| `worker/lib/analytics/index.ts` | Main analytics generator, summary |
| `worker/lib/analytics/calculators.ts` | Individual metric calculators |
| `worker/lib/analytics/types.ts` | Analytics type definitions |
| `worker/lib/analytics/dashboard.ts` | HTML dashboard generator |
| `worker/lib/categorization/index.ts` | Auto-categorization and batch processing |
| `worker/lib/categorization/scoring.ts` | Category and tag scoring functions |
| `worker/lib/categorization/definitions.ts` | Category and tag definitions |
