# Web UI & REST API Design for Referral Code Management

**Document Version: 0.1.1  
**Date**: 2026-04-01  
**Status**: Design Phase  
**Author**: System Architecture Team

---

## 1. Executive Summary

This document outlines a comprehensive Web UI and REST API design for managing referral codes/links in the `do-deal-relay` system. The design builds upon existing patterns in `worker/index.ts` and extends the current API surface to provide full CRUD operations, bulk management, and web research capabilities.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Architecture | RESTful | Consistent with existing endpoints, simple, well-understood |
| Authentication | JWT + API Keys | Supports both browser sessions and programmatic access |
| UI Framework | React + Vite | Modern, fast, familiar to most developers |
| Real-time Updates | Server-Sent Events | Simpler than WebSockets, fits Cloudflare Workers well |
| Data Storage | Existing KV Namespaces | Leverages `DEALS_PROD`, `DEALS_STAGING`, `DEALS_SOURCES` |

---

## 2. API Endpoint Specification

### 2.1 Base URLs

```
Production API:  https://api.deals-relay.workers.dev/v1
Admin UI:        https://admin.deals-relay.workers.dev
Public UI:       https://deals-relay.workers.dev
```

### 2.2 Authentication Endpoints

#### POST `/v1/auth/login`
Authenticate user and receive JWT token.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "secure-password",
  "totp_code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "usr_123456",
    "email": "admin@example.com",
    "role": "admin",
    "permissions": ["read:deals", "write:deals", "delete:deals", "trigger:research"]
  }
}
```

#### POST `/v1/auth/refresh`
Refresh access token using refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

#### POST `/v1/auth/api-keys`
Generate new API key for programmatic access.

**Request:**
```json
{
  "name": "Production Integration",
  "permissions": ["read:deals", "write:deals"],
  "expires_days": 90
}
```

**Response:**
```json
{
  "success": true,
  "api_key": "dlr_live_xxxxxxxxxxxxxxxx",
  "name": "Production Integration",
  "created_at": "2026-04-01T12:00:00Z",
  "expires_at": "2026-07-01T12:00:00Z",
  "permissions": ["read:deals", "write:deals"]
}
```

---

### 2.3 Referral Code Management Endpoints

#### GET `/v1/referrals`
List all referral codes with filtering and pagination.

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `domain` | string | Filter by domain | - |
| `status` | enum | `active`, `inactive`, `expired`, `quarantined`, `all` | `all` |
| `category` | string | Filter by category | - |
| `source` | enum | `manual`, `web_research`, `api`, `discovered`, `all` | `all` |
| `search` | string | Search in code, title, description | - |
| `sort_by` | enum | `created_at`, `updated_at`, `domain`, `status`, `confidence` | `created_at` |
| `sort_order` | enum | `asc`, `desc` | `desc` |
| `limit` | number | Items per page (1-100) | 20 |
| `offset` | number | Pagination offset | 0 |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ref_trading212_GcCOCxbo",
        "code": "GcCOCxbo",
        "url": "https://trading212.com/invite/GcCOCxbo",
        "domain": "trading212.com",
        "source": "manual",
        "status": "active",
        "submitted_at": "2026-03-31T10:00:00Z",
        "submitted_by": "usr_123456",
        "expires_at": null,
        "metadata": {
          "title": "Trading212 Free Share",
          "description": "Get a free share worth up to £100",
          "reward_type": "item",
          "reward_value": "Free share worth up to £100",
          "category": ["trading", "finance"],
          "tags": ["free-share", "uk"],
          "confidence_score": 0.85,
          "notes": "Verified working on 2026-03-30"
        },
        "validation": {
          "last_validated": "2026-03-31T08:00:00Z",
          "is_valid": true,
          "checked_urls": ["https://trading212.com/invite/GcCOCxbo"]
        },
        "stats": {
          "clicks": 1250,
          "conversions": 89,
          "last_clicked": "2026-04-01T09:30:00Z"
        }
      }
    ],
    "pagination": {
      "total": 156,
      "limit": 20,
      "offset": 0,
      "has_more": true
    },
    "filters_applied": {
      "status": "active",
      "domain": "trading212.com"
    }
  }
}
```

#### GET `/v1/referrals/:id`
Get single referral code details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ref_trading212_GcCOCxbo",
    "code": "GcCOCxbo",
    "url": "https://trading212.com/invite/GcCOCxbo",
    "domain": "trading212.com",
    "source": "manual",
    "status": "active",
    "submitted_at": "2026-03-31T10:00:00Z",
    "submitted_by": "usr_123456",
    "expires_at": null,
    "metadata": {
      "title": "Trading212 Free Share",
      "description": "Get a free share worth up to £100 when you sign up",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "currency": "GBP",
      "category": ["trading", "finance", "investment"],
      "tags": ["free-share", "uk", "stocks"],
      "requirements": ["New users only", "Minimum deposit £1"],
      "confidence_score": 0.85,
      "notes": "Verified working on 2026-03-30"
    },
    "validation": {
      "last_validated": "2026-03-31T08:00:00Z",
      "is_valid": true,
      "validation_errors": [],
      "checked_urls": ["https://trading212.com/invite/GcCOCxbo"]
    },
    "related_codes": ["ref_trading212_OLD123"],
    "history": [
      {
        "action": "created",
        "timestamp": "2026-03-31T10:00:00Z",
        "user_id": "usr_123456",
        "details": "Initial submission"
      },
      {
        "action": "validated",
        "timestamp": "2026-03-31T08:00:00Z",
        "user_id": "system",
        "details": "Automated validation passed"
      }
    ],
    "stats": {
      "clicks": 1250,
      "conversions": 89,
      "last_clicked": "2026-04-01T09:30:00Z"
    }
  }
}
```

#### POST `/v1/referrals`
Create new referral code.

**Request:**
```json
{
  "code": "NEWCODE2026",
  "url": "https://example.com/invite/NEWCODE2026",
  "domain": "example.com",
  "metadata": {
    "title": "Example Service Discount",
    "description": "Get 20% off your first purchase",
    "reward_type": "percent",
    "reward_value": 20,
    "category": ["shopping", "discount"],
    "tags": ["new-user", "percentage"],
    "requirements": ["First purchase only"],
    "notes": "Found on company blog"
  },
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Referral code created successfully",
  "data": {
    "id": "ref_example_NEWCODE2026",
    "code": "NEWCODE2026",
    "url": "https://example.com/invite/NEWCODE2026",
    "status": "quarantined",
    "submitted_at": "2026-04-01T12:00:00Z",
    "submitted_by": "usr_123456",
    "metadata": {
      "confidence_score": 0.5
    }
  }
}
```

#### PUT `/v1/referrals/:id`
Update existing referral code.

**Request:**
```json
{
  "metadata": {
    "title": "Updated Title",
    "notes": "Additional verification completed"
  },
  "expires_at": "2026-06-30T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Referral code updated successfully",
  "data": {
    "id": "ref_example_NEWCODE2026",
    "updated_at": "2026-04-01T12:05:00Z"
  }
}
```

#### POST `/v1/referrals/:id/deactivate`
Deactivate a referral code.

**Request:**
```json
{
  "reason": "expired",
  "notes": "Code no longer works, confirmed by user reports",
  "replaced_by": "ref_example_NEWCODE2027"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Referral code deactivated",
  "data": {
    "id": "ref_example_NEWCODE2026",
    "status": "inactive",
    "deactivated_at": "2026-04-01T12:10:00Z",
    "deactivated_reason": "expired",
    "replaced_by": "ref_example_NEWCODE2027"
  }
}
```

#### DELETE `/v1/referrals/:id`
Delete referral code (soft delete to staging quarantine).

**Response:**
```json
{
  "success": true,
  "message": "Referral code moved to quarantine",
  "data": {
    "id": "ref_example_NEWCODE2026",
    "status": "quarantined",
    "quarantined_at": "2026-04-01T12:15:00Z"
  }
}
```

---

### 2.4 Bulk Operations Endpoints

#### POST `/v1/referrals/bulk`
Execute bulk operation on multiple referral codes.

**Request:**
```json
{
  "operation": "deactivate",
  "ids": ["ref_1", "ref_2", "ref_3"],
  "reason": "expired",
  "notes": "Bulk deactivation - end of campaign"
}
```

**Operations supported:** `activate`, `deactivate`, `delete`, `validate`, `update_metadata`

**Response:**
```json
{
  "success": true,
  "message": "Bulk operation completed",
  "data": {
    "operation": "deactivate",
    "total_requested": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "id": "ref_1",
        "status": "success",
        "new_status": "inactive"
      },
      {
        "id": "ref_2",
        "status": "success",
        "new_status": "inactive"
      },
      {
        "id": "ref_3",
        "status": "success",
        "new_status": "inactive"
      }
    ]
  }
}
```

#### POST `/v1/referrals/import`
Import multiple referral codes from CSV/JSON.

**Request:**
```json
{
  "format": "json",
  "items": [
    {
      "code": "CODE1",
      "url": "https://example.com/invite/CODE1",
      "domain": "example.com",
      "metadata": {
        "title": "Offer 1",
        "reward_type": "cash",
        "reward_value": 50
      }
    },
    {
      "code": "CODE2",
      "url": "https://example.com/invite/CODE2",
      "domain": "example.com",
      "metadata": {
        "title": "Offer 2",
        "reward_type": "percent",
        "reward_value": 25
      }
    }
  ],
  "options": {
    "skip_duplicates": true,
    "validate_urls": true,
    "auto_activate": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Import completed",
  "data": {
    "total": 2,
    "imported": 2,
    "duplicates_skipped": 0,
    "failed": 0,
    "quarantined": 2,
    "items": [
      {
        "index": 0,
        "code": "CODE1",
        "status": "imported",
        "id": "ref_example_CODE1"
      },
      {
        "index": 1,
        "code": "CODE2",
        "status": "imported",
        "id": "ref_example_CODE2"
      }
    ]
  }
}
```

#### GET `/v1/referrals/export`
Export referral codes to various formats.

**Query Parameters:**
- `format`: `json`, `csv`, `jsonl`
- `status`: Filter by status
- `domain`: Filter by domain

**Response (JSON):**
```json
{
  "export_id": "exp_123456",
  "format": "json",
  "generated_at": "2026-04-01T12:00:00Z",
  "total_items": 156,
  "download_url": "/v1/exports/exp_123456/download",
  "expires_at": "2026-04-08T12:00:00Z"
}
```

---

### 2.5 Web Research Endpoints

#### POST `/v1/research`
Trigger web research for referral codes.

**Request:**
```json
{
  "query": "trading212 referral code 2026",
  "domain": "trading212.com",
  "depth": "thorough",
  "sources": ["producthunt", "hackernews", "reddit", "company_site"],
  "max_results": 20,
  "auto_import": false,
  "confidence_threshold": 0.7
}
```

**Depth options:**
- `quick`: 1-2 sources, basic search (1-2 minutes)
- `thorough`: Multiple sources, cross-validation (5-10 minutes)
- `deep`: Comprehensive search with manual verification queue (15-30 minutes)

**Response:**
```json
{
  "success": true,
  "message": "Research job queued",
  "data": {
    "job_id": "research_abc123",
    "status": "queued",
    "estimated_duration_seconds": 300,
    "query": "trading212 referral code 2026",
    "webhook_url": null
  }
}
```

#### GET `/v1/research/:job_id`
Get research job status and results.

**Response (In Progress):**
```json
{
  "success": true,
  "data": {
    "job_id": "research_abc123",
    "status": "in_progress",
    "progress": {
      "phase": "searching",
      "sources_checked": 2,
      "total_sources": 5,
      "codes_found": 3
    },
    "started_at": "2026-04-01T12:00:00Z",
    "estimated_completion": "2026-04-01T12:05:00Z"
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "data": {
    "job_id": "research_abc123",
    "status": "completed",
    "query": "trading212 referral code 2026",
    "started_at": "2026-04-01T12:00:00Z",
    "completed_at": "2026-04-01T12:04:30Z",
    "duration_seconds": 270,
    "results": {
      "codes_found": 5,
      "codes_imported": 3,
      "codes_quarantined": 2,
      "discovered_codes": [
        {
          "code": "GcCOCxbo",
          "url": "https://trading212.com/invite/GcCOCxbo",
          "source": "company_site",
          "discovered_at": "2026-04-01T12:02:00Z",
          "reward_summary": "Free share worth up to £100",
          "confidence": 0.92,
          "status": "imported",
          "referral_id": "ref_trading212_GcCOCxbo"
        }
      ]
    },
    "research_metadata": {
      "sources_checked": ["producthunt", "hackernews", "reddit", "company_site"],
      "search_queries": [
        "trading212 referral code 2026",
        "trading212 invite code free share"
      ],
      "agent_id": "research-agent-001"
    }
  }
}
```

#### GET `/v1/research/jobs`
List recent research jobs.

**Query Parameters:**
- `status`: `queued`, `in_progress`, `completed`, `failed`, `all`
- `limit`: 1-100
- `offset`: Pagination offset

---

### 2.6 Real-time Updates Endpoints

#### GET `/v1/stream/updates`
Server-Sent Events (SSE) endpoint for real-time updates.

**Event Types:**

```
event: referral_created
data: {"id": "ref_123", "code": "NEWCODE", "timestamp": "2026-04-01T12:00:00Z"}

event: referral_updated
data: {"id": "ref_123", "changes": ["status"], "timestamp": "2026-04-01T12:01:00Z"}

event: referral_deactivated
data: {"id": "ref_123", "reason": "expired", "timestamp": "2026-04-01T12:02:00Z"}

event: research_completed
data: {"job_id": "research_abc123", "codes_found": 5, "timestamp": "2026-04-01T12:05:00Z"}

event: system_notification
data: {"type": "validation_failed", "message": "3 codes failed validation", "timestamp": "2026-04-01T12:10:00Z"}
```

---

### 2.7 Admin Dashboard Endpoints

#### GET `/v1/admin/stats`
Dashboard statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "total_codes": 156,
      "active_codes": 142,
      "inactive_codes": 8,
      "quarantined_codes": 6,
      "expired_codes": 5
    },
    "by_domain": [
      { "domain": "trading212.com", "count": 15, "active": 14 },
      { "domain": "example.com", "count": 23, "active": 21 }
    ],
    "by_category": [
      { "category": "trading", "count": 25 },
      { "category": "finance", "count": 18 }
    ],
    "by_source": [
      { "source": "manual", "count": 89 },
      { "source": "web_research", "count": 45 },
      { "source": "api", "count": 22 }
    ],
    "recent_activity": {
      "last_24h": {
        "created": 5,
        "deactivated": 2,
        "validated": 45
      }
    },
    "research_stats": {
      "jobs_last_7d": 12,
      "codes_discovered": 28,
      "avg_confidence": 0.78
    }
  }
}
```

#### GET `/v1/admin/activity`
Recent admin activity log.

**Response:**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "act_123",
        "user_id": "usr_456",
        "user_email": "admin@example.com",
        "action": "referral_created",
        "target_id": "ref_example_CODE1",
        "details": {
          "code": "CODE1",
          "domain": "example.com"
        },
        "ip_address": "192.168.1.1",
        "timestamp": "2026-04-01T12:00:00Z"
      }
    ],
    "pagination": {
      "total": 500,
      "limit": 20,
      "offset": 0
    }
  }
}
```

---

## 3. UI Wireframe Descriptions

### 3.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]    Dashboard  Codes  Research  Analytics      [User]│
├────────┬────────────────────────────────────────────────────┤
│        │                                                    │
│ Filter │      [Search] [Add New] [Import] [Export]         │
│        │                                                    │
├────────┤  ┌──────────────────────────────────────────────┐  │
│ Domain │  │ Code     │ Domain    │ Status  │ Actions    │  │
│ ─────  │  ├──────────┼───────────┼─────────┼────────────┤  │
│ □ All  │  │ CODE123  │ example   │ Active  │ [Edit][✕]  │  │
│ □ T212 │  │ CODE456  │ trading212│ Active  │ [Edit][✕]  │  │
│ □ Exch │  │ OLD789   │ example   │ Inactive│ [Edit][✕]  │  │
│        │  └──────────────────────────────────────────────┘  │
│ Status │                                                    │
│ ─────  │  [1] [2] [3] ... [10]    Showing 1-20 of 156      │
│ ○ All  │                                                    │
│ ● Active│                                                   │
│ ○ Inact│                                                    │
│        │                                                    │
└────────┴────────────────────────────────────────────────────┘
```

### 3.2 Page Specifications

#### 3.2.1 Dashboard Page

**Components:**
- **Stat Cards (4 columns)**:
  - Total Active Codes (with trend indicator)
  - Codes Added Today
  - Research Jobs (Last 7 Days)
  - Quarantine Alerts

- **Quick Actions Bar**:
  - "Add Referral Code" button
  - "Run Web Research" button
  - "View Reports" link

- **Recent Activity Feed**:
  - Scrollable list of recent changes
  - Color-coded by action type

- **Domain Distribution Chart**:
  - Pie/donut chart showing codes by domain
  - Click to filter main list

#### 3.2.2 Referral Codes List Page

**Components:**
- **Filter Sidebar** (collapsible on mobile):
  - Domain checkboxes with counts
  - Status radio buttons
  - Category tags
  - Source type checkboxes
  - Date range picker

- **Search Bar**:
  - Full-text search across code, title, description
  - Autocomplete suggestions
  - Recent searches

- **Data Table**:
  - Sortable columns
  - Row actions (Edit, Deactivate, Delete)
  - Bulk select checkbox column
  - Status badges with color coding

- **Pagination**:
  - Page numbers
  - Items per page selector
  - Jump to page input

#### 3.2.3 Add/Edit Code Page

**Components:**
- **Form Sections**:
  - Basic Info (code, URL, domain - auto-extracted)
  - Reward Details (type, value, currency)
  - Metadata (title, description, category tags)
  - Expiration (date picker, optional)
  - Notes (textarea)

- **Live Preview**:
  - Card preview of how deal will appear
  - Mobile/desktop toggle

- **Validation Panel**:
  - Real-time URL validation
  - Code uniqueness check
  - Required fields indicator

#### 3.2.4 Research Page

**Components:**
- **Query Builder**:
  - Search input with suggestions
  - Domain selector
  - Depth slider (quick/thorough/deep)
  - Source toggles
  - Confidence threshold slider

- **Active Jobs Panel**:
  - Progress bars for running jobs
  - Cancel button
  - Estimated completion time

- **Results History**:
  - Past research jobs
  - Collapsible result summaries
  - Import buttons for discovered codes

#### 3.2.5 Analytics Page

**Components:**
- **Time Range Selector**: 24h, 7d, 30d, 90d, Custom
- **Charts**:
  - Codes added over time (line chart)
  - Top performing domains (bar chart)
  - Status breakdown (pie chart)
  - Research effectiveness (funnel chart)

- **Data Tables**:
  - Top performing codes by clicks
  - Domain performance comparison
  - Research source effectiveness

---

## 4. Authentication Flow

### 4.1 JWT Authentication

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant API
    participant KV

    User->>UI: Enter credentials
    UI->>API: POST /v1/auth/login
    API->>KV: Validate credentials
    KV-->>API: User data + permissions
    API->>API: Generate JWT + Refresh token
    API-->>UI: {access_token, refresh_token, user}
    UI->>UI: Store tokens (httpOnly cookie + localStorage backup)
    UI-->>User: Redirect to dashboard

    Note over UI,API: Subsequent requests
    UI->>API: GET /v1/referrals (Authorization: Bearer <token>)
    API->>API: Verify JWT signature
    API->>API: Check permissions
    API->>KV: Fetch data
    KV-->>API: Results
    API-->>UI: Response
```

### 4.2 API Key Authentication

For programmatic access:

```http
GET /v1/referrals HTTP/1.1
Host: api.deals-relay.workers.dev
Authorization: Bearer dlr_live_xxxxxxxxxxxxxxxx
X-API-Version: 2026-04-01
```

**API Key Format:**
- `dlr_live_*` - Production keys
- `dlr_test_*` - Test/Sandbox keys
- `dlr_dev_*` - Development keys

### 4.3 Permission Model

| Role | Permissions |
|------|-------------|
| `viewer` | `read:deals`, `read:stats` |
| `editor` | `read:deals`, `write:deals`, `read:stats`, `trigger:research` |
| `admin` | All permissions + `delete:deals`, `manage:users`, `manage:api_keys` |

---

## 5. Database/KV Storage Patterns

### 5.1 Existing KV Namespaces

The design leverages existing Cloudflare KV namespaces:

```
DEALS_PROD      → Production snapshot + referral metadata
DEALS_STAGING   → Staging/quarantined referrals
DEALS_LOG       → Admin activity logs + research job history
DEALS_LOCK      → Rate limiting counters + session tokens
DEALS_SOURCES   → Source registry + API keys
```

### 5.2 Key Naming Conventions

```
# Referral data
ref:{domain}:{code}           → Individual referral record
ref:idx:domain:{domain}       → Domain index (list of IDs)
ref:idx:status:{status}       → Status index
ref:idx:user:{user_id}        → User's submissions

# Metadata
meta:total_count              → Cached total count
meta:stats:daily:{date}       → Daily statistics

# Sessions & Auth
session:{token}               → JWT session data
apikey:{hash}                 → API key metadata

# Research
research:{job_id}             → Research job data
research:idx:user:{user_id}   → User's research jobs
research:queue                → Pending research jobs
```

### 5.3 Data Model

```typescript
// Referral Input (stored in KV)
interface ReferralInput {
  id: string;                    // ref_{domain}_{code}
  code: string;                  // The actual referral code
  url: string;                   // Full URL with code
  domain: string;                // Extracted domain
  source: "manual" | "web_research" | "api" | "discovered";
  status: "active" | "inactive" | "expired" | "quarantined";
  submitted_at: string;          // ISO timestamp
  submitted_by?: string;         // User ID
  updated_at?: string;           // Last modification
  expires_at?: string;           // Optional expiration
  deactivated_at?: string;     // When deactivated
  deactivated_reason?: "user_request" | "expired" | "invalid" | "violation" | "replaced";
  replaced_by?: string;          // New code that replaces this
  metadata: {
    title?: string;
    description?: string;
    reward_type: "cash" | "credit" | "percent" | "item" | "unknown";
    reward_value?: number | string;
    currency?: string;
    category: string[];
    tags: string[];
    requirements: string[];
    research_sources?: string[];
    confidence_score: number;
    notes?: string;
  };
  validation?: {
    last_validated?: string;
    is_valid?: boolean;
    validation_errors?: string[];
    checked_urls?: string[];
  };
  related_codes?: string[];
  history?: ActivityLogEntry[];
}

// API Key (stored in KV)
interface APIKey {
  id: string;
  key_hash: string;              // Hashed key (bcrypt)
  prefix: string;                // First 8 chars for identification
  name: string;
  user_id: string;
  permissions: string[];
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  request_count: number;
  revoked: boolean;
}

// Research Job (stored in KV)
interface ResearchJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  query: string;
  domain?: string;
  depth: "quick" | "thorough" | "deep";
  sources: string[];
  max_results: number;
  auto_import: boolean;
  confidence_threshold: number;
  created_by: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress?: {
    phase: string;
    sources_checked: number;
    total_sources: number;
    codes_found: number;
  };
  results?: ResearchResult;
  error?: string;
}
```

### 5.4 Caching Strategy

| Data Type | Cache TTL | Strategy |
|-----------|-----------|----------|
| Referral list | 60s | Stale-while-revalidate |
| Single referral | 300s | Cache + background refresh |
| Stats | 300s | Aggressive caching |
| Search results | 120s | Query-based cache key |
| User session | 3600s | Sliding window |

---

## 6. Sample Request/Response Examples

### 6.1 Complete Workflow: Adding a Referral Code

#### Step 1: Authenticate
```bash
curl -X POST https://api.deals-relay.workers.dev/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "secure-password"
  }'
```

Response:
```json
{
  "success": true,
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "user": {
    "id": "usr_123456",
    "role": "admin"
  }
}
```

#### Step 2: Create Referral Code
```bash
curl -X POST https://api.deals-relay.workers.dev/v1/referrals \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "code": "FREESHARE100",
    "url": "https://trading212.com/invite/FREESHARE100",
    "domain": "trading212.com",
    "metadata": {
      "title": "Trading212 Free Share Offer",
      "description": "Get a free share worth up to £100 when you join",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "currency": "GBP",
      "category": ["trading", "finance", "stocks"],
      "tags": ["uk", "free-share", "investment"],
      "requirements": ["New users only", "Verify identity"],
      "notes": "Found on official Twitter account"
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Referral code created successfully",
  "data": {
    "id": "ref_trading212_FREESHARE100",
    "code": "FREESHARE100",
    "status": "quarantined",
    "submitted_at": "2026-04-01T14:30:00Z",
    "submitted_by": "usr_123456",
    "url": "https://deals-relay.workers.de/v1/referrals/ref_trading212_FREESHARE100"
  }
}
```

#### Step 3: List All Active Codes
```bash
curl "https://api.deals-relay.workers.dev/v1/referrals?status=active&domain=trading212.com&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Response:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ref_trading212_FREESHARE100",
        "code": "FREESHARE100",
        "domain": "trading212.com",
        "status": "quarantined",
        "metadata": {
          "title": "Trading212 Free Share Offer",
          "confidence_score": 0.5
        }
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 10,
      "offset": 0,
      "has_more": false
    }
  }
}
```

### 6.2 Bulk Import Example

```bash
curl -X POST https://api.deals-relay.workers.dev/v1/referrals/import \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "items": [
      {
        "code": "BULK001",
        "url": "https://example.com/invite/BULK001",
        "domain": "example.com",
        "metadata": {
          "title": "Bulk Import Test 1",
          "reward_type": "percent",
          "reward_value": 20
        }
      },
      {
        "code": "BULK002",
        "url": "https://example.com/invite/BULK002",
        "domain": "example.com",
        "metadata": {
          "title": "Bulk Import Test 2",
          "reward_type": "cash",
          "reward_value": 50
        }
      }
    ],
    "options": {
      "skip_duplicates": true,
      "validate_urls": true,
      "auto_activate": false
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Import completed",
  "data": {
    "total": 2,
    "imported": 2,
    "duplicates_skipped": 0,
    "failed": 0,
    "items": [
      {
        "index": 0,
        "code": "BULK001",
        "status": "imported",
        "id": "ref_example_BULK001"
      },
      {
        "index": 1,
        "code": "BULK002",
        "status": "imported",
        "id": "ref_example_BULK002"
      }
    ]
  }
}
```

### 6.3 Web Research Example

```bash
curl -X POST https://api.deals-relay.workers.dev/v1/research \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "query": "robinhood referral bonus 2026",
    "domain": "robinhood.com",
    "depth": "thorough",
    "sources": ["producthunt", "hackernews", "reddit", "company_site"],
    "max_results": 10,
    "auto_import": false,
    "confidence_threshold": 0.7
  }'
```

Response:
```json
{
  "success": true,
  "message": "Research job queued",
  "data": {
    "job_id": "research_xyz789",
    "status": "queued",
    "estimated_duration_seconds": 300,
    "query": "robinhood referral bonus 2026"
  }
}
```

Check status:
```bash
curl "https://api.deals-relay.workers.dev/v1/research/research_xyz789" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

---

## 7. Rate Limiting and Security

### 7.1 Rate Limits

| Endpoint Category | Limit | Window | Notes |
|-------------------|-------|--------|-------|
| Authentication | 5 | 1 minute | Login attempts |
| API Key Auth | 1000 | 1 minute | Per API key |
| JWT Auth | 100 | 1 minute | Per user |
| Public Endpoints | 60 | 1 minute | Per IP |
| Bulk Operations | 10 | 1 minute | Per user |
| Research Trigger | 5 | 1 hour | Per user |

### 7.2 Security Measures

**Input Validation:**
- All inputs validated with Zod schemas (consistent with existing code)
- URL validation to prevent SSRF
- Strict CORS policies (configurable per environment)
- Content Security Policy headers

**Authentication:**
- JWT tokens with RS256 signing (asymmetric)
- Token expiration: 1 hour (access), 30 days (refresh)
- API keys with prefix for identification
- Secure password hashing (Argon2id)

**Data Protection:**
- HTTPS-only (HSTS enabled)
- Sensitive data encrypted at rest in KV
- Audit logging for all mutations
- IP-based rate limiting with CAPTCHA escalation

**Webhook Security:**
- HMAC-SHA256 signature verification
- Timestamp validation (5-minute window)
- IP allowlisting option

---

## 8. Web UI Framework Choice

### 8.1 Recommendation: React + Vite

**Why React:**
- ✅ Large ecosystem, excellent documentation
- ✅ Component-based architecture fits dashboard needs
- ✅ Strong TypeScript support
- ✅ Easy to find developers
- ✅ Works well with Cloudflare Pages

**Why Vite:**
- ✅ Fast development server
- ✅ Optimized production builds
- ✅ Native ESM support
- ✅ Simple configuration

### 8.2 Project Structure

```
ui/
├── public/
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Table.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   └── referral/
│   │       ├── ReferralForm.tsx
│   │       ├── ReferralTable.tsx
│   │       ├── ReferralCard.tsx
│   │       └── ReferralFilters.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ReferralList.tsx
│   │   ├── ReferralDetail.tsx
│   │   ├── Research.tsx
│   │   ├── Analytics.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useReferrals.ts
│   │   ├── useResearch.ts
│   │   └── useSSE.ts
│   ├── services/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── referrals.ts
│   │   └── research.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── referralStore.ts
│   │   └── uiStore.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── formatters.ts
│   │   └── validators.ts
│   ├── styles/
│   │   └── globals.css
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

### 8.3 Key Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "axios": "^1.6.0",
    "date-fns": "^2.30.0",
    "recharts": "^2.10.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

### 8.4 Mobile Responsiveness Strategy

**Breakpoints:**
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Mobile-First Approach:**
- Collapsible sidebar (hamburger menu)
- Stacked filter panels
- Full-width cards instead of tables
- Touch-friendly button sizes (min 44px)
- Simplified charts (hide detailed tooltips)

---

## 9. Pros and Cons

### 9.1 Pros

| Aspect | Benefit |
|--------|---------|
| **Architecture** | Stateless design leverages Cloudflare's edge network for global low latency |
| **Scalability** | KV storage auto-scales, no database connection limits |
| **Cost** | Pay-per-request model, no idle server costs |
| **Security** | JWT + API keys provide flexible authentication options |
| **Real-time** | SSE is simpler than WebSockets, works through proxies/CDN |
| **Development** | React + Vite is fast to develop and well-documented |
| **Consistency** | Follows existing API patterns in `worker/index.ts` |
| **Bulk Operations** | Async job pattern allows handling thousands of items |

### 9.2 Cons

| Aspect | Challenge | Mitigation |
|--------|-----------|------------|
| **KV Limitations** | Eventual consistency, no complex queries | Use indexes, caching, and in-memory filtering |
| **No JOINs** | Can't query across related data | Denormalize data, embed related info |
| **Rate Limits** | Workers have sub-request limits | Implement client-side queuing, batch operations |
| **Cold Starts** | First request may have latency | Keep warm with cron triggers |
| **Data Size** | KV values limited to 25MB | Use chunking for large datasets |
| **UI Hosting** | Separate Pages project needed | Deploy UI to same custom domain via Pages |

### 9.3 Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|----------------|
| Vue.js | React has larger ecosystem, more hiring pool |
| Next.js | Overkill for admin dashboard, adds complexity |
| WebSockets | SSE is sufficient, works better with Workers |
| D1 Database | KV is sufficient, D1 adds complexity for this use case |
| Vanilla JS | TypeScript + React provides better DX and type safety |

---

## 10. Implementation Roadmap

### Phase 1: Core API (Week 1-2)
- [ ] Extend `worker/index.ts` with new endpoints
- [ ] Implement authentication middleware
- [ ] Create referral CRUD operations
- [ ] Add validation schemas

### Phase 2: Bulk & Research (Week 3)
- [ ] Implement bulk operations
- [ ] Create research job queue
- [ ] Add web research integration
- [ ] Implement SSE for real-time updates

### Phase 3: UI Framework (Week 4-5)
- [ ] Set up React + Vite project
- [ ] Create component library
- [ ] Implement auth flows
- [ ] Build referral management pages

### Phase 4: Polish (Week 6)
- [ ] Add analytics dashboard
- [ ] Implement mobile responsiveness
- [ ] Add error handling and loading states
- [ ] Write documentation

---

## 11. Conclusion

This design provides a comprehensive, scalable solution for managing referral codes via both API and Web UI. The architecture:

1. **Leverages existing infrastructure** (KV namespaces, Workers)
2. **Follows established patterns** (consistent with current `worker/index.ts`)
3. **Scales horizontally** (Cloudflare's edge network)
4. **Supports multiple use cases** (manual entry, bulk import, web research)
5. **Prioritizes security** (JWT, rate limiting, input validation)
6. **Delivers great UX** (real-time updates, mobile-friendly, fast)

The modular design allows iterative implementation, starting with core CRUD operations and progressively adding advanced features like web research and analytics.

---

**Next Steps:**
1. Review design with stakeholders
2. Prioritize Phase 1 features
3. Create detailed implementation tickets
4. Set up UI project scaffolding
