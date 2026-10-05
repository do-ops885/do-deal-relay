# Eval Harness (IMP-5)

Golden-case regression suites for AI-facing quality surfaces that unit tests
do not cover end-to-end. Suites are plain JSON fixtures plus a vitest runner,
kept out of the unit-test config so `npm run test:unit` stays hermetic.

## Suites

| Suite | Fixture | Surface | Metric |
|:--|:--|:--|:--|
| alerts-matcher | `fixtures/alerts-matcher.eval.json` | `scoreDealAgainstQuery` (FTS5-parity) | pass rate within score bounds |
| nlq-intent | `fixtures/nlq-intent.eval.json` | rule-based `detectIntent` | intent accuracy |
| hybrid-fusion | `fixtures/hybrid-fusion.eval.json` | `fuseHybridResults` RRF | top-N ordering accuracy |

## Running

```bash
npm run test:evals
```

The runner prints per-suite rates and fails when a suite drops below the
`thresholds` declared in its fixture.

## Adding cases

1. Append a case object to the relevant fixture (keep `name` unique).
2. Run `npm run test:evals` — the new case must pass on the current build.
3. If behavior changes intentionally, update the golden expectation in the
   same commit as the code change and note it in the commit message.

Thresholds are ratchets: never lower a suite threshold to make a regression
pass. Tighten fixtures (raise thresholds, add adversarial cases) whenever a
surface is improved.
