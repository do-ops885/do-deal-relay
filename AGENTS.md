# AGENTS.md - Deal Discovery System

**Goal**: Autonomous deal discovery with coordinated AI agents.
**Version**: 0.1.3 | **Status**: Active / Testing

## Shared Agent Contract

Every agent MUST follow these rules:
1. **Atomic Commits**: One logical change per commit.
2. **Quality Gate**: Run `./scripts/quality_gate.sh` before every commit.
3. **No Magic Numbers**: Use `worker/config.ts`.
4. **File Limit**: Max 500 lines per source file.
5. **Deduplication**: Check for existing issues before creating new ones.

## Behavioral Spec

### 1. Validation Gates (All 9 MUST Pass)
| Gate | ID | Semantic Check |
| :--- | :--- | :--- |
| Schema | `schema_validation` | Zod schema integrity |
| Normalize | `normalization_verification` | URL/Data formatting |
| Dedupe | `deduplication_check` | Semantic similarity & domain partitioning |
| Trust | `source_trust` | Source trust score ≥ 0.3 |
| Reward | `reward_plausibility` | Value sanity check ($0 < v < $10k) |
| Expiry | `expiry_validation` | Expiration date is in the future |
| 2nd Pass | `second_pass_validation` | Multi-source verification |
| Idempotency| `idempotency_check` | Prevent redundant processing |
| Integrity | `snapshot_hash_verification` | Snapshot hash consistency |

### 2. Infrastructure (KV & D1)
| Binding | Role | Access Pattern |
| :--- | :--- | :--- |
| `DEALS_PROD` | Production State | Read/Write (Publish phase only) |
| `DEALS_STAGING` | Staging Area | Read/Write (Pipeline internal) |
| `DEALS_LOG` | Metrics/Logs | Append-only (Pipeline progress) |
| `DEALS_LOCK` | Mutex | Atomic (Discovery start/stop) |
| `DEALS_SOURCES` | Trust Registry | Read-heavy (Source verification) |
| `DEALS_DB` | Search Engine | D1 Full-text search & SQL |

### 3. Execution Schedule
- **Discovery**: `0 */6 * * *` (Every 6 hours)
- **Cleanup**: `0 9 * * *` (Daily 9am)
- **Audit**: `0 0 * * SUN` (Weekly Sunday Midnight)

### 4. Tool Signatures (MCP)
- **Deals**: `search_deals`, `get_deal`, `add_referral`
- **Research**: `research_domain`, `list_categories`, `validate_deal`
- **System**: `get_stats`, `get_pipeline_status`, `trigger_discovery`, `get_logs`
- `metrics`: `validation_gate_rejections`, `validation_gate_passes`, `validation_gate_rejection_ratio`
- **User**: `report_deal`, `experience_deal`, `natural_language_query`

Detailed schemas in [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md).

## Project Structure
- `worker/`: Source code (Cloudflare Workers)
- `agents-docs/`: System & agent specifications
- `docs/`: API documentation
- `tests/`: Unit & integration tests
- `reports/`: Permanent analysis findings
- `temp/`: Session-only state (gitignored)

See [agents-docs/GUARD_RAILS.md](agents-docs/GUARD_RAILS.md) for enforcement details.
