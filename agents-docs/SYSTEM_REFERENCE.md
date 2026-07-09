# System Reference
**Version**: 0.1.8 | **Status**: Production

## Architecture: Two-Phase Publishing
Candidate deals are staged, validated through 9 gates, then promoted to production.
1. **Stage**: Write to `DEALS_STAGING`.
2. **Publish**: Promoted to `DEALS_PROD` KV + GitHub commit.
3. **Rollback**: Revert `DEALS_PROD` to previous snapshot.

## Middleware Pipeline (ADR-016)
All API routes go through a centralized middleware pipeline in `worker/lib/middleware/pipeline.ts`:
- **Auth**: JWT/API key verification with role-based access (`user`, `admin`, `internal`)
- **Rate Limiting**: Config-driven per-route rate limits via `createRateLimitMiddleware`
- **Body Size**: Maximum request body validation via `checkBodySize`

Route registration follows the pattern: `withAuth → createRateLimitMiddleware → handler`.

## Validation Gates (Mandatory 9-Gate Pipeline)

| Gate | Pass Condition | Fail Condition / Error |
| :--- | :--- | :--- |
| `schema_validation` | Object matches `DealSchema`. | `SchemaError`: Missing fields or type mismatch. |
| `normalization_verification` | Domain is lowercase; Code is uppercase; No UTMs. | `NormalizationError`: Case or URL params detected. |
| `deduplication_check` | ID and Domain+Code pair are unique in current batch. | `DuplicateError`: Identical deal exists in batch. |
| `source_trust` | `source.trust_score >= 0.3` (Prod). | `TrustError`: Source trust below environment threshold. |
| `reward_plausibility` | Value > 0; Cash < $10,000; Percent <= 100%. | `PlausibilityError`: Impossible or suspicious rewards. |
| `expiry_validation` | `expiry.date` is null or in the future. | `ExpiryError`: Date is in the past. |
| `second_pass_validation` | Post-normalization schema re-verification. | `ValidationError`: Normalization broke schema. |
| `idempotency_check` | Deal ID not in `DEALS_PROD` snapshot. | `IdempotencyError`: Deal already published. |
| `snapshot_hash_verification` | Data hash matches pipeline context hash. | `IntegrityError`: Data tampered/corrupted in pipeline. |

### 10th Gate: Continuous Verification
Post-publication health monitoring via `worker/validation/gates/continuous-verification.ts`.
Runs on weekly cron (`0 0 * * SUN`) to verify published deals remain valid.

## Infrastructure
### KV Namespaces

| Binding | Role | ID (Prod) | Access Pattern |
| :--- | :--- | :--- | :--- |
| `DEALS_PROD` | Production snapshots | `23ee9b8c...` | Read (Public), Write (Finalization) |
| `DEALS_STAGING` | Candidate deals | `b0db85b9...` | Read/Write (Validation) |
| `DEALS_LOG` | Run history & metrics | `1f1a901f...` | Write (Logger), Read (Admin) |
| `DEALS_LOCK` | Concurrency mutex (legacy) | `e3ab520e...` | Read/Write (`init` stage) |
| `DEALS_SOURCES` | Source registry | `be3c0fc1...` | Read (Trust), Write (Admin) |

### D1 Database

| Binding | Database Name | ID | Role |
| :--- | :--- | :--- | :--- |
| `DEALS_DB` | `deals-db` | `29ee4ca4...` | Advanced queries, full-text search |

### Durable Objects

| Binding | Class | Role |
| :--- | :--- | :--- |
| `PIPELINE_LOCK` | `PipelineLock` | Atomic concurrency control via SQLite (replaces KV lock race condition) |

### Vectorize

| Binding | Index | Role |
| :--- | :--- | :--- |
| `DEAL_EMBEDDINGS` | `deal-embeddings` | Semantic search over deals and referrals |

### Scheduled Triggers
- **`0 */6 * * *`**: Discovery pipeline.
- **`0 9 * * *`**: Expirations & experience aggregation.
- **`0 0 * * SUN`**: Weekly full validation sweep + continuous verification.

### Observability
- **Cloudflare Traces**: Enabled via `wrangler.jsonc` observability config
- **OTLP Export**: Configurable destinations (Honeycomb, Grafana, Axiom, SigNoz)
- **DORA Metrics**: `/api/dora-metrics` endpoint for deployment/lead time/CFR/MTTR tracking

## MCP Toolset (Tool Signatures)

### 1. Deals (`deals.ts`)
- **`search_deals`**
  - **Inputs**: `domain?`, `category?`, `status?` (active|inactive|expired|all), `query?`, `limit?` (1-100), `sort_by?` (confidence|recency|value|expiry|trust), `order?` (asc|desc), `min_confidence?`, `min_trust?`.
  - **Outputs**: `{ deals: Deal[], total: number }`.
- **`get_deal`**
  - **Inputs**: `code: string` (Required).
  - **Outputs**: Detailed `Deal` object: `{ code, url, domain, title, description, status, reward, confidence, submitted_at }`.
  - **Errors**: `404 Not Found` if code does not exist.
- **`add_referral`**
  - **Inputs**: `code`, `url`, `domain` (Required); `title?`, `description?`, `reward_type?` (cash|credit|percent|item), `reward_value?`, `category?` (string[]), `expiry_date?` (ISO).
  - **Outputs**: `{ success: boolean, id: string, code: string, status: string, message: string }`.

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
