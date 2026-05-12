---
name: validation-gates
description: Multi-gate validation framework for progressive quality assurance. Use for implementing mandatory system gates and local quality gates.
---

# Validation Gates

Implement and maintain the 9 mandatory validation gates of the deal discovery pipeline.

## When to Use
Activate when modifying the worker pipeline (`worker/validation/`) or adding new deal types.

## Instructions
1. **Gate Integrity**: Never bypass any of the 9 mandatory gates.
2. **Modular Logic**: Each gate should live in `worker/validation/gates/` as a standalone module.
3. **Fail-Fast**: Gates should be ordered by execution cost (fastest/cheapest first).
4. **Context Preservation**: Use `ValidationContext` to pass state between gates.

## The 9 Mandatory Gates
1. `schema_validation`: Structural integrity.
2. `normalization_verification`: Canonical format.
3. `deduplication_check`: Uniqueness.
4. `source_trust`: Trust score >= threshold.
5. `reward_plausibility`: Value sanity check.
6. `expiry_validation`: Freshness.
7. `second_pass_validation`: AI-powered verification.
8. `idempotency_check`: Double-run prevention.
9. `snapshot_hash_verification`: Data consistency.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "9 gates is too slow." | Latency is optimized via parallel execution and fast-path caching. Integrity is paramount. |
| "I can merge normalization and schema check." | Decoupled gates are easier to test and debug. |
| "Trust score check is redundant." | Source trust is our primary defense against spam. |

## Red Flags

- [ ] Adding logic to `pipeline.ts` instead of a standalone gate module.
- [ ] Hardcoding thresholds inside gate logic (use `Env` or `config.ts`).
- [ ] Missing unit tests in `tests/unit/gates/`.
- [ ] Bypassing the gate registry in `worker/validation/gates/index.ts`.
