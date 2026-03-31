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
