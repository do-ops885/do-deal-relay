# Web Research Integration

**Feature**: Automated referral code discovery from web sources
**Version**: 0.2.0
**Status**: Complete - Real API integrations implemented

## Overview

The Web Research Integration provides automated discovery of referral codes across multiple web sources using **real API integrations** (not simulated). The research agent queries various platforms to find active referral codes for specified domains, with confidence scoring, circuit breaker protection, and result caching.

## Cost-Effective Research Strategy

For research tasks, follow this cascade to minimize token usage:

```
1. llms.txt (FREE, structured) - Check docs sites first
   ↓ if not found
2. Direct HTTP fetch (FREE) - Simple GET request
   ↓ if fails
3. Jina Reader API (FREE tier) - AI-powered extraction
   ↓ if fails  
4. Paid APIs (last resort) - Tavily, Exa, Firecrawl
```

**Tool Selection**:
| Task | Recommended Tool | Why |
|------|------------------|-----|
| API docs, specs | `web-doc-resolver` | llms.txt often available |
| GitHub repos | `web-doc-resolver` | Direct fetch works well |
| Deep research | `web-search-researcher` | Multi-source aggregation |

**Usage**:
```bash
# Cost-effective resolution (free sources first)
skill web-doc-resolver

# Deep research (when free sources insufficient)  
skill web-search-researcher
```

## Real API Integrations (Implemented)

The research agent now uses **actual APIs** (not simulation):

| Source      | API Type | Endpoint | Rate Limit |
| ----------- | -------- | -------- | ---------- |
| ProductHunt | GraphQL | `api.producthunt.com/v2/api/graphql` | Fair use |
| GitHub      | REST | `api.github.com/search/repositories` | 30/min |
| Hacker News | Algolia | `hn.algolia.com/api/v1/search` | No limit |
| Reddit      | OAuth | `oauth.reddit.com` | 60/min |
| Generic     | Direct | Any URL | 1 req/sec |

## Research Commands

### Via CLI

```bash
npx ts-node scripts/refcli.ts research run --domain example.com --depth thorough
```

### Via API

```bash
curl -X POST http://localhost:8787/api/research \
  -H "Content-Type: application/json" \
  -d '{"query": "example referral code", "domain": "example.com", "depth": "thorough"}'
```

### Via Agent (GOAP)

```
skill goap-agent
research-task: "Find all referral codes for domain X"
output: temp/research-*.md
```

## Integration Points

```
Research → temp/research-*.md → Deal extraction pipeline → Update worker/sources/
```

**Flow**:

1. Research agent executes parallel queries across all sources
2. Results merged with confidence scoring
3. Deal extraction pipeline processes findings
4. Validated referrals added to storage

## Research Agent Components

| Component        | Location                     | Purpose                          |
| ---------------- | ---------------------------- | -------------------------------- |
| Core Agent       | `worker/lib/research-agent/` | Multi-source discovery engine    |
| Fetchers         | `fetcher.ts`                 | Real API integrations            |
| Sources Config   | `sources.ts`                 | API configs, rate limits, auth     |
| Orchestrator     | `orchestrator.ts`            | Parallel research, circuit breaker |
| Confidence Score | Research result metadata     | Quality ranking (0.0 - 1.0)      |
| Result Storage   | KV-based with TTL            | Cached research results            |

## Research Depth Levels

| Level      | Description                             | Sources Checked | Timeout |
| ---------- | --------------------------------------- | --------------- | ------- |
| `quick`    | Fast scan of primary sources            | 2-3             | 30s     |
| `standard` | Balanced coverage and speed             | 4-5             | 60s     |
| `thorough` | Comprehensive search across all sources | All             | 120s    |

## API Endpoints

| Method | Endpoint                | Description          |
| ------ | ----------------------- | -------------------- |
| POST   | `/api/research`         | Execute web research |
| GET    | `/api/research/:domain` | Get cached results   |

## Response Format

```json
{
  "domain": "example.com",
  "query": "example referral code",
  "depth": "thorough",
  "results": [
    {
      "code": "ABC123",
      "url": "https://example.com/invite/ABC123",
      "source": "producthunt",
      "confidence": 0.92,
      "discoveredAt": "2024-01-15T10:30:00Z"
    }
  ],
  "sourcesChecked": ["producthunt", "github", "hackernews", "reddit"],
  "completedAt": "2024-01-15T10:32:00Z"
}
```

## Circuit Breaker Protection

Each source has circuit breaker protection:
- Opens after 5 consecutive failures
- Half-open after 30s cooldown
- Full reset after 60s of success

## Rate Limiting

- Global: 60 requests/minute per IP
- Per-source: Configurable in `sources.ts`
- Automatic retry with exponential backoff

## See Also

- [web-doc-resolver skill](../../.agents/skills/web-doc-resolver/) - Cost-effective research
- [URL Handling](../url-handling.md) - URL preservation rules
- [API Documentation](../../docs/API.md) - Full API reference
- [CLI Documentation](../../temp/analysis-cli.md) - CLI usage guide
