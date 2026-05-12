---
name: evals
description: "Skill evaluation framework - run tests and benchmarks for other skills."
license: MIT
metadata:
  author: d.o.
  version: "1.0"
  spec: "agentskills.io"
---

# Skill Evaluation Framework

This directory contains the skill evaluation runner and results storage.

## Usage

```bash
# Run all skill evaluations
python .agents/skills/evals/run_evals.py

# View detailed results
cat .agents/skills/evals/results.json
```

## Structure

- `run_evals.py` - Main evaluation runner
- `results.json` - Evaluation results storage
- `README.md` - Framework documentation

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "This is just a small change, no need for coordination." | Even small changes can have side effects. Structured coordination ensures nothing is missed. |
| "Writing an ADR/Plan takes too much time." | Investing time in planning saves significantly more time during execution and debugging. |
| "I can do this all in one go." | Breaking tasks down into atomic steps increases reliability and allows for better verification. |

## Red Flags

- [ ] Starting execution before a plan is approved.
- [ ] Making multiple unrelated changes in a single commit.
- [ ] Skipping validation gates or quality checks.
- [ ] Lack of coordination between parallel tasks leading to conflicts.
- [ ] Failing to update documentation after architectural changes.
