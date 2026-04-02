---
name: skill-creator
description: Create, evaluate, and improve agent skills
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
version: 1.0.0
author: d-oit
tags: [skills, development, evaluation]
---

# skill-creator

A comprehensive toolkit for creating, evaluating, and improving AI agent skills.

## Overview

Skills are reusable instruction sets that enable agents to perform specialized tasks effectively. The skill-creator toolkit provides tools for:

- Creating skills from scratch
- Modifying and improving existing skills
- Evaluating skill performance
- Packaging and distributing skills

## Creating Skills from Scratch

### 1. Define the Skill Purpose

Before writing code, clearly define:

- What problem does this skill solve?
- What tasks will agents perform with this skill?
- Who will use this skill?

### 2. Create the SKILL.md

The SKILL.md is the core of any skill. It must:

- Include proper frontmatter (see requirements below)
- Provide clear, actionable instructions
- Stay under 250 lines (maintainability rule)
- Include practical examples
- Reference additional resources when needed

### 3. Frontmatter Requirements

```yaml
---
name: skill-name
description: Clear, concise description of what this skill does
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
version: 1.0.0
author: your-name
tags: [tag1, tag2, tag3]
---
```

### 4. Structure the Content

```markdown
# Skill Name

## Overview

Brief description and purpose

## Quick Start

Essential commands or patterns

## Main Sections

- Detailed instructions
- Code examples
- Common patterns

## References

Links to detailed docs
```

## Modifying Existing Skills

### When to Modify vs. Create New

**Modify existing skill when:**

- Adding a small feature or fix
- Improving documentation
- Fixing bugs
- Adding examples

**Create new skill when:**

- Target audience differs significantly
- Core purpose is different
- Would make original skill too complex
- Conflicts with existing patterns

### Modification Process

1. Read the existing SKILL.md
2. Identify what needs changing
3. Maintain the 250-line limit
4. Update version in frontmatter
5. Test the modified skill
6. Update any references

## Measuring Skill Performance

### Key Metrics

1. **Success Rate**: Percentage of tasks completed successfully
2. **Efficiency**: Time/computation to complete tasks
3. **Accuracy**: Quality of outputs against expectations
4. **Coverage**: Range of scenarios handled

### Benchmarking

Create test scenarios that cover:

- Common use cases
- Edge cases
- Error conditions
- Different input formats

Use the aggregate_benchmark.py script to collect and analyze results.

## Best Practices

### Skill Design

1. **Focus on one domain** - Don't try to solve everything
2. **Provide concrete examples** - Abstract instructions are hard to follow
3. **Use clear language** - Avoid jargon or explain it
4. **Include error handling** - What to do when things go wrong
5. **Reference external docs** - Don't duplicate upstream documentation

### Technical Requirements

1. **250 line limit** - Forces clarity and maintainability
2. **Proper frontmatter** - Enables discovery and versioning
3. **No code comments as communication** - Use markdown for explanations
4. **No speculative URLs** - Only reference known, working resources
5. **Platform-aware paths** - Consider the runtime environment

### Maintenance

1. **Version your skills** - Use semantic versioning
2. **Document changes** - Keep a changelog
3. **Test regularly** - Skills may break as platforms evolve
4. **Gather feedback** - Users know best what works

## Evaluation Methodology

### Qualitative Evaluation

Assess skills based on:

1. **Clarity**: Are instructions easy to follow?
2. **Completeness**: Are all necessary steps included?
3. **Accuracy**: Is the information correct?
4. **Relevance**: Does it solve the right problems?
5. **Usability**: Can agents actually use it effectively?

### Quantitative Evaluation

Measure:

1. **Success rate** from benchmark runs
2. **Time to completion** for standard tasks
3. **Error frequency** and types
4. **Coverage percentage** of test cases
5. **User satisfaction** ratings

### Continuous Improvement

1. Run benchmarks regularly
2. Analyze failure patterns
3. Update skills based on results
4. A/B test improvements
5. Document learnings

## Using the Toolkit

### Initialize a New Skill

```bash
python .agents/skills/skill-creator/scripts/init_skill.py my-new-skill
```

This creates the directory structure and starter SKILL.md.

### Validate a Skill

```bash
python .agents/skills/skill-creator/scripts/quick_validate.py /path/to/skill
```

Checks frontmatter, line count, and structure.

### Package for Distribution

```bash
python .agents/skills/skill-creator/scripts/package_skill.py /path/to/skill
```

Creates a .skill file for sharing or installation.

### Run Benchmarks

```bash
# Run individual test
python test_skill.py

# Aggregate results
python .agents/skills/skill-creator/scripts/aggregate_benchmark.py ./benchmark-results/
```

## References

- [Best Practices](references/best-practices.md) - Detailed best practices guide
- [Evaluating Skills](references/evaluating-skills.md) - How to evaluate skill output quality
- [Output Patterns](references/output-patterns.md) - Common output patterns for agents
- [Workflows](references/workflows.md) - Workflow patterns for skill development

## Examples

### Example: Creating a Database Skill

```bash
# Initialize
python .agents/skills/skill-creator/scripts/init_skill.py database-queries

# Edit SKILL.md with specific instructions
# Add examples for common queries
# Include connection patterns

# Validate
python .agents/skills/skill-creator/scripts/quick_validate.py .agents/skills/database-queries/
```

## Version History

- 1.0.0 (2025-01-21) - Initial release with full toolkit
