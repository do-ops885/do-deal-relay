# Skill Evaluations

This directory contains the skill evaluation framework and results.

## Running Evaluations

```bash
# Run all skill evaluations
python .agents/skills/evals/run_evals.py

# View detailed results
cat .agents/skills/evals/results.json
```

## Evaluation Criteria

Skills are evaluated on:

1. **SKILL.md Structure** (Required)
   - Valid YAML frontmatter with name, description, version
   - Required sections: Overview, Quick Start
   - Maximum 250 lines

2. **Examples** (Recommended)
   - `examples/` directory with working examples
   - Demonstrates real use cases

3. **References** (Recommended)
   - `references/` directory with detailed documentation
   - Links to external resources

4. **Scripts** (Recommended)
   - `scripts/` directory with helper tools
   - `test.py` for automated testing

## Current Status

**Last Updated**: 2026-03-31

| Status      | Count | Skills                                                                                                                                                                                                                               |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅ Passed   | 1     | pre-commit                                                                                                                                                                                                                           |
| ⚠️ Warnings | 10    | agent-browser*, agent-coordination, building-mcp-server-on-cloudflare*, cloudflare, durable-objects, goap-agent, parallel-execution, privacy-first, sandbox-sdk, skill-creator, task-decomposition, web-perf, workers-best-practices |
| ❌ Failed   | 4     | agent-browser, agent-coordination\*\*, building-mcp-server-on-cloudflare, wrangler                                                                                                                                                   |

\*Exceeds 250 line limit
\*\*Test execution error

## Fixing Issues

### Line Count Exceeded

```bash
# Check current line count
wc -l .agents/skills/<skill>/SKILL.md

# Simplify or move content to references/
```

### Missing Sections

Add required sections to SKILL.md:

```markdown
## Overview

Brief description of the skill

## Quick Start

Essential commands to get started
```

### Missing Directories

```bash
mkdir -p .agents/skills/<skill>/{examples,references,scripts}
touch .agents/skills/<skill>/scripts/test.py
```

## Improvement Goals

- **Target**: 100% pass rate with no warnings
- **Current**: 7% pass rate (1/15)
- **Action Items**:
  1. Condense oversized SKILL.md files
  2. Add missing required sections
  3. Create examples directories
  4. Add test scripts
