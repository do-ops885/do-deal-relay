---
name: validation-gates
description: Execute and report on the 9-gate validation pipeline (Schema, Trust, Dedupe, Reward, Expiry, etc.) for deals.
---

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

## Rationalizations
- "Schema gate failed, but the ROI is fine, skip it" — Schema gate is non-skippable; a malformed payload poisons downstream stages.
- "Trust score is below threshold, the source is still reliable" — the trust threshold (`TRUST_THRESHOLD=0.3` default) is a safety bound, not a recommendation; honour it.
- "Dedupe is slow, run it lazily in the next batch" — duplicates fan out into duplicate notifications and phantom deals; run Dedupe inline.
- "Reward looks plausible, no need to validate" — reward values drive user-facing display; an aberrant value is a user-trust incident.
- "We can fix the gate in a follow-up PR" — gates must be green at PR merge time; "fix it later" violates Validation-First (AGENTS.md Rule 4).

## Red Flags
- A deal is staged to `DEALS_PROD` while any gate returns `error`.
- Gate outputs are stored but never compared against the stage's input (silent regression).
- A new deal source is added without updating the `DEALS_SOURCES` trust-score registry.
- The snapshot hash check passes while the underlying KV write failed (sign the hash against the actual KV response).
- The pipeline returns `success: true` despite a `batch insert` reporting fewer row IDs than rows submitted.
