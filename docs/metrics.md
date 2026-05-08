# Validation Gate Metrics

The system tracks per-gate rejection counts and ratios for the validation phase. This allows for targeted optimization and trust-threshold tuning.

## Validation Gates

There are 9 stable validation gates executed in order:

1.  `schema_validation`: Verifies the deal matches the Zod schema.
2.  `normalization_verification`: Ensures domain is lowercase, code is uppercase, and URL is stripped of tracking parameters.
3.  `deduplication_check`: Checks for duplicate deals within the current batch.
4.  `source_trust`: Ensures the source's trust score meets the minimum threshold.
5.  `reward_plausibility`: Checks for negative values or suspiciously high rewards.
6.  `expiry_validation`: Verifies the deal hasn't already expired.
7.  `second_pass_validation`: Re-runs schema validation and length checks on normalized data.
8.  `idempotency_check`: Checks if the deal already exists in the production snapshot.
9.  `snapshot_hash_verification`: Verifies the integrity of the deal data using hashes.

## Prometheus Metrics

The following metrics are exposed via the `/metrics` endpoint:

### `deals_pipeline_validation_gate_passed_avg`

Average number of deals that passed a specific gate per run.

*   **Labels:** `gate` (one of the 9 gate names above)
*   **Type:** Gauge (Average over recent runs)

### `deals_pipeline_validation_gate_failed_avg`

Average number of deals that failed a specific gate per run.

*   **Labels:** `gate` (one of the 9 gate names above)
*   **Type:** Gauge (Average over recent runs)

## Rejection Ratio

The rejection ratio for a specific gate can be derived using:

`failed_avg / (passed_avg + failed_avg)`

## API JSON Output

The `/metrics?format=json` endpoint also includes a `validation_gates` object with detailed pass/fail counts.
