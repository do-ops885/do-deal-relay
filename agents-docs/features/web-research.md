# Web Research Integration

**Feature**: Automated referral code discovery from web sources
**Version: 0.1.1
**Status**: Implemented

## Overview

The Web Research Integration provides automated discovery of referral codes across multiple web sources. The research agent scans various platforms to find active referral codes for specified domains, with confidence scoring and result storage.

## Sources

The research agent queries the following sources:

| Source      | Description                              |
| ----------- | ---------------------------------------- |
| ProductHunt | New product launches with referral codes |
| GitHub      | Trending repositories and READMEs        |
| Hacker News | Discussion threads and Show HN posts     |
| RSS Feeds   | Aggregated tech and deal feeds           |
| Reddit      | Subreddit discussions about referrals    |

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

1. Research agent executes queries across sources
2. Results written to `temp/research-*.md`
3. Deal extraction pipeline processes findings
4. Validated referrals added to `worker/sources/`

## Research Agent Components

| Component        | Location                     | Purpose                       |
| ---------------- | ---------------------------- | ----------------------------- |
| Core Agent       | `worker/lib/research-agent/` | Multi-source discovery engine |
| Confidence Score | Research result metadata     | Quality ranking (0.0 - 1.0)   |
| Result Storage   | KV-based with TTL            | Cached research results       |

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
  "sourcesChecked": ["producthunt", "github", "reddit"],
  "completedAt": "2024-01-15T10:32:00Z"
}
```

## See Also

- [RESEARCH.md](../RESEARCH.md) - Source specifications and research methodology
- [API Documentation](../../docs/API.md) - Full API reference
- [CLI Documentation](../../temp/analysis-cli.md) - CLI usage guide
