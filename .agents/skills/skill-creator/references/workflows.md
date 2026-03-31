# Workflow Patterns for Skill Development

## Overview

This guide covers common workflow patterns for developing, testing, and improving skills.

## Development Workflows

### 1. New Skill Development

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Define    │────▶│  Initialize │────▶│   Draft     │
│   Purpose   │     │   Structure │     │   Content   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
           ┌────────────────────────────────────┘
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Validate  │────▶│    Test     │
    │   Structure │     │   Examples  │
    └─────────────┘     └──────┬──────┘
                               │
           ┌───────────────────┘
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Package   │────▶│   Deploy    │
    │   & Version │     │   & Monitor │
    └─────────────┘     └─────────────┘
```

**Steps**:

1. Define skill purpose and scope
2. Initialize with init_skill.py
3. Write SKILL.md content
4. Validate with quick_validate.py
5. Test all examples
6. Package and version
7. Deploy to agents
8. Monitor usage and feedback

### 2. Skill Modification

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Review    │────▶│   Assess    │────▶│   Plan      │
│   Current   │     │   Changes   │     │   Updates   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
           ┌────────────────────────────────────┘
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Make      │────▶│   Validate  │
    │   Changes   │     │   Changes   │
    └─────────────┘     └──────┬──────┘
                               │
           ┌───────────────────┘
           ▼
    ┌─────────────┐     ┌─────────────┐
    │ Regression  │────▶│   Update    │
    │    Test     │     │   Version   │
    └─────────────┘     └─────────────┘
```

**Steps**:

1. Read current SKILL.md
2. Identify what needs changing
3. Plan modifications
4. Make changes
5. Validate structure
6. Run regression tests
7. Update version
8. Document changes

### 3. Skill Evaluation

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Define    │────▶│   Create    │────▶│   Execute   │
│   Success   │     │   Test      │     │   Tests     │
│   Criteria  │     │   Cases     │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
           ┌────────────────────────────────────┘
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Score     │────▶│  Analyze    │
    │   Results   │     │  Patterns   │
    └─────────────┘     └──────┬──────┘
                               │
           ┌───────────────────┘
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Improve   │────▶│   Retest    │
    │   Skill     │     │   & Verify  │
    └─────────────┘     └─────────────┘
```

**Steps**:

1. Define what success looks like
2. Create test case suite
3. Run tests with agent
4. Score and collect metrics
5. Analyze failure patterns
6. Update skill to address issues
7. Re-test to verify improvements

## Testing Workflows

### Unit Testing Skills

Test individual components:

````python
# test_skill_components.py
import pytest
from pathlib import Path

class TestSkillStructure:
    def test_frontmatter_exists(self, skill_path):
        content = Path(skill_path / "SKILL.md").read_text()
        assert content.startswith("---")
        assert "name:" in content

    def test_line_count_limit(self, skill_path):
        content = Path(skill_path / "SKILL.md").read_text()
        lines = content.split('\n')
        assert len(lines) <= 250, f"Skill exceeds 250 lines: {len(lines)}"

    def test_examples_present(self, skill_path):
        content = Path(skill_path / "SKILL.md").read_text()
        assert '```' in content, "No code examples found"
````

### Integration Testing

Test skill with actual agent:

```python
# test_skill_integration.py
import subprocess
import json

def test_skill_execution():
    # Load skill
    result = subprocess.run(
        ["agent", "load-skill", "./my-skill"],
        capture_output=True
    )
    assert result.returncode == 0

    # Test basic execution
    result = subprocess.run(
        ["agent", "execute", "task1"],
        capture_output=True
    )
    output = json.loads(result.stdout)
    assert output["success"] is True
```

### Regression Testing

Compare before and after:

```bash
#!/bin/bash
# regression_test.sh

SKILL_PATH=$1
BASELINE_DIR="./baseline"
CURRENT_DIR="./current"

# Save baseline
git stash
python test_skill.py --skill $SKILL_PATH --output $BASELINE_DIR

# Test current
git stash pop
python test_skill.py --skill $SKILL_PATH --output $CURRENT_DIR

# Compare
python aggregate_benchmark.py --compare $BASELINE_DIR $CURRENT_DIR
```

## Improvement Workflows

### 1. Performance Optimization

```
Baseline → Profile → Identify → Optimize → Verify → Update
```

**Steps**:

1. Establish baseline metrics
2. Profile execution to find bottlenecks
3. Identify slow operations
4. Optimize instructions or examples
5. Verify improvements
6. Update skill with learnings

### 2. Error Pattern Analysis

```
Collect → Categorize → Prioritize → Fix → Test → Monitor
```

**Steps**:

1. Collect error logs from usage
2. Categorize by type and frequency
3. Prioritize by impact
4. Fix skill to address root causes
5. Test fixes thoroughly
6. Monitor for recurrence

### 3. User Feedback Integration

```
Gather → Analyze → Prioritize → Implement → Test → Release
```

**Steps**:

1. Gather feedback from users
2. Analyze for common themes
3. Prioritize by frequency and impact
4. Implement improvements
5. Test with users when possible
6. Release updated version

## Collaborative Workflows

### Skill Review Process

```
Draft → Self-Review → Peer-Review → Revise → Approve → Merge
```

**Checklist**:

- [ ] Follows 250-line limit
- [ ] Has proper frontmatter
- [ ] Includes working examples
- [ ] Handles error cases
- [ ] Clear and actionable
- [ ] Tested with agent

### Skill Maintenance

```
Monitor → Review → Plan → Update → Validate → Deploy
```

**Scheduled Reviews**:

- Monthly: Usage metrics and errors
- Quarterly: Full content review
- Annually: Architecture review

**Review Checklist**:

- [ ] Instructions still accurate
- [ ] Examples still work
- [ ] Dependencies up to date
- [ ] No broken links
- [ ] Version current
- [ ] Performance acceptable

## Automation Workflows

### Continuous Integration

```yaml
# .github/workflows/skills-ci.yml
name: Skills CI

on:
  push:
    paths:
      - ".agents/skills/**"
  pull_request:
    paths:
      - ".agents/skills/**"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Validate all skills
        run: |
          for skill in .agents/skills/*/; do
            python .agents/skills/skill-creator/scripts/quick_validate.py "$skill"
          done

      - name: Check line counts
        run: |
          for skill in .agents/skills/*/SKILL.md; do
            lines=$(wc -l < "$skill")
            if [ $lines -gt 250 ]; then
              echo "ERROR: $skill has $lines lines (max 250)"
              exit 1
            fi
          done

      - name: Run tests
        run: npm test
```

### Automated Benchmarking

```yaml
# Weekly benchmark run
name: Weekly Skill Benchmark

on:
  schedule:
    - cron: "0 0 * * 0" # Every Sunday

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run benchmarks
        run: |
          mkdir -p benchmarks/$(date +%Y-%m-%d)
          for skill in .agents/skills/*/; do
            python test_skill.py --skill "$skill" \
              --output benchmarks/$(date +%Y-%m-%d)/$(basename "$skill")
          done

      - name: Aggregate results
        run: |
          python aggregate_benchmark.py benchmarks/$(date +%Y-%m-%d)/ \
            --output benchmarks/summary-$(date +%Y-%m-%d).json

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: benchmarks/
```

## Workflow Templates

### Quick Skill Fix

```bash
# 1. Read current skill
cat .agents/skills/problem-skill/SKILL.md

# 2. Identify issue
# ... analyze content ...

# 3. Make fix
# ... edit file ...

# 4. Validate
python .agents/skills/skill-creator/scripts/quick_validate.py \
  .agents/skills/problem-skill/

# 5. Test
python test_skill.py --skill .agents/skills/problem-skill/

# 6. Update version
# Edit frontmatter: version: 1.0.1

# Done
```

### New Skill from Template

```bash
# 1. Initialize
python .agents/skills/skill-creator/scripts/init_skill.py my-new-skill

# 2. Edit content
code .agents/skills/my-new-skill/SKILL.md

# 3. Add examples
mkdir .agents/skills/my-new-skill/examples
cp template.py .agents/skills/my-new-skill/examples/demo.py

# 4. Validate
python .agents/skills/skill-creator/scripts/quick_validate.py \
  .agents/skills/my-new-skill/

# 5. Test
python test_skill.py --skill .agents/skills/my-new-skill/

# 6. Package
python .agents/skills/skill-creator/scripts/package_skill.py \
  .agents/skills/my-new-skill/

# 7. Install
# Copy .skill file to agents
```

## Anti-Patterns to Avoid

### Workflow Mistakes

1. **No validation** - Always run quick_validate.py
2. **No testing** - Always test examples work
3. **Big bang changes** - Make incremental updates
4. **No versioning** - Always bump version
5. **No documentation** - Update references/

### Process Mistakes

1. **Editing without reading** - Understand before changing
2. **Skipping regression tests** - Verify nothing broke
3. **No peer review** - Get second eyes on changes
4. **Ignoring metrics** - Use data to guide changes
5. **Infrequent updates** - Skills need regular maintenance

## Workflow Selection Guide

| Goal                  | Primary Workflow          | Secondary           |
| --------------------- | ------------------------- | ------------------- |
| Create new skill      | New Skill Development     | Testing             |
| Fix bug               | Skill Modification        | Regression Testing  |
| Add feature           | Skill Modification        | Integration Testing |
| Improve performance   | Performance Optimization  | Benchmarking        |
| Address user feedback | User Feedback Integration | Testing             |
| Maintenance           | Skill Maintenance         | Review              |
| Team collaboration    | Collaborative Workflows   | Review Process      |
