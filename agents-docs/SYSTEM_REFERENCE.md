# System Reference

**System**: Deal Discovery System
**Version**: 0.1.3 | **Status**: Production

## Architecture

### Two-Phase Publishing
**Staging → Production** with 9 mandatory validation gates.

### Validation Gates (Pass/Fail Semantics)

1. **`schema_validation`**:
   - **Pass**: Object matches `DealSchema` (Zod).
   - **Fail**: Missing required fields, incorrect types, or validation errors.
2. **`normalization_verification`**:
   - **Pass**: Domain is lowercase, code is uppercase, no tracking params (utm_, etc.) in URL, `normalized_at` exists.
   - **Fail**: Case mismatches or tracking parameters detected.
3. **`deduplication_check`**:
   - **Pass**: ID is unique in batch; Domain+Code pair is unique in batch.
   - **Fail**: Redundant deal detected.
4. **`source_trust`**:
   - **Pass**: `deal.source.trust_score >= TRUST_THRESHOLD` (Dev: 0.1, Staging: 0.25, Prod: 0.3).
   - **Fail**: Source trust insufficient.
5. **`reward_plausibility`**:
   - **Pass**: Reward value > 0; Cash < $10k; Percent <= 100%.
   - **Fail**: Negative, zero, or suspiciously high/impossible rewards.
6. **`expiry_validation`**:
   - **Pass**: `expiry.date` is null OR in the future.
   - **Fail**: Expiration date is in the past.
7. **`second_pass_validation`**:
   - **Pass**: Re-validated schema on normalized data; Code length 4-50 chars.
   - **Fail**: Normalization broke schema or code length is invalid.
8. **`idempotency_check`**:
   - **Pass**: Deal ID does not exist in `DEALS_PROD` snapshot.
   - **Fail**: Deal already published.
9. **`snapshot_hash_verification`**:
   - **Pass**: Deal data hash matches context hash (integrity check).
   - **Fail**: Data corrupted or tampered during pipeline.

## Infrastructure

### KV Namespaces
| Binding | ID | Role |
| :--- | :--- | :--- |
| `DEALS_PROD` | `23ee9b...` | Immutable production snapshots |
| `DEALS_STAGING` | `b0db85...` | Mutable candidate deals |
| `DEALS_LOG` | `1f1a90...` | Run history & metrics |
| `DEALS_LOCK` | `e3ab52...` | Concurrency mutex (`discovery_lock`) |
| `DEALS_SOURCES` | `be3c0f...` | Source registry & trust scores |

### D1 Database
| Binding | Name | Purpose |
| :--- | :--- | :--- |
| `DEALS_DB` | `deals-db` | Full-text search & Referral metadata |

## MCP Toolset (Model Context Protocol)

### 1. Deals (`deals.ts`)
- `search_deals(domain?, category?, status?, query?, limit?, sort_by?, order?, min_confidence?, min_trust?)`
- `get_deal(code)`
- `add_referral(code, url, domain, title?, description?, reward_type?, reward_value?, category?, expiry_date?)`

### 2. Research (`research.ts`)
- `research_domain(domain, depth?, max_results?)`
- `list_categories(include_descriptions?)`
- `validate_deal(url, check_status?)`

### 3. System (`system.ts`)
- `get_stats(days?)`
- `get_pipeline_status()`
- `trigger_discovery()`
- `get_similar_deals(code?, domain?, limit?)`
- `get_deal_highlights(limit?)`
- `get_logs(run_id?, count?)`

### 4. User (`user.ts`)
- `report_deal(code, reason, comment?)`
- `experience_deal(code, success, comment?)`
- `natural_language_query(query, limit?, includeSql?)`

## State Machine
`init` → `discover` → `normalize` → `dedupe` → `validate` → `score` → `stage` → `publish` → `verify` → `finalize`

## Related Documentation
- [AGENTS.md](../AGENTS.md) - Behavioral contracts
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Directory rules
- [GUARD_RAILS.md](./GUARD_RAILS.md) - Security & constraints
