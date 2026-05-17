# Experience Feedback

**Feature**: Track user/agent interactions with deals and aggregate satisfaction scores
**Version**: 0.1.3
**Status**: Implemented

## Overview

The Experience Feedback system records interactions (clicks, views, conversions, feedback) with deals and aggregates them into per-deal satisfaction scores. Scores range from -100 to 100, enabling quality-based deal ranking. A daily cron job runs aggregation to update summary statistics.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/experience` | Submit a new experience event |
| GET | `/api/experience/:code` | Get aggregated data for a deal |
| POST | `/api/experience/aggregate` | Trigger manual aggregation run |

### POST `/api/experience` Request Body

```json
{
  "deal_code": "abc123",
  "event_type": "click",
  "agent_id": "agent-001",
  "score": 75,
  "metadata": { "source": "email", "user_agent": "..." }
}
```

## Architecture

### Event Types

| Type | Description | Typical Score |
|------|-------------|---------------|
| `click` | User clicked the deal link | 0 to 50 |
| `view` | Deal was viewed/displayed | 0 to 10 |
| `conversion` | User completed referral action | 50 to 100 |
| `feedback` | Explicit user feedback submitted | -100 to 100 |

### Score Range

Scores are integers from **-100 to 100**:
- **-100**: Worst possible experience (broken link, scam, expired)
- **0**: Neutral (viewed but no action)
- **100**: Best possible experience (successful conversion, high reward)

### Data Flow

1. **Event Submission** — POST to `/api/experience` inserts into `experience_events` table
2. **Aggregation** — Cron job or manual trigger runs `runAggregation()`
3. **Summary Update** — Aggregates upserted into `experience_aggregates` table

### Aggregation Logic

For each deal within the configured time window:
- `total_events` — Count of all events
- `positive_events` — Events with score > 0
- `negative_events` — Events with score < 0
- `avg_score` — Average score across all events
- `last_updated` — Timestamp of last aggregation

### Daily Cron Job

Aggregation runs on a schedule using `CONFIG.EXPERIENCE_AGGREGATE_WINDOW_HOURS` to determine the lookback window. Can also be triggered manually via POST `/api/experience/aggregate`.

## Configuration

| Setting | Description |
|---------|-------------|
| `EXPERIENCE_AGGREGATE_WINDOW_HOURS` | Lookback window for aggregation |

## Error Handling

| Condition | Status | Response |
|-----------|--------|----------|
| D1 not configured | 503 | "D1 database not configured" |
| Wrong content type | 415 | "Content-Type must be application/json" |
| Invalid JSON | 400 | "Invalid JSON body" |
| Missing deal_code/event_type | 400 | "deal_code and event_type are required" |
| Invalid event_type | 400 | "Invalid event_type. Must be one of: click, view, conversion, feedback" |
| Score out of range | 400 | "score must be an integer between -100 and 100" |
| Aggregation failure | 500 | "Aggregation failed" |

## Source Files

| File | Purpose |
|------|---------|
| `worker/routes/experience.ts` | HTTP route handlers |
| `worker/lib/d1/experience.ts` | D1 database operations (insert, query, aggregate) |
