# Natural Language Query (NLQ) API

**Feature**: Convert natural language queries into structured database searches
**Version**: 0.1.3
**Status**: Implemented

## Overview

The NLQ API allows users to search for deals using natural language (e.g., "trading platforms with $100+ signup bonus"). It parses queries to extract intent and entities, builds structured SQL, executes against the D1 database, and returns results with explanations.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/nlq` | Execute natural language query (JSON body) |
| GET | `/api/nlq` | Execute query via URL parameter (`?q=`) |
| POST | `/api/nlq/explain` | Parse and explain query without executing |
| GET | `/api/nlq/explain` | Explain query via URL parameter (`?q=`) |

### POST `/api/nlq` Request Body

```json
{
  "query": "trading platforms with $100+ signup bonus",
  "limit": 20,
  "offset": 0,
  "include_expired": false,
  "min_confidence": 0.5
}
```

## Architecture

### Processing Pipeline

1. **Tokenization** — Split query into tokens, normalize (lowercase, stem)
2. **Intent Classification** — Classify as `search`, `compare`, `rank`, or `count`
3. **Entity Extraction** — Pull dollar amounts, categories, domains, date ranges
4. **Query Building** — Construct structured D1 query with filters
5. **Execution** — Run against D1 database with full-text search
6. **Explanation** — Generate human-readable explanation of parsing

### Supported Intents

| Intent | Description | Example |
|--------|-------------|---------|
| `search` | Find matching deals | "crypto referral codes" |
| `compare` | Compare deals side-by-side | "compare Uber vs Lyft bonuses" |
| `rank` | Sort by value/quality | "best trading bonuses" |
| `count` | Return count only | "how many food delivery deals" |

### Entity Extraction

| Entity Type | Pattern | Example |
|-------------|---------|---------|
| Dollar amount | `$N`, `$N+`, `$N-N` | `$100`, `$50+` |
| Category | Keyword matching | "trading", "food delivery" |
| Domain | Domain name | "uber.com", "airbnb" |
| Date range | Relative dates | "this week", "last month" |

### Rate Limiting

| Setting | Value |
|---------|-------|
| Max requests | 30 per minute |
| Window | 60 seconds |
| Key prefix | `ratelimit:nlq` |
| Client ID | IP address or API key |

## Error Handling

| Condition | Status | Code |
|-----------|--------|------|
| D1 not configured | 503 | `DATABASE_UNAVAILABLE` |
| Rate limit exceeded | 429 | `RATE_LIMITED` |
| Method not allowed | 405 | `METHOD_NOT_ALLOWED` |
| Invalid JSON | 400 | `PARSE_ERROR` |
| Validation error | 400 | `VALIDATION_ERROR` |
| Query too long (>500 chars) | 400 | `QUERY_TOO_LONG` |
| Missing query param | 400 | `MISSING_PARAMETER` |
| Execution failure | 500 | `EXECUTION_ERROR` |

Each response includes `X-RateLimit-*` headers for client-side rate tracking.

## Source Files

| File | Purpose |
|------|---------|
| `worker/routes/nlq/index.ts` | Route registration |
| `worker/routes/nlq/handlers.ts` | HTTP handlers (POST, GET, explain) |
| `worker/routes/nlq/service.ts` | Programmatic NLQ execution (MCP) |
| `worker/routes/nlq/utils.ts` | Logger, trace ID, rate limit config |
| `worker/lib/nlq/parser.ts` | Query parsing, tokenization, intent |
| `worker/lib/nlq/query-builder.ts` | Structured query construction |
| `worker/lib/nlq/types.ts` | TypeScript type definitions |
