# System Reference
**Version**: 0.1.6 | **Status**: Production

## Architecture: Two-Phase Publishing
Candidate deals are staged, validated through 9 gates, then promoted to production.
1. **Stage**: Write to `DEALS_STAGING`.
2. **Publish**: Promoted to `DEALS_PROD` KV + GitHub commit.
3. **Rollback**: Revert `DEALS_PROD` to previous snapshot.

## Validation Gates (Mandatory 9-Gate Pipeline)
| Gate | Pass Condition | Fail Condition / Error |
| :--- | :--- | :--- |
| `schema_validation` | Object matches `DealSchema`. | `SchemaError`: Missing fields or type mismatch. |
| `normalization_verification` | Domain is lowercase; Code is uppercase; No UTMs. | `NormalizationError`: Case or URL params detected. |
| `deduplication_check` | ID and Domain+Code pair are unique in current batch. | `DuplicateError`: Identical deal exists in batch. |
| `source_trust` | `source.trust_score >= 0.3` (Prod). | `TrustError`: Source trust below environment threshold. |
| `reward_plausibility` | Value > 0; Cash < $10k; Percent <= 100%. | `PlausibilityError`: Impossible or suspicious rewards. |
| `expiry_validation` | `expiry.date` is null or in the future. | `ExpiryError`: Date is in the past. |
| `second_pass_validation` | Post-normalization schema re-verification. | `ValidationError`: Normalization broke schema. |
| `idempotency_check` | Deal ID not in `DEALS_PROD` snapshot. | `IdempotencyError`: Deal already published. |
| `snapshot_hash_verification` | Data hash matches pipeline context hash. | `IntegrityError`: Data tampered/corrupted in pipeline. |

## Infrastructure
### KV Namespaces
| Binding | Role | Access Pattern |
| :--- | :--- | :--- |
| `DEALS_PROD` | Production snapshots | Read (Public), Write (Finalization) |
| `DEALS_STAGING` | Candidate deals | Read/Write (Validation) |
| `DEALS_LOG` | Run history & metrics | Write (Logger), Read (Admin) |
| `DEALS_LOCK` | Concurrency mutex | Read/Write (`init` stage) |
| `DEALS_SOURCES` | Source registry | Read (Trust), Write (Admin) |

### Scheduled Triggers
- **`0 */6 * * *`**: Discovery pipeline.
- **`0 9 * * *`**: Expirations & experience aggregation.
- **`0 0 * * SUN`**: Weekly full validation sweep.

## MCP Toolset (Tool Signatures)

### 1. Deals (`deals.ts`)
- **`search_deals`**
  - **Inputs**: `domain?`, `category?`, `status?` (active|inactive|expired|all), `query?`, `limit?` (1-100), `sort_by?` (confidence|recency|value|expiry|trust), `order?` (asc|desc), `min_confidence?`, `min_trust?`.
  - **Outputs**: `{ deals: Deal[], total: number, filtered: number }`.
- **`get_deal`**
  - **Inputs**: `code: string` (Required).
  - **Outputs**: Detailed `Deal` object.
  - **Errors**: `404 Not Found` if code does not exist.
- **`add_referral`**
  - **Inputs**: `code`, `url`, `domain` (Required); `title?`, `description?`, `reward_type?` (cash|credit|percent|item), `reward_value?`, `category?` (string[]), `expiry_date?` (ISO).
  - **Outputs**: `{ success: true, id: UUID, code: string, status: "quarantined" }`.

### 2. Research (`research.ts`)
- **`research_domain`**
  - **Inputs**: `domain` (Required), `depth?` (quick|thorough|deep), `max_results?` (1-50).
  - **Outputs**: `{ discovered_codes: Deal[], metadata: object }`.
- **`validate_deal`**
  - **Inputs**: `url` (Required), `check_status?` (boolean).
  - **Outputs**: `{ valid: boolean, url: string, extracted_code: string|null, security_check: object }`.

### 3. System (`system.ts`)
- **`get_stats`**: `days?` -> Aggregates (Active, Discovered, Expiring).
- **`trigger_discovery`**: `void` -> `{ success: boolean, message: string }`.

### 4. User (`user.ts`)
- **`report_deal`**: `code`, `reason` (broken|expired|fraudulent|inaccurate|duplicate) -> `{ success: boolean }`.
- **`experience_deal`**: `code`, `success: boolean` -> `{ success: true, new_confidence: number }`.
- **`natural_language_query`**: `query` (string) -> `{ results: Deal[], count: number }`.

## Operational Safety
- **Idempotency**: Blocked by `DEALS_LOCK`. `run_id` required for all writes.
- **Quarantine**: Auto-triggers if trust < 0.5 or reward > $500.
