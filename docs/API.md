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
  "version": "0.2.0",
  "timestamp": "2024-03-31T12:00:00Z",
  "checks": {
    "kv_connection": true,
    "last_run_success": true,
    "snapshot_valid": true
  }
}
```

#### GET /health/ready

Readiness probe - returns 200 when all dependencies are healthy.

**Response** (200 OK):

```json
{
  "ready": true,
  "status": "healthy",
  "timestamp": "2026-04-04T12:00:00Z",
  "version": "0.2.0",
  "checks": {
    "kv_connection": true,
    "last_run_success": true,
    "snapshot_valid": true
  },
  "components": {
    "kv_stores": {
      "deals_prod": true,
      "deals_staging": true,
      "deals_log": true,
      "deals_lock": true,
      "deals_sources": true
    },
    "pipeline": {
      "last_run": "2026-04-04T11:00:00Z",
      "last_success": true,
      "average_duration_ms": 0
    },
    "external_services": {
      "github_api": true
    }
  }
}
```

**Response** (503 Service Unavailable):

```json
{
  "ready": false,
  "status": "degraded",
  "timestamp": "2026-04-04T12:00:00Z",
  "version": "0.2.0",
  "checks": {
    "kv_connection": false,
    "last_run_success": false,
    "snapshot_valid": false
  }
}
```

#### GET /health/live

Liveness probe - returns 200 if service is running. Minimal check used by orchestrators (Kubernetes, etc.) to verify the worker is alive.

**Response** (200 OK):

```json
{
  "alive": true,
  "timestamp": "2026-04-04T12:00:00Z"
}
```

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
  "version": "0.2.0",
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

---

## Referral API

Manage referral codes with full CRUD operations and research capabilities.

### GET /api/referrals

Search and list referral codes with filtering.

**Query Parameters:**

- `domain` (string): Filter by domain (e.g., 'trading212.com')
- `status` (string): Filter by status - 'active', 'inactive', 'expired', 'all' (default: 'all')
- `category` (string): Filter by category
- `source` (string): Filter by source - 'api', 'mcp_agent', 'research', 'all' (default: 'all')
- `limit` (number): Max results to return (default: 100, max: 1000)
- `offset` (number): Pagination offset (default: 0)

**Response:**

```json
{
  "referrals": [
    {
      "id": "abc123-sha256",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "status": "active",
      "source": "api",
      "submitted_at": "2024-03-31T12:00:00Z",
      "metadata": {
        "title": "Trading212 Referral",
        "description": "Free share worth up to £100",
        "reward_type": "item",
        "reward_value": "Free share worth up to £100",
        "category": ["finance", "investing"],
        "confidence_score": 0.85
      }
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

---

### POST /api/referrals

Create a new referral code.

**Request Body:**

```json
{
  "code": "MYCODE123",
  "url": "https://example.com/invite/MYCODE123",
  "domain": "example.com",
  "source": "api",
  "submitted_by": "user@example.com",
  "expires_at": "2024-12-31T23:59:59Z",
  "metadata": {
    "title": "Example Referral",
    "description": "Get $10 off your first purchase",
    "reward_type": "cash",
    "reward_value": 10,
    "currency": "USD",
    "category": ["shopping"],
    "tags": ["new-user", "signup"],
    "requirements": ["New users only", "Min purchase $50"],
    "confidence_score": 0.9,
    "notes": "Verified referral program"
  }
}
```

**Required Fields:**
- `code` (string): The referral code
- `url` (string): Full referral URL
- `domain` (string): Domain name

**Optional Fields:**
- `source` (string): Source of the referral (default: 'api')
- `submitted_by` (string): Who submitted the referral
- `expires_at` (string): ISO 8601 expiration date
- `metadata` (object): Additional metadata

**Response (201 Created):**

```json
{
  "success": true,
  "message": "Referral created successfully",
  "referral": {
    "id": "generated-sha256-id",
    "code": "MYCODE123",
    "url": "https://example.com/invite/MYCODE123",
    "domain": "example.com",
    "status": "quarantined"
  }
}
```

**Status Codes:**

- 201: Created successfully
- 400: Validation failed
- 409: Referral code already exists
- 413: Request body too large (>1MB)
- 415: Content-Type must be application/json

---

### GET /api/referrals/:code

Get a specific referral by code.

**Parameters:**

- `code` (string): The referral code to look up

**Response:**

```json
{
  "referral": {
    "id": "abc123-sha256",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "domain": "trading212.com",
    "status": "active",
    "source": "api",
    "submitted_at": "2024-03-31T12:00:00Z",
    "submitted_by": "api",
    "expires_at": "2024-12-31T23:59:59Z",
    "deactivated_at": null,
    "deactivated_reason": null,
    "replaced_by": null,
    "description": "Referral code for trading212.com",
    "metadata": {
      "title": "Trading212 Referral",
      "description": "Free share worth up to £100",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "currency": "GBP",
      "category": ["finance", "investing"],
      "tags": ["verified", "high-value"],
      "requirements": ["New users only"],
      "confidence_score": 0.85,
      "notes": "Verified referral program"
    },
    "validation": {
      "last_validated": "2024-03-31T12:00:00Z",
      "status": "valid"
    }
  }
}
```

**Status Codes:**

- 200: Success
- 404: Referral not found

---

### POST /api/referrals/:code/deactivate

Deactivate a referral code.

**Parameters:**

- `code` (string): The referral code to deactivate

**Request Body:**

```json
{
  "reason": "expired",
  "replaced_by": "NEWCODE456",
  "notes": "Code expired, replaced with new code"
}
```

**Required Fields:**
- `reason` (string): Why the code is being deactivated

**Optional Fields:**
- `replaced_by` (string): New code that replaces this one
- `notes` (string): Additional notes

**Response:**

```json
{
  "success": true,
  "message": "Referral deactivated successfully",
  "referral": {
    "id": "abc123-sha256",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "domain": "trading212.com",
    "status": "inactive",
    "deactivated_at": "2024-04-01T10:30:00Z",
    "reason": "expired",
    "replaced_by": "NEWCODE456"
  }
}
```

**Status Codes:**

- 200: Deactivated successfully
- 400: Invalid request
- 404: Referral not found

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
- `sources` (array, optional): Sources to search - 'all' or specific sources
- `max_results` (number, optional): Maximum results (default: 10, max: 100)
- `options.use_real_fetching` (boolean, optional): Enable real web fetching (default: false)

**Response:**

```json
{
  "success": true,
  "message": "Research completed",
  "query": "trading212 referral code",
  "domain": "trading212.com",
  "discovered_codes": 5,
  "stored_referrals": 3,
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

- `known_pattern`: Known referral programs with defined patterns
- `producthunt`: Product Hunt for product referral programs
- `reddit`: Reddit discussions about referral codes
- `hackernews`: Hacker News referral discussions
- `github`: GitHub repositories with referral documentation
- `company_site`: Direct company website scraping

**Status Codes:**

- 200: Research completed
- 400: Invalid request
- 415: Content-Type must be application/json
- 500: Research failed

---

## D1 Database API

Advanced database queries, full-text search, and statistics via D1 SQL database.

### GET /api/d1/search

Full-text search deals using FTS5 (Full-Text Search).

**Query Parameters:**

- `q` (string, required): Search query
- `limit` (number): Max results (default: 20)
- `include_expired` (boolean): Include expired deals (default: false)
- `status` (string): Filter by status ('active', 'inactive', 'expired', 'quarantined')

**Response:**

```json
{
  "success": true,
  "query": "trading212 free share",
  "count": 5,
  "results": [
    {
      "id": "sha256-hash",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "title": "Trading212 Referral",
      "description": "Free share worth up to £100",
      "status": "active",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "categories": ["finance", "investing"],
      "confidence_score": 0.85,
      "submitted_at": "2024-03-31T12:00:00Z",
      "expires_at": "2024-12-31T23:59:59Z",
      "rank": 0.95
    }
  ]
}
```

**FTS5 Query Syntax:**

- Simple terms: `q=trading212` - matches any field containing "trading212"
- Phrases: `q="free share"` - exact phrase match
- AND: `q=trading212 AND investing` - both terms must match
- OR: `q=trading212 OR scalable` - either term matches
- NOT: `q=trading212 NOT expired` - exclude matches
- Prefix: `q=trad*` - prefix matching

**Example Queries:**

```bash
# Simple search
curl "https://your-worker.workers.dev/api/d1/search?q=trading212"

# Phrase search
curl "https://your-worker.workers.dev/api/d1/search?q=%22free%20share%22"

# Active deals only
curl "https://your-worker.workers.dev/api/d1/search?q=finance&status=active"

# Include expired
curl "https://your-worker.workers.dev/api/d1/search?q=crypto&include_expired=true"
```

---

### GET /api/d1/suggestions

Get search suggestions for autocomplete (requires at least 2 characters).

**Query Parameters:**

- `q` (string, required): Partial query (min 2 characters)
- `limit` (number): Max suggestions (default: 10)

**Response:**

```json
{
  "success": true,
  "query": "trad",
  "suggestions": [
    "trading212",
    "trading",
    "trade republic",
    "trader"
  ]
}
```

**Example:**

```bash
curl "https://your-worker.workers.dev/api/d1/suggestions?q=trad&limit=5"
```

---

### GET /api/d1/stats

Get comprehensive database statistics.

**Response:**

```json
{
  "success": true,
  "stats": {
    "total_deals": 150,
    "active_deals": 120,
    "expired_deals": 20,
    "quarantined_deals": 10,
    "total_referral_codes": 150,
    "avg_confidence_score": 0.78,
    "top_category": "finance",
    "top_source": "api",
    "deals_added_last_7_days": 15,
    "deals_added_last_30_days": 45,
    "deals_expiring_next_7_days": 5,
    "deals_expiring_next_30_days": 18
  }
}
```

---

### GET /api/d1/deals

Advanced deal filtering with multiple criteria.

**Query Parameters:**

- `domain` (string): Filter by domain
- `category` (string): Filter by category
- `status` (string): Filter by status (default: 'active')
- `limit` (number): Max results (default: 50)
- `min_confidence` (number): Minimum confidence score (0-1)
- `expiring_in` (number): Days until expiration (gets deals expiring within N days)

**Response:**

```json
{
  "success": true,
  "count": 10,
  "metadata": {
    "filter": {
      "type": "domain",
      "domain": "trading212.com"
    }
  },
  "results": [
    {
      "id": "sha256-hash",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "domain": "trading212.com",
      "title": "Trading212 Referral",
      "status": "active",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "confidence_score": 0.85,
      "expires_at": "2024-12-31T23:59:59Z"
    }
  ]
}
```

**Example Queries:**

```bash
# By domain
curl "https://your-worker.workers.dev/api/d1/deals?domain=trading212.com"

# By category with confidence filter
curl "https://your-worker.workers.dev/api/d1/deals?category=finance&min_confidence=0.8"

# Expiring soon
curl "https://your-worker.workers.dev/api/d1/deals?expiring_in=7"

# All statuses
curl "https://your-worker.workers.dev/api/d1/deals?status=all&limit=100"
```

---

### GET /api/d1/domains

List all domains with deal counts.

**Response:**

```json
{
  "success": true,
  "count": 25,
  "domains": [
    {
      "domain": "trading212.com",
      "deal_count": 3,
      "active_count": 2,
      "expired_count": 1
    },
    {
      "domain": "scalable.capital",
      "deal_count": 2,
      "active_count": 2,
      "expired_count": 0
    }
  ]
}
```

---

### GET /api/d1/categories

List all categories with deal counts.

**Response:**

```json
{
  "success": true,
  "count": 8,
  "categories": [
    {
      "name": "finance",
      "display_name": "Finance & Banking",
      "deal_count": 45,
      "description": "Financial services and banking deals"
    },
    {
      "name": "shopping",
      "display_name": "Shopping",
      "deal_count": 30,
      "description": "Retail and e-commerce deals"
    }
  ]
}
```

---

### GET /api/d1/migrations

Get database migration status or initialize database.

**Query Parameters:**

- `action` (string): Set to 'init' to initialize database

**Response (Status):**

```json
{
  "success": true,
  "status": {
    "currentVersion": 3,
    "latestVersion": 3,
    "pendingCount": 0,
    "pending": [],
    "appliedCount": 3
  }
}
```

**Response (Initialize):**

```json
{
  "success": true,
  "message": "Database initialized to version 3",
  "applied": [1, 2, 3],
  "error": null
}
```

**Example:**

```bash
# Check status
curl "https://your-worker.workers.dev/api/d1/migrations"

# Initialize database
curl "https://your-worker.workers.dev/api/d1/migrations?action=init"
```

---

### GET /api/d1/health

Check D1 database health and connectivity.

**Response:**

```json
{
  "success": true,
  "healthy": true,
  "status": {
    "connected": true,
    "currentVersion": 3,
    "latestVersion": 3,
    "pendingMigrations": 0
  }
}
```

---

## NLQ (Natural Language Query) API

Search deals using natural language queries like "trading deals with $100 bonuses" or "crypto platforms with signup rewards". The NLQ API parses user intent, extracts entities, and executes optimized database queries.

---

### POST /api/nlq

Execute a natural language query to search for deals.

**Request Body:**

```json
{
  "query": "trading platforms with $100 signup bonus",
  "limit": 20,
  "offset": 0,
  "include_expired": false,
  "min_confidence": 0.7
}
```

**Parameters:**

- `query` (string, required): Natural language search query (max 500 characters)
- `limit` (number, optional): Max results to return (default: 20, max: 100)
- `offset` (number, optional): Pagination offset (default: 0)
- `include_expired` (boolean, optional): Include expired deals (default: false)
- `min_confidence` (number, optional): Minimum confidence score filter (0-1)

**Response:**

```json
{
  "success": true,
  "query": "trading platforms with $100 signup bonus",
  "explanation": {
    "intent": "search",
    "intent_confidence": 0.92,
    "entities_found": 3,
    "filters_applied": [
      "category:trading",
      "reward_value:gte:100"
    ],
    "search_text": "trading signup bonus",
    "sort_applied": {
      "field": "relevance",
      "order": "desc"
    }
  },
  "count": 8,
  "execution_time_ms": 145,
  "results": [
    {
      "id": "sha256-hash",
      "code": "ABC123",
      "url": "https://trading212.com/invite/ABC123",
      "domain": "trading212.com",
      "title": "Trading212",
      "description": "Free share worth up to £100",
      "status": "active",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "categories": ["finance", "trading"],
      "confidence_score": 0.85,
      "expires_at": "2024-12-31T23:59:59Z"
    }
  ]
}
```

**Status Codes:**

- 200: Query executed successfully
- 400: Invalid request (validation error or missing query)
- 429: Rate limit exceeded
- 500: Query execution failed
- 503: Database unavailable

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/api/nlq" \
  -H "Content-Type: application/json" \
  -d '{"query": "crypto exchanges with high signup bonuses", "limit": 10}'
```

---

### GET /api/nlq

Execute a natural language query via URL parameter (simplified interface for quick queries).

**Query Parameters:**

- `q` (string, required): Natural language search query (max 500 characters)
- `limit` (number, optional): Max results to return (default: 20)
- `include_expired` (boolean, optional): Include expired deals (default: false)

**Response:**

Same format as POST /api/nlq

**Example:**

```bash
# Simple search
curl "https://your-worker.workers.dev/api/nlq?q=trading%20platforms%20with%20bonus"

# With limit
curl "https://your-worker.workers.dev/api/nlq?q=crypto%20deals&limit=5"

# Include expired deals
curl "https://your-worker.workers.dev/api/nlq?q=finance&include_expired=true"
```

---

### POST /api/nlq/explain

Explain how a query would be parsed without executing it. Useful for debugging and understanding query interpretation.

**Request Body:**

```json
{
  "query": "trading deals with $100 bonuses"
}
```

**Query Parameters (alternative to POST body):**

- `q` (string): Natural language query (when using GET)

**Response:**

```json
{
  "success": true,
  "query": "trading deals with $100 bonuses",
  "parsed": {
    "tokens": [
      { "value": "trading", "type": "word", "normalized": "trading" },
      { "value": "deals", "type": "word", "normalized": "deals" },
      { "value": "$", "type": "currency", "normalized": "USD" },
      { "value": "100", "type": "number", "normalized": "100" },
      { "value": "bonuses", "type": "word", "normalized": "bonuses" }
    ],
    "intent": {
      "intent": "search",
      "confidence": 0.89,
      "keywords": ["find", "search", "deals"],
      "originalQuery": "trading deals with $100 bonuses"
    },
    "entities": [
      { "type": "category", "value": "trading", "confidence": 0.95 },
      { "type": "reward_value", "value": 100, "operator": "gte", "confidence": 0.88 }
    ]
  },
  "structured": {
    "textQuery": "trading bonuses",
    "filters": [
      { "field": "category", "operator": "like", "value": "trading" },
      { "field": "reward_value", "operator": "gte", "value": 100 }
    ],
    "categories": ["trading"],
    "sortBy": "relevance",
    "sortOrder": "desc",
    "limit": 20,
    "offset": 0,
    "includeExpired": false
  },
  "explanation": {
    "intent": "search",
    "intent_confidence": 0.89,
    "entities_found": 2,
    "filters_applied": [
      "category:trading",
      "reward_value:gte:100"
    ],
    "search_text": "trading bonuses",
    "sort_applied": {
      "field": "relevance",
      "order": "desc"
    }
  }
}
```

**Status Codes:**

- 200: Explain completed successfully
- 400: Missing or invalid query
- 500: Explain failed
- 503: Database unavailable

**Examples:**

```bash
# Using POST with JSON body
curl -X POST "https://your-worker.workers.dev/api/nlq/explain" \
  -H "Content-Type: application/json" \
  -d '{"query": "high value crypto signup bonuses"}'

# Using GET with query parameter
curl "https://your-worker.workers.dev/api/nlq/explain?q=trading%20deals%20with%20$100%20bonuses"
```

---

## Webhook API

Manage webhook subscriptions, incoming webhooks from partners, and delivery monitoring. Webhooks enable real-time notifications when referral deals are created, updated, or change status.

---

### POST /webhooks/subscribe

Subscribe to receive webhook events when referrals change.

**Request Headers:**

- `X-API-Key` (string, required): Valid API key for authentication
- `Content-Type` (string, required): `application/json`

**Request Body:**

```json
{
  "url": "https://example.com/webhooks",
  "events": ["referral.created", "referral.updated"],
  "partner_id": "my_partner",
  "metadata": {
    "team": "engineering",
    "environment": "production"
  },
  "retry_policy": {
    "max_attempts": 5,
    "initial_delay_ms": 1000,
    "max_delay_ms": 60000,
    "backoff_multiplier": 2
  },
  "filters": {
    "domains": ["trading212.com"],
    "status": ["active"]
  }
}
```

**Parameters:**

- `url` (string, required): HTTPS URL to receive webhook events
- `events` (array, required): Event types to subscribe to
  - Valid events: `referral.created`, `referral.updated`, `referral.deactivated`, `referral.expired`, `referral.validated`, `referral.quarantined`, `ping`
- `partner_id` (string, optional): Partner identifier (default: "default")
- `metadata` (object, optional): Custom metadata for the subscription
- `retry_policy` (object, optional): Custom retry configuration
- `filters` (object, optional): Filter events by domains or status

**Response (201 Created):**

```json
{
  "success": true,
  "subscription": {
    "id": "sub_abc123xyz",
    "url": "https://example.com/webhooks",
    "events": ["referral.created", "referral.updated"],
    "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxx",
    "active": true,
    "created_at": "2024-03-31T12:00:00Z"
  }
}
```

**Status Codes:**

- 201: Subscription created successfully
- 400: Invalid request (missing fields, invalid URL, or invalid events)
- 401: Unauthorized - missing or invalid API key
- 500: Failed to create subscription

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/webhooks/subscribe" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "url": "https://example.com/webhooks",
    "events": ["referral.created", "referral.updated"],
    "partner_id": "my_app"
  }'
```

---

### POST /webhooks/unsubscribe

Unsubscribe from webhook events and delete a subscription.

**Request Headers:**

- `X-API-Key` (string, required): Valid API key for authentication
- `Content-Type` (string, required): `application/json`

**Request Body:**

```json
{
  "subscription_id": "sub_abc123xyz"
}
```

**Parameters:**

- `subscription_id` (string, required): ID of the subscription to delete

**Response:**

```json
{
  "success": true,
  "message": "Subscription deleted successfully"
}
```

**Status Codes:**

- 200: Subscription deleted successfully
- 400: Missing subscription_id
- 401: Unauthorized - missing or invalid API key
- 404: Subscription not found
- 500: Failed to delete subscription

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/webhooks/unsubscribe" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"subscription_id": "sub_abc123xyz"}'
```

---

### GET /webhooks/subscriptions

List active webhook subscriptions for a partner.

**Query Parameters:**

- `partner_id` (string, optional): Filter by partner ID (default: "default")

**Response:**

```json
{
  "subscriptions": [
    {
      "id": "sub_abc123xyz",
      "url": "https://example.com/webhooks",
      "events": ["referral.created", "referral.updated"],
      "active": true,
      "created_at": "2024-03-31T12:00:00Z",
      "filters": {
        "domains": ["trading212.com"],
        "status": ["active"]
      }
    }
  ]
}
```

**Status Codes:**

- 200: Success
- 500: Failed to list subscriptions

**Example:**

```bash
# List all subscriptions for default partner
curl "https://your-worker.workers.dev/webhooks/subscriptions"

# List subscriptions for specific partner
curl "https://your-worker.workers.dev/webhooks/subscriptions?partner_id=my_app"
```

---

### POST /webhooks/partners

Register a new webhook partner for incoming webhooks.

**Request Headers:**

- `X-API-Key` (string, required): Valid API key for authentication
- `Content-Type` (string, required): `application/json`

**Request Body:**

```json
{
  "name": "Trading212 Integration",
  "allowed_events": ["referral.created", "referral.updated"],
  "rate_limit_per_minute": 100
}
```

**Parameters:**

- `name` (string, required): Partner name
- `allowed_events` (array, optional): Events this partner can send
- `rate_limit_per_minute` (number, optional): Rate limit for incoming webhooks

**Response (201 Created):**

```json
{
  "success": true,
  "partner": {
    "id": "partner_trading212",
    "name": "Trading212 Integration",
    "secret": "whsec_partner_xxxxxxxxxxxxxxxx",
    "active": true,
    "allowed_events": ["referral.created", "referral.updated"],
    "rate_limit_per_minute": 100,
    "created_at": "2024-03-31T12:00:00Z"
  }
}
```

**Status Codes:**

- 201: Partner created successfully
- 400: Missing required field: name
- 401: Unauthorized - missing or invalid API key
- 500: Failed to create partner

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/webhooks/partners" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "Trading212 Integration",
    "allowed_events": ["referral.created"],
    "rate_limit_per_minute": 60
  }'
```

---

### GET /webhooks/partners/:partnerId

Get details for a specific webhook partner.

**Parameters:**

- `partnerId` (string, required): Partner ID to look up

**Response:**

```json
{
  "partner": {
    "id": "partner_trading212",
    "name": "Trading212 Integration",
    "active": true,
    "allowed_events": ["referral.created", "referral.updated"],
    "rate_limit_per_minute": 100,
    "created_at": "2024-03-31T12:00:00Z"
  }
}
```

**Status Codes:**

- 200: Success
- 404: Partner not found
- 500: Failed to get partner

**Example:**

```bash
curl "https://your-worker.workers.dev/webhooks/partners/partner_trading212"
```

---

### POST /webhooks/incoming/:partnerId

Receive incoming webhooks from partners. Requires HMAC signature verification.

**Request Headers:**

- `Content-Type` (string, required): `application/json`
- `X-Webhook-Signature` (string, required): HMAC-SHA256 signature of payload
- `X-Webhook-Timestamp` (string, required): Unix timestamp of request
- `X-Webhook-Id` (string, required): Unique webhook ID for idempotency
- `Idempotency-Key` (string, optional): Additional idempotency key

**Request Body:**

```json
{
  "event": "referral.created",
  "data": {
    "code": "ABC123XYZ",
    "url": "https://trading212.com/invite/ABC123XYZ",
    "domain": "trading212.com",
    "title": "Trading212 Referral",
    "description": "Free share worth up to £100",
    "reward": {
      "type": "item",
      "value": "Free share worth up to £100",
      "currency": "GBP"
    },
    "expires_at": "2024-12-31T23:59:59Z",
    "status": "active",
    "metadata": {
      "source": "partner_webhook"
    }
  },
  "external_id": "ext_12345",
  "metadata": {
    "partner_version": "1.0"
  }
}
```

**Parameters:**

- `event` (string, required): Event type
- `data` (object, required): Referral data
  - `code` (string, required): Referral code
  - `url` (string, required): Full referral URL
  - `domain` (string, required): Domain name
  - `title` (string, optional): Referral title
  - `description` (string, optional): Description
  - `reward` (object, optional): Reward details
  - `expires_at` (string, optional): ISO 8601 expiration date
  - `status` (string, optional): Status (active, inactive, expired, quarantined)
- `external_id` (string, optional): External reference ID
- `metadata` (object, optional): Additional metadata

**Response:**

```json
{
  "success": true,
  "message": "Referral created successfully",
  "referral_id": "abc123-sha256"
}
```

**Status Codes:**

- 200: Webhook processed successfully
- 400: Missing required headers or invalid payload
- 415: Content-Type must be application/json
- 500: Failed to process webhook

**Signature Verification:**

Partners must sign payloads using HMAC-SHA256 with their partner secret:

```
Signature = HMAC-SHA256(partner_secret, timestamp + "." + payload)
```

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/webhooks/incoming/partner_trading212" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=xxxxxxxxxxxxxxxx" \
  -H "X-Webhook-Timestamp: 1711886400" \
  -H "X-Webhook-Id: wh_1234567890" \
  -d '{
    "event": "referral.created",
    "data": {
      "code": "NEWCODE123",
      "url": "https://example.com/invite/NEWCODE123",
      "domain": "example.com"
    }
  }'
```

---

### GET /webhooks/dlq

View the dead letter queue - failed webhook deliveries that can be retried.

**Response:**

```json
{
  "count": 3,
  "events": [
    {
      "event_id": "evt_abc123",
      "event_type": "referral.created",
      "subscription_id": "sub_xyz789",
      "attempts": 5,
      "enqueued_at": "2024-03-31T10:30:00Z",
      "retryable": true
    }
  ]
}
```

**Status Codes:**

- 200: Success
- 500: Failed to get dead letter queue

**Example:**

```bash
curl "https://your-worker.workers.dev/webhooks/dlq"
```

---

### POST /webhooks/dlq/:eventId/:subscriptionId

Retry a failed webhook delivery from the dead letter queue.

**Parameters:**

- `eventId` (string, required): Event ID to retry
- `subscriptionId` (string, required): Subscription ID for the delivery

**Response:**

```json
{
  "success": true,
  "message": "Event queued for retry",
  "event_id": "evt_abc123",
  "subscription_id": "sub_xyz789"
}
```

**Status Codes:**

- 200: Event queued for retry
- 404: Event not found or subscription inactive
- 500: Failed to retry event

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/webhooks/dlq/evt_abc123/sub_xyz789"
```

---

### POST /webhooks/sync

Configure bidirectional sync settings for a partner.

**Request Headers:**

- `Content-Type` (string, required): `application/json`

**Request Body:**

```json
{
  "partner_id": "partner_trading212",
  "direction": "bidirectional",
  "mode": "scheduled",
  "schedule": {
    "cron": "0 */6 * * *",
    "timezone": "UTC"
  },
  "conflict_resolution": "timestamp",
  "priority": "local",
  "filters": {
    "domains": ["trading212.com"],
    "status": ["active"]
  },
  "field_mapping": {
    "external_code": "code",
    "external_url": "url"
  }
}
```

**Parameters:**

- `partner_id` (string, required): Partner ID
- `direction` (string, required): Sync direction - `push`, `pull`, or `bidirectional`
- `mode` (string, required): Sync mode - `realtime`, `scheduled`, or `manual`
- `schedule` (object, optional): Cron schedule for scheduled mode
  - `cron` (string, required): Cron expression
  - `timezone` (string, required): Timezone identifier
- `conflict_resolution` (string, optional): How to resolve conflicts - `timestamp`, `priority`, or `manual`
- `priority` (string, optional): Default priority - `local` or `remote`
- `filters` (object, optional): Sync filters by domains or status
- `field_mapping` (object, optional): Map external field names to internal fields

**Response (201 Created):**

```json
{
  "success": true,
  "sync_config": {
    "id": "sync_abc123",
    "partner_id": "partner_trading212",
    "direction": "bidirectional",
    "mode": "scheduled",
    "status": "idle"
  }
}
```

**Status Codes:**

- 201: Sync configuration created
- 400: Missing required fields
- 500: Failed to create sync config

**Example:**

```bash
curl -X POST "https://your-worker.workers.dev/webhooks/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "partner_id": "partner_trading212",
    "direction": "bidirectional",
    "mode": "realtime"
  }'
```

---

### GET /webhooks/sync/:partnerId

Get the current sync state for a partner.

**Parameters:**

- `partnerId` (string, required): Partner ID to get sync state for

**Response:**

```json
{
  "state": {
    "partner_id": "partner_trading212",
    "last_sync_at": "2024-03-31T12:00:00Z",
    "cursor": "cursor_token_xyz",
    "sync_version": 42,
    "pending_changes": 5,
    "status": "idle",
    "last_error": null
  }
}
```

**Status Codes:**

- 200: Success
- 404: Sync state not found
- 500: Failed to get sync state

**Example:**

```bash
curl "https://your-worker.workers.dev/webhooks/sync/partner_trading212"
```

---

## Email API

Process incoming emails to extract referral codes, parse email content for testing, and retrieve help email templates. Email webhooks support HMAC signature verification for security.

---

### POST /api/email/incoming

Receive and process emails via webhook to extract referral codes. Supports HMAC signature verification for secure email processing.

**Request Headers**:

- `Content-Type` (string, required): `application/json`
- `X-Webhook-Signature` (string, optional): HMAC-SHA256 signature (required if `EMAIL_WEBHOOK_SECRET` is configured)
- `X-Webhook-Timestamp` (string, optional): Unix timestamp (required if signature is present)

**Request Body**:

```json
{
  "from": "user@example.com",
  "to": "referrals@do-deal-relay.com",
  "subject": "Trading212 Referral Code ABC123",
  "text": "Here is my referral code ABC123 for Trading212",
  "html": "<p>Here is my referral code <b>ABC123</b> for Trading212</p>",
  "headers": {
    "Message-Id": "<message-id@example.com>"
  }
}
```

**Parameters**:

- `from` (string, required): Sender email address (must be valid email format)
- `to` (string, required): Recipient email address(es), comma-separated for multiple recipients
- `subject` (string, required): Email subject line
- `text` (string, optional): Plain text body content
- `html` (string, optional): HTML body content
- `headers` (object, optional): Additional email headers

**Response (Success - 200)**:

```json
{
  "success": true,
  "message": "Referral code extracted and stored",
  "referralId": "sha256-hash-id",
  "extracted": {
    "code": "ABC123",
    "domain": "trading212.com",
    "url": "https://trading212.com/invite/ABC123",
    "confidence": 0.85,
    "command": null
  },
  "confirmationSent": true
}
```

**Response (Extraction Failed - 200)**:

```json
{
  "success": false,
  "message": "No referral code found in email",
  "referralId": null,
  "extracted": null,
  "confirmationSent": false
}
```

**Status Codes**:

- 200: Email processed (success depends on `success` field in response)
- 400: Missing required fields or invalid email format
- 401: Invalid webhook signature
- 500: Failed to process email

**Signature Verification**:

When `EMAIL_WEBHOOK_SECRET` environment variable is configured, requests must include:
- `X-Webhook-Signature`: `sha256=<base64_signature>`
- `X-Webhook-Timestamp`: Unix timestamp (within 5 minutes of current time)

Signature format: `HMAC-SHA256(webhook_secret, timestamp + "." + body)`

**Example**:

```bash
curl -X POST "https://your-worker.workers.dev/api/email/incoming" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=xxxxxxxxxxxxxxxx" \
  -H "X-Webhook-Timestamp: 1711886400" \
  -d '{
    "from": "user@example.com",
    "to": "referrals@do-deal-relay.com",
    "subject": "Trading212 Referral Code",
    "text": "My code is ABC123 for Trading212"
  }'
```

---

### POST /api/email/parse

Parse email content for testing email extraction without storing results. Useful for debugging email parsing logic and verifying extraction patterns.

**Request Headers**:

- `Content-Type` (string, required): `application/json`

**Request Body**:

```json
{
  "from": "test@example.com",
  "to": "referrals@do-deal-relay.com",
  "subject": "Here is my referral code XYZ789",
  "text": "Use my referral code XYZ789 for Robinhood",
  "html": "<p>Use my referral code <b>XYZ789</b> for Robinhood</p>"
}
```

**Parameters**:

- `from` (string, required): Sender email address
- `subject` (string, required): Email subject line
- `to` (string, optional): Recipient email address(es)
- `text` (string, optional): Plain text body content
- `html` (string, optional): HTML body content

**Response (200)**:

```json
{
  "extraction": {
    "code": "XYZ789",
    "domain": "robinhood.com",
    "url": "https://robinhood.com/invite/XYZ789",
    "confidence": 0.72,
    "command": null,
    "source": "email_body"
  },
  "command": {
    "type": "submit",
    "params": {
      "code": "XYZ789",
      "domain": "robinhood.com"
    },
    "confidence": 0.8
  },
  "email": {
    "from": "test@example.com",
    "to": ["referrals@do-deal-relay.com"],
    "subject": "Here is my referral code XYZ789",
    "hasText": true,
    "hasHtml": true
  }
}
```

**Status Codes**:

- 200: Parse completed successfully
- 400: Missing required fields (from, subject)
- 500: Failed to parse email

**Example**:

```bash
curl -X POST "https://your-worker.workers.dev/api/email/parse" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "subject": "Referral Code: ABC123 for Coinbase",
    "text": "Use my referral code ABC123"
  }'
```

---

### GET /api/email/help

Get help email content template for replying to users who need assistance with email submissions.

**Response (200)**:

```json
{
  "subject": "How to Submit Referral Codes via Email",
  "text": "Subject: [Company] Referral Code [CODE]\n\nBody: Include the referral code...",
  "html": "<h2>How to Submit Referral Codes via Email</h2><p>..."
}
```

**Status Codes**:

- 200: Help content retrieved successfully
- 500: Failed to generate help content

**Example**:

```bash
curl "https://your-worker.workers.dev/api/email/help"
```

---

## Webhook System

The webhook system enables real-time deal synchronization and event notifications between partners and the deal discovery platform.

### Authentication

- **Incoming webhooks**: HMAC-SHA256 signature verification via `X-Webhook-Signature` header
- **Subscription management**: API key via `X-API-Key` header
- **Partner management**: Admin-level API key required

---

### POST /webhooks/incoming/:partnerId

Receive incoming webhook events from partners. Creates or updates deals based on the webhook payload.

**Authentication**: HMAC-SHA256 signature verification

**Request Headers**:
- `X-Webhook-Signature`: HMAC-SHA256 signature of the request body
- `X-Webhook-Id`: Unique event ID
- `X-Webhook-Timestamp`: Unix timestamp (seconds)

**Request Body**:
```json
{
  "event": "referral.created",
  "data": {
    "code": "ABC123",
    "url": "https://example.com/ref/ABC123",
    "domain": "example.com",
    "title": "Example Referral",
    "reward": {
      "type": "cash",
      "value": 10,
      "currency": "USD"
    },
    "expires_at": "2026-12-31T23:59:59Z",
    "status": "active"
  },
  "external_id": "ext-12345",
  "metadata": {
    "source": "partner_system"
  }
}
```

**Supported Events**:
- `referral.created` - New referral deal
- `referral.updated` - Updated referral deal
- `referral.deactivated` - Deactivated referral
- `referral.expired` - Expired referral
- `referral.validated` - Validated referral
- `referral.quarantined` - Quarantined for review
- `ping` - Health check ping

**Response (200)**:
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "referralId": "ref_abc123"
}
```

**Status Codes**:
- 200: Webhook processed successfully
- 201: New deal created from webhook
- 400: Invalid payload or missing fields
- 401: Invalid or missing signature
- 429: Rate limit exceeded
- 500: Processing error

**Example**:
```bash
curl -X POST "https://your-worker.workers.dev/webhooks/incoming/partner-123" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=..." \
  -H "X-Webhook-Id: evt_123" \
  -H "X-Webhook-Timestamp: 1712000000" \
  -d '{
    "event": "referral.created",
    "data": {
      "code": "ABC123",
      "url": "https://example.com/ref/ABC123",
      "domain": "example.com"
    }
  }'
```

---

### POST /webhooks/subscribe

Subscribe to deal event notifications.

**Authentication**: API key required (`X-API-Key` header)

**Request Body**:
```json
{
  "partner_id": "partner-123",
  "url": "https://your-server.com/webhooks",
  "events": ["referral.created", "referral.updated"],
  "filters": {
    "domains": ["example.com", "test.com"],
    "status": ["active"]
  },
  "retry_policy": {
    "max_attempts": 5,
    "initial_delay_ms": 1000,
    "max_delay_ms": 60000,
    "backoff_multiplier": 2
  },
  "metadata": {
    "environment": "production"
  }
}
```

**Response (201)**:
```json
{
  "id": "sub_abc123",
  "partner_id": "partner-123",
  "url": "https://your-server.com/webhooks",
  "events": ["referral.created", "referral.updated"],
  "active": true,
  "created_at": "2026-04-04T12:00:00Z",
  "updated_at": "2026-04-04T12:00:00Z"
}
```

**Status Codes**:
- 201: Subscription created
- 400: Invalid request body
- 401: Invalid or missing API key
- 403: Insufficient permissions
- 409: Duplicate subscription

**Example**:
```bash
curl -X POST "https://your-worker.workers.dev/webhooks/subscribe" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "partner_id": "partner-123",
    "url": "https://your-server.com/webhooks",
    "events": ["referral.created"]
  }'
```

---

### POST /webhooks/unsubscribe

Unsubscribe from deal event notifications.

**Authentication**: API key required (`X-API-Key` header)

**Request Body**:
```json
{
  "subscription_id": "sub_abc123"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Subscription unsubscribed successfully"
}
```

**Status Codes**:
- 200: Subscription unsubscribed
- 400: Missing subscription ID
- 401: Invalid or missing API key
- 404: Subscription not found

**Example**:
```bash
curl -X POST "https://your-worker.workers.dev/webhooks/unsubscribe" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"subscription_id": "sub_abc123"}'
```

---

### GET /webhooks/subscriptions

List all subscriptions for a partner.

**Authentication**: API key required (`X-API-Key` header)

**Query Parameters**:
- `partner_id` (string, required): Partner ID to filter by
- `active` (boolean, optional): Filter by active status

**Response (200)**:
```json
{
  "subscriptions": [
    {
      "id": "sub_abc123",
      "partner_id": "partner-123",
      "url": "https://your-server.com/webhooks",
      "events": ["referral.created"],
      "active": true,
      "created_at": "2026-04-04T12:00:00Z"
    }
  ],
  "total": 1
}
```

**Status Codes**:
- 200: Subscriptions retrieved
- 401: Invalid or missing API key
- 403: Insufficient permissions

**Example**:
```bash
curl "https://your-worker.workers.dev/webhooks/subscriptions?partner_id=partner-123" \
  -H "X-API-Key: your-api-key"
```

---

### POST /webhooks/partners

Create a new webhook partner (admin only).

**Authentication**: Admin API key required (`X-API-Key` header)

**Request Body**:
```json
{
  "name": "Partner Name",
  "allowed_events": ["referral.created", "referral.updated"],
  "rate_limit_per_minute": 60
}
```

**Response (201)**:
```json
{
  "id": "partner-abc123",
  "name": "Partner Name",
  "secret": "whsec_...",
  "active": true,
  "allowed_events": ["referral.created", "referral.updated"],
  "rate_limit_per_minute": 60,
  "created_at": "2026-04-04T12:00:00Z"
}
```

**Status Codes**:
- 201: Partner created
- 400: Invalid request body
- 401: Invalid or missing API key
- 403: Not admin level

**Example**:
```bash
curl -X POST "https://your-worker.workers.dev/webhooks/partners" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "name": "Partner Name",
    "allowed_events": ["referral.created"]
  }'
```

---

### GET /webhooks/partners/:partnerId

Get partner details (admin only).

**Authentication**: Admin API key required (`X-API-Key` header)

**Response (200)**:
```json
{
  "id": "partner-abc123",
  "name": "Partner Name",
  "active": true,
  "allowed_events": ["referral.created"],
  "rate_limit_per_minute": 60,
  "created_at": "2026-04-04T12:00:00Z"
}
```

**Status Codes**:
- 200: Partner retrieved
- 401: Invalid or missing API key
- 403: Not admin level
- 404: Partner not found

**Example**:
```bash
curl "https://your-worker.workers.dev/webhooks/partners/partner-abc123" \
  -H "X-API-Key: your-admin-api-key"
```

---

### GET /webhooks/dlq

Get dead letter queue events (failed webhook deliveries).

**Authentication**: API key required (`X-API-Key` header)

**Query Parameters**:
- `limit` (number, optional): Max events to return (default: 50)
- `offset` (number, optional): Offset for pagination

**Response (200)**:
```json
{
  "events": [
    {
      "event_id": "evt_123",
      "subscription_id": "sub_abc123",
      "status": "failed",
      "attempts": 5,
      "last_error": "Connection timeout",
      "enqueued_at": "2026-04-04T12:00:00Z",
      "retryable": true
    }
  ],
  "total": 1
}
```

**Status Codes**:
- 200: Dead letter queue retrieved
- 401: Invalid or missing API key

**Example**:
```bash
curl "https://your-worker.workers.dev/webhooks/dlq?limit=20" \
  -H "X-API-Key: your-api-key"
```

---

### POST /webhooks/dlq/:eventId/:subscriptionId

Retry a dead letter queue event.

**Authentication**: API key required (`X-API-Key` header)

**Response (200)**:
```json
{
  "success": true,
  "message": "Event requeued for delivery"
}
```

**Status Codes**:
- 200: Event requeued
- 401: Invalid or missing API key
- 404: Event not found

**Example**:
```bash
curl -X POST "https://your-worker.workers.dev/webhooks/dlq/evt_123/sub_abc123" \
  -H "X-API-Key: your-api-key"
```

---

### POST /webhooks/sync

Create bidirectional sync configuration for a partner.

**Authentication**: API key required (`X-API-Key` header)

**Request Body**:
```json
{
  "partner_id": "partner-123",
  "direction": "bidirectional",
  "mode": "realtime",
  "conflict_resolution": "timestamp",
  "priority": "local",
  "filters": {
    "domains": ["example.com"],
    "status": ["active"]
  },
  "field_mapping": {
    "external_code": "code",
    "external_url": "url"
  }
}
```

**Response (201)**:
```json
{
  "partner_id": "partner-123",
  "direction": "bidirectional",
  "mode": "realtime",
  "conflict_resolution": "timestamp",
  "priority": "local",
  "created_at": "2026-04-04T12:00:00Z"
}
```

**Status Codes**:
- 201: Sync config created
- 400: Invalid request body
- 401: Invalid or missing API key
- 409: Sync config already exists

**Example**:
```bash
curl -X POST "https://your-worker.workers.dev/webhooks/sync" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "partner_id": "partner-123",
    "direction": "bidirectional",
    "mode": "realtime"
  }'
```

---

### GET /webhooks/sync/:partnerId

Get sync state for a partner.

**Authentication**: API key required (`X-API-Key` header)

**Response (200)**:
```json
{
  "partner_id": "partner-123",
  "last_sync_at": "2026-04-04T12:00:00Z",
  "cursor": "cursor_abc123",
  "sync_version": 1,
  "pending_changes": 0,
  "status": "idle"
}
```

**Status Codes**:
- 200: Sync state retrieved
- 401: Invalid or missing API key
- 404: Sync config not found

**Example**:
```bash
curl "https://your-worker.workers.dev/webhooks/sync/partner-123" \
  -H "X-API-Key: your-api-key"
```

---

## Multi-Agent Workflow API

⚠️ **Coming Soon** - The workflow API is planned for a future release.

The multi-agent workflow system will provide:
- 4-phase coordinated execution (Verification → Testing → Git → Fixes)
- Event-driven orchestration with quality gates
- Automatic retry logic and graceful degradation

For current pipeline operations, use `/api/discover` and `/api/status` endpoints.

---
