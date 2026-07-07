# Validation Gates Skill

## Purpose
Execute and report on the 9-gate validation pipeline for deals in the do-deal-relay system.

Reference: `plans/PEV_LOOP.md`, `agents-docs/SYSTEM_REFERENCE.md`

## The 9 Gates

| Gate | Check | File |
|------|-------|------|
| 1. Schema | Deal structure matches expected schema | `worker/pipeline/validate-fast-path.ts` |
| 2. Trust | Source trust score meets threshold | `worker/pipeline/score.ts` |
| 3. Dedupe | No duplicate deals in batch | `worker/pipeline/dedupe.ts` |
| 4. Reward | Reward value is plausible | `worker/pipeline/validate-fast-path.ts` |
| 5. Expiry | Expiration date is valid | `worker/pipeline/validate-fast-path.ts` |
| 6. Normalization | Text is normalized correctly | `worker/pipeline/normalize.ts` |
| 7. Idempotency | Run produces same result for same input | `worker/pipeline/validate-fast-path.ts` |
| 8. Second Pass | Secondary validation confirms results | `worker/pipeline/validate-fast-path.ts` |
| 9. Snapshot Hash | Integrity check on output | `worker/pipeline/validate-fast-path.ts` |

## Quality Gate Script
```bash
./scripts/pev-gates.sh
```

## Verification Priority (from AGENTS.md)
1. Typecheck / build (fast)
2. Unit tests (logic)
3. Integration tests (behavior)
4. Lint / format (style)
