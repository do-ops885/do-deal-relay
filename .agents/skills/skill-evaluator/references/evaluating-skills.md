# Evaluating Skills - Condensed Workflow

Companion to `.agents/skills/skill-evaluator/SKILL.md`. Use this when you need the grading rules without re-reading the full skill.

## 1. Structure Gate

Check before judging output:

| Check | Pass condition |
| --- | --- |
| `SKILL.md` exists | yes, with frontmatter `name` + `description` |
| Line count | <= 250 lines |
| `## Rationalizations` | excuse/counter-argument table specific to this skill |
| `## Red Flags` | skill-specific early-warning checklist |
| `evals/evals.json` | valid JSON, at least one case |
| Local links | every `reference/`, `references/`, `scripts/`, `evals/` link resolves |
| Directory listing | skill appears in `.agents/skills/README.md` |
| Trigger rules | skill listed in `.agents/skills/skill-rules.json` when it should auto-activate |

Run `./scripts/skill-eval-check.sh` for the computational version of this table.

## 2. Eval Case Quality

A usable case has an `id`, a realistic `prompt`, and a checkable `expected_output`. Reject cases that are:

- prompts with no artifact or decision to produce
- assertions that cannot be falsified ("the answer is good", "the skill feels useful")
- assertions that depend on network state or wall-clock time

## 3. Live Run Protocol

1. Load the skill under test (`skill <name>`).
2. Run one eval prompt verbatim; do not help the skill along.
3. Capture the raw output before judging it.
4. Grade each assertion with quoted evidence from the output.
5. Record the run in `.agents/metrics/metrics-<agent>.jsonl`.

## 4. Grading Rules

| Verdict | Meaning |
| --- | --- |
| PASS | Structure sound, live output satisfies every assertion |
| NEEDS_WORK | Usable, but structure gaps or output gaps remain |
| FAIL | Broken, misleading, or missing a core piece |

Every PASS or FAIL needs evidence: the assertion, the verdict, and the exact output fragment that decided it. "Looks fine" is not evidence.

## 5. Baseline Comparison

Rerun the same prompt without the skill (or against a saved snapshot) when a verdict is close. Compare pass rate, missing details, format compliance and token cost. A skill that does not beat the no-skill baseline is not earning its context budget.

## 6. Reporting

```text
## Eval Report: <skill-name>
- Goal: structure / eval review / live run / baseline
- Structure: PASS | NEEDS_WORK | FAIL
- Live run: PASS | NEEDS_WORK | FAIL
- Baseline: not run | summary

### Assertion Results
- PASS: <assertion> — <evidence>
- FAIL: <assertion> — <evidence>

### Issues
- <issue>

### Next Fixes
1. <highest-value fix>
2. <next fix>

### Verdict
PASS | NEEDS_WORK | FAIL — <one sentence>
```
