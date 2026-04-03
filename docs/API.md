# API Documentation

## Base URL

Production: `https://your-worker.workers.dev`

## Authentication

No authentication required for public endpoints.
For admin endpoints (future), API key via header: `X-API-Key: your-key`

## Endpoints

### GET /health

Check system health status.

**Response:**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2024-03-31T12:00:00Z",
  "checks": {
    "kv_connection": true,
    "last_run_success": true,
    "snapshot_valid": true
  }
}

---

### GET /deals/ranked

Get ranked and sorted deals with composite scoring.

**Query Parameters:**

- `sort_by` (string): Sort field - 'confidence', 'recency', 'value', 'expiry', 'trust' (default: 'confidence')
- `order` (string): Sort order - 'asc' or 'desc' (default: 'desc')
- `limit` (number): Max deals to return (default: 50, max: 1000)
- `min_confidence` (number): Minimum confidence score filter
- `min_trust` (number): Minimum trust score filter (0-1)
- `category` (string): Filter by category
- `include_scores` (boolean): Include score breakdown in response

**Response:**

```json
{
  "deals": [...],
  "meta": {
    "total": 100,
    "filtered": 45,
    "returned": 50,
    "sort_by": "confidence",
    "order": "desc"
  },
  "scores": [
    {
      "dealId": "sha256-hash",
      "score": 85.5,
      "breakdown": {
        "confidence": 85,
        "trust": 90,
        "recency": 75,
        "value": 80,
        "expiry": 90
      }
    }
  ]
}
```

---

### GET /deals/highlights

Get highlighted deals (top, expiring soon, recently added).

**Query Parameters:**

- `limit` (number): Deals per category (default: 5)

**Response:**

```json
{
  "top_deals": [...],
  "expiring_soon": [...],
  "recently_added": [...],
  "meta": {
    "top_deals_count": 5,
    "expiring_soon_count": 3,
    "recently_added_count": 8
  }
}
```

---

### GET /api/analytics

Get comprehensive deal analytics and insights.

**Query Parameters:**

- `days` (number): Time period for analysis (default: 30, max: 90)
- `format` (string): 'json' or 'summary' (default: 'json')

**Response (JSON format):**

```json
{
  "dealsOverTime": [
    { "date": "2024-03-24", "discovered": 5, "published": 4, "expired": 1 }
  ],
  "categoryBreakdown": [
    { "category": "finance", "count": 25, "avgConfidence": 0.82, "avgValue": 45 }
  ],
  "sourcePerformance": [
    { "domain": "trading212.com", "dealsDiscovered": 10, "trustScore": 0.9 }
  ],
  "valueDistribution": [
    { "range": "0-25", "count": 15, "percentage": 30 }
  ],
  "expiringSoon": {
    "next7Days": 3,
    "next30Days": 12,
    "next90Days": 28
  },
  "qualityMetrics": {
    "avgConfidence": 0.78,
    "validationSuccessRate": 0.95,
    "duplicateRate": 0.05
  }
}
```

**Response (Summary format):**

```json
{
  "total_deals": 100,
  "active_deals": 85,
  "avg_deals_per_day": 3.5,
  "total_value": 2500,
  "unique_sources": 12,
  "discovery_rate": 3.2
}
```

---

### GET /deals

Get active deals (filtered array).

**Query Parameters:**

- `category` (string): Filter by category (e.g., 'trading', 'crypto')
- `min_reward` (number): Minimum reward value
- `limit` (number): Max deals to return (default: 100, max: 1000)

**Response:**

```json
[
  {
    "id": "sha256-hash",
    "title": "Trading212",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "reward": {
      "type": "item",
      "value": "Free share worth up to £100"
    },
    "metadata": {
      "confidence_score": 0.85,
      "status": "active"
    }
  }
]
```

---

### GET /deals.json

Get full snapshot with metadata.

**Response:**

```json
{
  "version": "0.1.0",
  "generated_at": "2024-03-31T12:00:00Z",
  "run_id": "deals-2024-03-31-12",
  "snapshot_hash": "abc123...",
  "stats": {
    "total": 50,
    "active": 45,
    "quarantined": 3,
    "rejected": 2
  },
  "deals": [...]
}
```

---

### GET /metrics

Prometheus-compatible metrics.

**Response:**

```
# HELP deals_runs_total Total discovery runs
deals_runs_total 42

# HELP deals_active_deals Current active deals
deals_active_deals 45
```

**Content-Type:** `text/plain`

---

### POST /api/research

Research referral codes for a specific domain or query.

**Request Body:**

```json
{
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "depth": "thorough",
  "sources": ["all"],
  "max_results": 20,
  "options": {
    "use_real_fetching": false
  }
}
```

**Parameters:**

- `query` (string, required): Search query for referral codes
- `domain` (string, optional): Target domain to search for
- `depth` (string, optional): Research depth - 'quick', 'thorough', or 'deep' (default: 'quick')
- `sources` (array, optional): Sources to search - 'all' or specific sources like ['producthunt', 'reddit', 'hackernews', 'github']
- `max_results` (number, optional): Maximum results to return (default: 10, max: 100)
- `options.use_real_fetching` (boolean, optional): Enable real web fetching (default: false, uses simulation)

**Response:**

```json
{
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "discovered_codes": [
    {
      "code": "ABC123XYZ",
      "url": "https://trading212.com/invite/ABC123XYZ",
      "source": "known_pattern:trading212.com",
      "discovered_at": "2024-03-31T12:00:00Z",
      "reward_summary": "Free share worth up to £100",
      "confidence": 0.85
    }
  ],
  "research_metadata": {
    "sources_checked": ["known_pattern:trading212.com", "producthunt", "reddit"],
    "search_queries": ["trading212 referral", "trading212 invite"],
    "research_duration_ms": 1250,
    "agent_id": "research-agent-1711886400000",
    "used_real_fetching": false
  }
}
```

**Research Sources:**

When `sources` is set to `["all"]` or specific sources, the system searches:

- `known_pattern`: Known referral programs with defined patterns (e.g., trading212.com)
- `producthunt`: Product Hunt for product referral programs
- `reddit`: Reddit discussions about referral codes
- `hackernews`: Hacker News referral discussions
- `github`: GitHub repositories with referral documentation
- `company_site`: Direct company website scraping

**Real vs Simulated Fetching:**

By default (`use_real_fetching: false`), the system uses simulation to generate realistic referral codes based on known patterns. When enabled:

- The system fetches real web content from the specified sources
- Extracts referral codes using pattern matching
- Returns actual discovered codes with confidence scores
- Falls back to simulation if fetching fails

**Rate Limiting:**

Research requests are rate-limited per source (10 requests per minute per source). When rate limited, the system returns a 429 status with retry information.

**Status Codes:**

- 200: Research completed successfully
- 400: Invalid request parameters
- 429: Rate limited - retry after specified time
- 500: Research failed

---

### POST /api/discover

Trigger manual discovery (triggers pipeline).

**Response:**

```json
{
  "success": true,
  "message": "Discovery pipeline triggered"
}
```

**Status Codes:**

- 200: Pipeline triggered
- 409: Another run in progress
- 500: Pipeline failed

---

### GET /api/status

Get current pipeline status.

**Response:**

```json
{
  "locked": false,
  "current_run": null,
  "last_run": {
    "run_id": "deals-2024-03-31-12",
    "timestamp": "2024-03-31T12:00:00Z",
    "success": true
  }
}
```

---

### GET /api/log

Get research logs.

**Query Parameters:**

- `run_id` (string): Get logs for specific run
- `count` (number): Number of recent logs (default: 100)
- `format` (string): 'json' or 'jsonl' (default: json)

**Response (JSON):**

```json
{
  "logs": [
    {
      "run_id": "deals-2024-03-31-12",
      "phase": "discover",
      "status": "complete",
      "candidate_count": 15
    }
  ],
  "count": 1
}
```

**Response (JSONL):**

```
{"run_id":"...","phase":"discover","status":"complete"}
{"run_id":"...","phase":"validate","status":"complete"}
```

---

### POST /api/submit

Submit a new deal for validation.

**Request Body:**

```json
{
  "url": "https://example.com/invite/CODE123",
  "code": "CODE123",
  "source": "example.com",
  "metadata": {}
}
```

**Response:**

```json
{
  "success": true,
  "message": "Deal submitted for review",
  "code": "CODE123"
}
```

**Status Codes:**

- 202: Submitted for review
- 400: Invalid request
- 409: Deal already exists

## Error Responses

All errors follow this format:

```json
{
  "error": "Error description",
  "message": "Detailed message"
}
```

**Status Codes:**

- 400: Bad Request
- 404: Not Found
- 409: Conflict
- 429: Rate Limited
- 500: Internal Server Error

## Rate Limiting

- 100 requests per minute per IP
- Exceeded limit returns 429 status
- Retry-After header included

## CORS

All endpoints support CORS:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Tool Definitions (for AI Agents)

### get_deals

```json
{
  "name": "get_deals",
  "description": "Retrieve active referral deals",
  "parameters": {
    "type": "object",
    "properties": {
      "category": { "type": "string" },
      "min_reward": { "type": "number" },
      "limit": { "type": "number", "default": 100 }
    }
  }
}
```

### get_deal_by_code

```json
{
  "name": "get_deal_by_code",
  "description": "Find deal by referral code",
  "parameters": {
    "type": "object",
    "properties": {
      "code": { "type": "string" }
    },
    "required": ["code"]
  }
}
```

### submit_deal

```json
{
  "name": "submit_deal",
  "description": "Submit a discovered deal",
  "parameters": {
    "type": "object",
    "properties": {
      "url": { "type": "string" },
      "code": { "type": "string" },
      "source": { "type": "string" }
    },
    "required": ["url", "code"]
  }
}
```


---

## Multi-Agent Workflow API

Execute coordinated 4-phase workflow with specialized agents.

### POST /api/workflow/execute

Execute the complete multi-agent workflow.

**Request Body:**

```json
{
  "workflow_id": "my-workflow-001",
  "dry_run": false,
  "skip_phases": [],
  "options": {
    "notify_on_complete": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "workflow_id": "my-workflow-001",
  "status": "completed",
  "phases": [
    {
      "phase": 1,
      "name": "Codebase Verification",
      "status": "passed",
      "duration_ms": 1234,
      "checks": [
        {
          "name": "URL Pattern Verification",
          "status": "passed",
          "message": "Checked 4 URL patterns: 0 incorrect"
        }
      ],
      "findings": [],
      "errors": []
    },
    {
      "phase": 2,
      "name": "Evals & Tests",
      "status": "partial",
      "duration_ms": 5678,
      "checks": [],
      "findings": [],
      "errors": []
    },
    {
      "phase": 3,
      "name": "Git Workflow",
      "status": "passed",
      "duration_ms": 9012,
      "checks": [],
      "findings": [],
      "metadata": {
        "commits_created": 3,
        "push_success": true
      }
    },
    {
      "phase": 4,
      "name": "Issue Fixer",
      "status": "partial",
      "duration_ms": 3456,
      "checks": [],
      "findings": [],
      "metadata": {
        "issues_detected": 2,
        "auto_fixable": 1,
        "fixed": 1,
        "unresolved": 1
      }
    }
  ],
  "metadata": {
    "total_duration_ms": 19380,
    "phases_passed": 2,
    "phases_failed": 0,
    "phases_partial": 2,
    "commits_created": ["64b7eec", "4031253", "f546fcf"],
    "issues_fixed": ["package-lock-sync"]
  },
  "duration_ms": 19380,
  "events": [
    { "type": "workflow_started", "timestamp": "..." },
    { "type": "phase_started", "phase": 1, "timestamp": "..." },
    { "type": "phase_completed", "phase": 1, "timestamp": "..." },
    { "type": "handoff_completed", "phase": 1, "timestamp": "..." }
  ]
}
```

### GET /api/workflow/plan

Get the execution plan without running.

**Response:**

```json
{
  "plan_id": "evt-1234567890-abc123",
  "workflow_id": "multi-agent-4-phase",
  "created_at": "2026-04-03T15:00:00Z",
  "phases": [
    {
      "phase": 1,
      "agent_id": "verifier",
      "estimated_duration_ms": 300000,
      "dependencies": [],
      "fallback_strategy": "skip"
    },
    {
      "phase": 2,
      "agent_id": "tester",
      "estimated_duration_ms": 600000,
      "dependencies": [1],
      "fallback_strategy": "retry"
    },
    {
      "phase": 3,
      "agent_id": "git",
      "estimated_duration_ms": 300000,
      "dependencies": [2],
      "fallback_strategy": "retry"
    },
    {
      "phase": 4,
      "agent_id": "fixer",
      "estimated_duration_ms": 600000,
      "dependencies": [3],
      "fallback_strategy": "retry"
    }
  ],
  "estimated_duration_ms": 1800000,
  "risk_assessment": {
    "overall_risk": "medium",
    "factors": [
      {
        "category": "test_environment",
        "level": "high",
        "description": "Known Vitest pool crashes in test environment"
      }
    ],
    "mitigation_strategies": [
      "Use retry logic for transient failures",
      "Document known issues in LESSONS.md"
    ]
  }
}
```

### POST /api/workflow/phase/:phase

Execute a specific phase only.

**Parameters:**

- `phase` (number): Phase number (1-4)

**Request Body:**

```json
{
  "dry_run": true
}
```

**Response:**

```json
{
  "phase": 1,
  "name": "Codebase Verification",
  "status": "passed",
  "duration_ms": 1234,
  "checks": [],
  "findings": [],
  "errors": []
}
```

### Workflow Phases

| Phase | Agent | Purpose | Timeout |
|-------|-------|---------|---------|
| 1 | CodebaseVerificationAgent | Verify URL patterns, file structure | 5 min |
| 2 | EvalsAndTestsAgent | Run TypeScript, tests, validation gates | 10 min |
| 3 | GitWorkflowAgent | Stage, commit, push changes | 5 min |
| 4 | IssueFixerAgent | Detect and fix pre-existing issues | 10 min |

### Quality Gates

Each phase has quality gates that must pass:

- **Phase 1**: No incorrect URLs, no missing critical files
- **Phase 2**: TypeScript compiles, test pass rate ≥ 80%
- **Phase 3**: At least 1 commit created, push successful
- **Phase 4**: No critical issues, auto-fix success rate ≥ 50%

### Event Types

| Event | Description |
|-------|-------------|
| `workflow_started` | Workflow execution began |
| `phase_started` | Phase execution began |
| `phase_completed` | Phase completed successfully |
| `phase_failed` | Phase failed |
| `phase_retry` | Retrying failed phase |
| `quality_gate_passed` | Quality gate criteria met |
| `quality_gate_failed` | Quality gate criteria not met |
| `handoff_completed` | Handoff to next phase |
| `workflow_completed` | All phases completed |
| `workflow_failed` | Workflow failed |
| `workflow_cancelled` | Workflow cancelled |

### Error Handling

The orchestrator handles errors with:

- **Retry Logic**: Configurable max attempts with exponential backoff
- **Quality Gates**: Phase boundaries with criteria validation
- **Graceful Degradation**: Continue with warnings if non-critical
- **Event Logging**: All events emitted for monitoring
