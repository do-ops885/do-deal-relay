# System Reference
**Version**: 0.2.1 (Schema: 0.1.8) | **Status**: Production

> **Harness role: Architecture fitness + maintainability sensors.** The validation gates and infrastructure contracts defined here are computational sensors that regulate both maintainability (the 9-gate pipeline) and architecture fitness (DORA metrics, continuous verification). See `agents-docs/HARNESS.md` for the full framework.

## Architecture: Two-Phase Publishing

The system utilizes a secure, transactional Two-Phase Publishing architecture to isolate untested inputs and ensure client-facing endpoints only serve verified, high-quality data.

```
 [ Scraped / Input Deals ]
           ↓
 1. STAGE: Write to DEALS_STAGING KV
           ↓
 2. VALIDATE: Execute the 9-Gate Pipeline (Parallel & Sequential)
           ↓
 3. PROMOTE / PUBLISH: Update DEALS_PROD KV + Push Snapshotted Commit to GitHub
           ↓ (On Integrity Failure)
 4. ROLLBACK: Revert DEALS_PROD KV to Previous Known-Good Snapshot
```

### 1. Stage Phase (Phase 1)
- Scrapers, research agents, or user submission tools push newly discovered deals into the `DEALS_STAGING` KV namespace.
- At this stage, the status of the deal is marked as `quarantined` or `pending`. These deals are isolated from public/production-facing read queries.

### 2. Publish Phase (Phase 2)
Upon successful validation through all 9 gates:
1. **Durable Object Lock Verification**: The pipeline ensures it maintains the `PIPELINE_LOCK` to block other processes.
2. **Atomic Merge**: The system fetches the active production snapshot (`snapshot:prod`) from the `DEALS_PROD` KV namespace.
3. **Validation Check**: It evaluates the candidate list using the 9-Gate validation logic. Only deals that pass all gates are promoted.
4. **KV Snapshot Update**: The verified deals are merged with existing active deals, and the updated list is written back to `DEALS_PROD` under the `snapshot:prod` key.
5. **Git Sync (GitHub Action Commit)**: The system triggers an asynchronous pipeline flow that commits the updated `deals.json` dataset to the repository branch, maintaining a perfect version-controlled Git history of all production releases.

### 3. Rollback & Fault Tolerance Conditions
A transaction rollback is automatically or manually triggered under the following failure modes:
- **`HASH_MISMATCH` Detection**: If the snapshot hash changes between the start of the validation run and final publication, the run is instantly aborted, and no writes are committed to `DEALS_PROD`.
- **Integrity/Corruption Verification Failures**: If any post-publish sanity tests fail, or if a newly merged snapshot is parsed as invalid JSON.
- **Rollback Execution**: To roll back, the active `snapshot:prod` key in `DEALS_PROD` is restored to its previous snapshot value (retrieved from the daily backup log or Git history). This instantly isolates any faulty deployment without needing server restarts or manual deployments.

## Middleware Pipeline (ADR-016)
All API routes go through a centralized middleware pipeline in `worker/lib/middleware/pipeline.ts`:
- **Auth**: JWT/API key verification with role-based access (`user`, `admin`, `internal`)
- **Rate Limiting**: Config-driven per-route rate limits via `createRateLimitMiddleware`
- **Body Size**: Maximum request body validation via `checkBodySize`

Route registration follows the pattern: `withAuth → createRateLimitMiddleware → handler`.

## Validation Gates (Mandatory 9-Gate Pipeline)

To protect the integrity and consistency of the production deals, the system enforces a strict 9-Gate validation pipeline before any deal is published.

### Validation Pipeline Execution Flow & Sequence

1. **Fast-Path Cache Filter Check**:
   - If `ENABLE_VALIDATION_CACHE` is true, the deal is checked against the fast-path validation cache in `DEALS_STAGING` (`validateDealFastPath`).
   - If there is a cache hit containing an accepted or rejected decision, the pipeline skips execution of all 9 gates entirely.
2. **Phase 1: Parallel Cheap Synchronous Gates**:
   - High-throughput, purely computational gates without async side-effects are run concurrently using `Promise.all`:
     - `schema_validation`
     - `normalization_verification`
     - `source_trust`
     - `reward_plausibility`
     - `expiry_validation`
3. **Phase 2: Sequential Stateful Async Gates**:
   - If Phase 1 passes, the heavier, stateful gates containing asynchronous KV/D1 lookups are run sequentially (cheapest-first) to respect platform resources and dependencies:
     - `deduplication_check`
     - `idempotency_check`
     - `second_pass_validation`
     - `snapshot_hash_verification`

### Gate-by-Gate Specification

| Gate Name | Execution Phase | Pass Condition | Fail Condition & Error String / Error Type |
| :--- | :--- | :--- | :--- |
| **`schema_validation`** | Phase 1 (Parallel Sync) | Object structure strictly conforms to the `DealSchema` interface (contains code, url, domain, reward etc). | `SchemaError`: Missing required fields or field type mismatch (e.g., reward.type is not an allowed enum). |
| **`normalization_verification`** | Phase 1 (Parallel Sync) | Domain is lowercase; Code is uppercase; URL has no UTM parameters or trailing question marks/slashes. | `NormalizationError`: Case or URL params detected. URL contains unresolved query params or casing mismatches. |
| **`source_trust`** | Phase 1 (Parallel Sync) | Source trust score is greater than or equal to the trust threshold defined for the environment (`source.trust_score >= TRUST_THRESHOLD`, default `0.3` in prod). | `TrustError`: Source trust score `{score}` is below the environment trust threshold `{threshold}`. |
| **`reward_plausibility`** | Phase 1 (Parallel Sync) | Reward values are rational and fall within boundaries (`value > 0`, Cash `< $10,000`, Percent `<= 100%`). | `PlausibilityError`: Impossible or suspicious rewards (e.g., cash rewards over $10k or negative percent). |
| **`expiry_validation`** | Phase 1 (Parallel Sync) | `expiry.date` is either null (no expiry) or a valid ISO-8601 string set in the future. | `ExpiryError`: Expiration date is in the past. |
| **`deduplication_check`** | Phase 2 (Sequential Async) | The candidate deal code and domain combination does not duplicate any other deal within the current processing batch. | `DuplicateError`: Identical deal code and domain combination already exists in the candidate batch. |
| **`idempotency_check`** | Phase 2 (Sequential Async) | Deal ID is not found in the current live `DEALS_PROD` snapshot. | `IdempotencyError`: Deal with ID `{id}` has already been published. |
| **`second_pass_validation`** | Phase 2 (Sequential Async) | Schema is re-parsed and verified post-normalization to ensure normalization rules did not break structural constraints. | `ValidationError`: Normalization broke schema integrity. |
| **`snapshot_hash_verification`** | Phase 2 (Sequential Async) | Calculated data integrity hash matches the current pipeline context hash to ensure no in-flight manipulation. | `IntegrityError`: Data tampered/corrupted in pipeline (hash mismatch). |

### 10th Gate: Continuous Verification

Post-publication health monitoring is executed via `worker/validation/gates/continuous-verification.ts`.

- **Trigger**: Runs automatically via weekly cron trigger (`0 0 * * SUN`) at midnight on Sundays.
- **Function**: Performs full-sweep health check of all active deals in the production snapshot.
- **Pass Semantics**: Deal stays active if landing page is up and the deal remains valid.
- **Fail Semantics**: Deactivates or flags deals with dead links, expired/retracted programs, or repeated negative community feedback.

## Infrastructure
### KV Namespaces

The KV namespaces are configured differently depending on the deployment environment (Staging vs. Production) as defined in `wrangler.jsonc`.

| Binding Name | Role / Purpose | Production ID | Staging ID | Access Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `DEALS_PROD` | Stores production deal snapshots and stable verified lists. | `23ee9b8c9e2748e5880f476b8b57a524` | `b0db85b92fae45c1895152737ab72649` | **Public Read**: Always open to public routes.<br>**Write**: Highly guarded; written only during finalization. |
| `DEALS_STAGING` | Stores unverified candidate deals and in-flight staging snapshots. | `b0db85b92fae45c1895152737ab72649` | `b0db85b92fae45c1895152737ab72649` | **Internal Read/Write**: Fast-path cache lookup and initial submission storage. |
| `DEALS_LOG` | Stores run logs, operational history, and metrics exports. | `1f1a901fd6fb4dffbdcc86aa4a914ba8` | `1f1a901fd6fb4dffbdcc86aa4a914ba8-staging` | **Write**: Automated log writing by executors.<br>**Read**: Admin-restricted routes. |
| `DEALS_LOCK` | Legacy concurrency mutex (now largely replaced by PipelineLock DO). | `e3ab520eafd5430ab72978e78bdd257e` | `e3ab520eafd5430ab72978e78bdd257e` | **Read/Write**: Acquired during `init` and released during final cleanup. |
| `DEALS_SOURCES` | Holds the registered web scrapers, trust scores, and source profiles. | `be3c0fc148b749b49a59aa7cfa23e3ac` | `be3c0fc148b749b49a59aa7cfa23e3ac` | **Read**: Scraper domain-trust evaluations.<br>**Write**: Admin-only manual updates. |

### D1 Database

| Binding | Database Name | ID | Role |
| :--- | :--- | :--- | :--- |
| `DEALS_DB` | `deals-db` | `29ee4ca4-8147-4059-9898-b13c1e9599ff` | Advanced queries, full-text search |

### Durable Objects

| Binding | Class | Role |
| :--- | :--- | :--- |
| `PIPELINE_LOCK` | `PipelineLock` | Atomic concurrency control via SQLite (replaces KV lock race condition) |

### Vectorize

| Binding | Index | Role |
| :--- | :--- | :--- |
| `DEAL_EMBEDDINGS` | `deal-embeddings` | Semantic search over deals and referrals |

### Scheduled Triggers

The worker is scheduled to run periodic background operations under four configured cron schedules (defined in `wrangler.jsonc` and handled in `worker/scheduled.ts`):

- **`0 */6 * * *` (Every 6 Hours)**:
  - Runs the autonomous **Discovery Pipeline**.
  - Fetches candidates from default sources, runs them through parsers, normalizes them, and feeds them into the 9-Gate validation sequence.
- **`*/30 * * * *` (Every 30 Minutes)**:
  - Runs the **Reddit Moderation / Post Lifecycle** task.
  - Synchronizes and monitors bot-authored Reddit posts, removing posts that have expired, received negative community scores, or failed continuous verification checks.
- **`0 9 * * *` (Daily at 09:00 UTC)**:
  - Executes **Expirations & Experience Aggregation**.
  - Iterates through active deals to mark expired entries, and aggregates peer/user feedback scores into new deal confidence ratings.
- **`0 0 * * SUN` (Weekly on Sunday at 00:00 UTC)**:
  - Runs the **Weekly Validation Sweep + Continuous Verification**.
  - Thoroughly validates every deal in `DEALS_PROD` to prune invalid, dead, or corrupted URLs.

### Concurrency Controls & Mutual Exclusion

To prevent concurrent/race execution of the pipeline which could result in corrupted snapshots or out-of-order finalization, the system uses robust concurrency guards:

1. **Durable Object CAS Lock (`PIPELINE_LOCK`)**:
   - Atomic lock acquisition is managed via the `PipelineLock` Durable Object backed by its local SQLite storage.
   - Any pipeline run must first request and acquire a write lock. If a lock is held, the run is terminated with `LOCK_CONFLICT`.
   - The lock includes a safety Time-To-Live (TTL) of 300 seconds (5 minutes) to ensure locks are automatically freed in case of uncaught worker crashes.
2. **Snapshot Hash Verification (`snapshot_hash_verification` Gate)**:
   - When the pipeline initializes, a cryptographic SHA-256 hash of the current production snapshot is recorded in the pipeline context.
   - During the finalization phase, the gate recalculates the production snapshot's hash and compares it to the initial context hash.
   - If they do not match (indicating another process modified the snapshot in the meantime), the publish is aborted with `HASH_MISMATCH` to prevent overwriting intermediate changes.

### Idempotency Rules

Idempotency is strictly enforced across the system:

- **Run ID Registration**: Every pipeline run generates and requires a unique `run_id` (UUID format).
- **Snapshot Checks**: A deal cannot be added if its specific fingerprinted deal ID is already present in the active snapshot (`idempotency_check` Gate).
- **D1 Database Write Deduplication**: Batch insertions on database levels utilize `ON CONFLICT (id) DO NOTHING` or similar UPSERT parameters to avoid duplicate key exceptions.

### Observability
- **Cloudflare Traces**: Enabled via `wrangler.jsonc` observability config
- **OTLP Export**: Configurable destinations (Honeycomb, Grafana, Axiom, SigNoz)
- **DORA Metrics**: `/api/dora-metrics` endpoint for deployment/lead time/CFR/MTTR tracking

## MCP Toolset (Tool Signatures)

This section defines the precise, machine-reliable behavioral contracts and tool signatures for interacting with the referral system.

### 1. Deal-Related Tools (`deals.ts`)

These are the primary tools used by agents to query and submit deals. Note that within the codebase and system registries, these are canonically named `search_deals`, `get_deal`, and `add_referral`. Agents must call them by these names, but they may be referenced in system tasks and documentation by their equivalent aliases: `get_deals`, `get_deal_by_code`, and `submit_deal`.

#### A. `search_deals` (Alias: `get_deals`)
- **Description**: Search for referral deals by domain, category, status, or free-text keywords with ranking and filtering.
- **Inputs (JSON-Schema)**:
  ```json
  {
    "type": "object",
    "properties": {
      "domain": {
        "type": "string",
        "description": "Filter by domain (e.g., 'trading212.com')",
        "optional": true
      },
      "category": {
        "type": "string",
        "description": "Filter by category (e.g., 'finance', 'shopping')",
        "optional": true
      },
      "status": {
        "type": "string",
        "enum": ["active", "inactive", "expired", "all"],
        "description": "Filter by status",
        "optional": true
      },
      "query": {
        "type": "string",
        "description": "Free text search query",
        "optional": true
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "default": 10,
        "description": "Maximum results to return"
      },
      "sort_by": {
        "type": "string",
        "enum": ["confidence", "recency", "value", "expiry", "trust"],
        "description": "Field to sort by",
        "optional": true
      },
      "order": {
        "type": "string",
        "enum": ["asc", "desc"],
        "description": "Sort order",
        "optional": true
      },
      "min_confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Minimum confidence score threshold",
        "optional": true
      },
      "min_trust": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Minimum trust score threshold",
        "optional": true
      }
    }
  }
  ```
- **Outputs (Success Response Structure)**:
  - Returns `content` block containing descriptive text and JSON resource `deals://search` with type `application/json`, along with the `structuredContent` object:
  ```json
  {
    "deals": [
      {
        "code": "string",
        "url": "string (URL format)",
        "domain": "string",
        "title": "string",
        "description": "string",
        "status": "string",
        "reward": {
          "type": "cash | credit | percent | item",
          "value": "string | number | null"
        },
        "confidence": "number (0 to 1)"
      }
    ],
    "total": "integer (total base deals found)",
    "filtered": "integer (total deals matching criteria)"
  }
  ```
- **Error Cases**:
  - **Zod Validation Error**: If input types are wrong or exceed constraints (e.g., limit > 100).
    - *Format*: Returns `{ content: [{ type: "text", text: "❌ Invalid arguments: <detailed issues>" }], isError: true }`
  - **Internal Error**: Unhandled exceptions.
    - *Format*: Returns `{ content: [{ type: "text", text: "Tool execution failed" }], isError: true }`

#### B. `get_deal` (Alias: `get_deal_by_code`)
- **Description**: Retrieve detailed information about a specific referral code.
- **Inputs (JSON-Schema)**:
  ```json
  {
    "type": "object",
    "required": ["code"],
    "properties": {
      "code": {
        "type": "string",
        "description": "The referral code to look up"
      }
    }
  }
  ```
- **Outputs (Success Response Structure)**:
  - Returns `content` block containing success confirmation and JSON resource `deals://{code}`, along with `structuredContent` object:
  ```json
  {
    "code": "string",
    "url": "string (URL format)",
    "domain": "string",
    "title": "string",
    "description": "string",
    "status": "string (active | inactive | expired | quarantined)",
    "reward": {
      "type": "string",
      "value": "string | number | null"
    },
    "confidence": "number",
    "submitted_at": "string (ISO8601 Date)"
  }
  ```
- **Error Cases**:
  - **Code Not Found**: If the referral code is not in the system.
    - *Format*: Returns `{ content: [{ type: "text", text: "❌ Referral code \"{code}\" not found." }], isError: true }`
  - **Zod Validation Error**: If `code` is omitted or not a string.
    - *Format*: Returns `{ content: [{ type: "text", text: "❌ Invalid arguments: code: Required" }], isError: true }`

#### C. `add_referral` (Alias: `submit_deal`)
- **Description**: Add a new referral code directly into the system database. By default, new submissions are placed in `quarantined` state for human review.
- **Inputs (JSON-Schema)**:
  ```json
  {
    "type": "object",
    "required": ["code", "url", "domain"],
    "properties": {
      "code": {
        "type": "string",
        "description": "The referral code"
      },
      "url": {
        "type": "string",
        "format": "uri",
        "description": "Full referral URL (MUST include protocol https://)"
      },
      "domain": {
        "type": "string",
        "description": "Domain of the business (e.g., 'trading212.com')"
      },
      "title": {
        "type": "string",
        "description": "Title or short description of the deal",
        "optional": true
      },
      "description": {
        "type": "string",
        "description": "Detailed terms and benefits description",
        "optional": true
      },
      "reward_type": {
        "type": "string",
        "enum": ["cash", "credit", "percent", "item"],
        "default": "cash"
      },
      "reward_value": {
        "type": ["string", "number"],
        "description": "Reward amount or descriptive value",
        "optional": true
      },
      "category": {
        "type": "array",
        "items": { "type": "string" },
        "description": "List of categories (e.g., ['finance', 'investing'])",
        "optional": true
      },
      "expiry_date": {
        "type": "string",
        "format": "date-time",
        "description": "Expiration date in ISO8601 format",
        "optional": true
      }
    }
  }
  ```
- **Outputs (Success Response Structure)**:
  - Returns `content` block containing confirmation message and JSON resource `deals://{id}`, along with `structuredContent` confirmation payload:
  ```json
  {
    "success": true,
    "id": "string (UUID format)",
    "code": "string",
    "status": "quarantined",
    "message": "Referral created and queued for review"
  }
  ```
- **Error Cases**:
  - **Zod Validation Error / Bad Request**: If required fields are missing, if `url` is not a valid URL format, or if `expiry_date` is not in proper ISO date-time format.
    - *Format*: Returns `{ content: [{ type: "text", text: "❌ Invalid arguments: <field errors>" }], isError: true }`

### 2. Research (`research.ts`)
- **`research_domain`**
  - **Inputs**: `domain` (Required), `depth?` (quick|thorough|deep), `max_results?` (1-50).
  - **Outputs**: `{ domain: string, discovered_codes: any[], research_metadata: object }`.
- **`list_categories`**
  - **Inputs**: `include_descriptions?` (boolean).
  - **Outputs**: `{ categories: { name, description, keywords }[] }`.
- **`validate_deal`**
  - **Inputs**: `url` (Required), `check_status?` (boolean).
  - **Outputs**: `{ valid: boolean, url: string, extracted_code: string|null, domain: string, security_check: object, status_check: object }`.

### 3. System (`system.ts`)
- **`get_stats`**
  - **Inputs**: `days?` (number).
  - **Outputs**: `{ totalActiveDeals, totalDealsDiscovered, topCategory, topSource, expiringNext7Days }`.
- **`get_pipeline_status`**
  - **Inputs**: `{}`.
  - **Outputs**: `{ locked: boolean, last_run: object }`.
- **`trigger_discovery`**
  - **Inputs**: `{}`.
  - **Outputs**: `{ success: boolean, message: string }`.
- **`get_similar_deals`**
  - **Inputs**: `code?`, `domain?`, `limit?` (1-50).
  - **Outputs**: `{ reference: object, similar: any[], total: number }`.
- **`get_deal_highlights`**
  - **Inputs**: `limit?` (1-20).
  - **Outputs**: `{ top_deals: any[], expiring_soon: any[], recently_added: any[] }`.
- **`get_logs`**
  - **Inputs**: `run_id?`, `count?` (1-1000).
  - **Outputs**: `{ logs: any[], count: number }`.

### 4. User (`user.ts`)
- **`report_deal`**
  - **Inputs**: `code`, `reason` (broken|expired|fraudulent|inaccurate|duplicate), `comment?`.
  - **Outputs**: `{ success: boolean, code: string, reason: string, status: string }`.
- **`experience_deal`**
  - **Inputs**: `code`, `success: boolean`, `comment?`.
  - **Outputs**: `{ success: boolean, code: string, reported_success: boolean, new_confidence: number, total_experiences: number }`.
- **`natural_language_query`**
  - **Inputs**: `query` (Required), `limit?` (1-50), `includeSql?` (boolean).
  - **Outputs**: `{ success: boolean, query: string, parsed: object, count: number, results: any[], suggestions: string[] }`.

## Operational Safety
- **Idempotency**: Blocked by `DEALS_LOCK`. `run_id` required for all writes.
- **Quarantine**: Auto-triggers if (High Reward AND Trust < 0.5) OR (Cash Reward > $500). High reward defined as Cash > $100 or Percent > 50%.
- **Circuit Breakers**: API resilience via `worker/lib/circuit-breaker.ts`.
- **D1 CAS Lock**: Atomic lock acquisition via `PipelineLock` Durable Object.
- **Async Pipeline**: `/api/discover` returns 202 immediately; pipeline runs via `ctx.waitUntil()`.
