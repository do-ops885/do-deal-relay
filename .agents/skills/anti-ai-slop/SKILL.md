---
name: anti-ai-slop
description: "Prevent low-quality, repetitive, or 'sloppy' AI-generated code and content. Use when reviewing AI outputs, establishing code standards, or detecting AI-generated boilerplate."
version: 1.0.0
author: d-oit
tags: [quality, review, ai-detection, code-standards, anti-patterns]
---

# Anti-AI-Slop

Detect and prevent low-quality AI-generated code, content, and outputs that lack depth, specificity, or human value.

## When To Use

- Reviewing AI-generated code, docs, or research before committing
- Checking for repetitive AI patterns and establishing standards
- Auditing codebase for low-quality AI content
- Writing changelogs or documentation to avoid clichés

## Required Inputs

```text
CONTENT: Code, text, or output to review
TYPE: (code/docs/config/tests/other)
STANDARD: Acceptable quality threshold
```

## Prohibited AI-Slop Words

Avoid these vague, overused terms in all documentation:

| Slop Word        | Replace With                                 |
| ---------------- | -------------------------------------------- |
| new              | specific version number or "added"           |
| enhanced         | specific improvement (faster, smaller, etc.) |
| leverage         | "use" or specific action                     |
| robust           | specific resilience measure                  |
| seamless         | specific integration detail                  |
| cutting-edge     | specific technology or version               |
| innovative       | specific differentiator                      |
| revolutionary    | specific breakthrough                        |
| next-generation  | specific version or upgrade                  |
| state-of-the-art | specific capability                          |
| transformative   | specific measurable change                   |
| groundbreaking   | specific achievement                         |
| best-in-class    | specific metric or comparison                |
| world-class      | specific standard met                        |
| unparalleled     | specific unique feature                      |
| unmatched        | specific comparison data                     |
| superior         | specific advantage                           |
| optimized        | specific measurable improvement              |
| streamlined      | specific simplification                      |
| comprehensive    | specific coverage detail                     |
| holistic         | specific integrated approach                 |
| end-to-end       | specific workflow coverage                   |
| turnkey          | specific setup steps                         |
| out-of-the-box   | specific default behavior                    |
| user-friendly    | specific usability improvement               |
| intuitive        | specific design decision                     |
| powerful         | specific capability metric                   |
| flexible         | specific configuration option                |
| scalable         | specific performance at scale                |
| efficient        | specific resource reduction                  |
| advanced         | specific technical detail                    |
| modern           | specific current standard                    |
| sleek            | specific design element                      |
| elegant          | specific implementation choice               |

## Quick Detection Patterns

### Code Slop Markers

| Pattern            | Slop Example                      | Better                                    |
| ------------------ | --------------------------------- | ----------------------------------------- |
| Generic comments   | `// This function processes data` | Explain _why_, not _what_                 |
| Placeholder errors | `catch (e) { console.log(e) }`    | Handle specific error types with recovery |
| Empty TODOs        | `// TODO: Implement`              | Throw error or include issue reference    |
| Generic names      | `handleData(data)`                | `extractDealMetrics(rawPost)`             |

### Content Slop Markers

| Pattern           | Slop Example                       | Better                                 |
| ----------------- | ---------------------------------- | -------------------------------------- |
| Fluffy intros     | "In today's fast-paced world..."   | Specific problem + solution            |
| Vague lists       | "Easy to use, Fast, Great support" | Quantified benefits with context       |
| Boilerplate steps | "1. Install 2. Configure 3. Run"   | Exact commands with real values        |
| Slop words        | "New enhanced robust feature"      | "Added caching reduces latency by 40%" |

## Quality Checklist

### Code Review

- [ ] Names are specific (`extractDealMetrics` not `handleData`)
- [ ] Comments explain _why_, not _what_
- [ ] Error handling matches error types
- [ ] No TODOs without issue numbers
- [ ] Tests cover realistic scenarios

### Documentation Review

- [ ] First sentence is specific and compelling
- [ ] No buzzwords without context
- [ ] Examples use real data, not foo/bar/baz
- [ ] Installation steps are complete and tested
- [ ] API docs have request/response examples
- [ ] No prohibited slop words used

### Research Output Standards

1. **Quantify everything**: "High engagement" → "342 upvotes in 24h"
2. **Source everything**: Include URLs to original sources
3. **Timestamp everything**: Research expires; note when collected
4. **Differentiate similar deals**: What makes X different from Y?
5. **Include next action**: Research without recommendation is useless

## Research Report Template

```markdown
# Research Report: {{topic}}

**Date**: {{date}}
**Sources**: {{source_list}}
**Agent**: {{agent_name}}

## Summary

Found {{count}} relevant items. {{brief_why_they_matter}}.

## Detailed Findings

### 1. {{specific_name}}

- **URL**: {{direct_link}}
- **Discovered**: {{timestamp}}
- **Key Metrics**: {{quantified_data}}
- **Relevance**: {{specific_to_use_case}}
- **Next Step**: {{actionable_recommendation}}

## Confidence Assessment

- Data quality: High/Medium/Low
- Source reliability: High/Medium/Low
- Recommendations: High/Medium/Low confidence

## Raw Data

Saved to: {{file_path}}
```

## Changelog Entry Standards

```markdown
### Added

- Specific feature with measurable outcome
- Exact capability with version reference

### Changed

- Specific behavior from X to Y
- Measurable improvement (percentage, time, size)

### Fixed

- Specific bug with root cause
- Exact error condition resolved

### Security

- Specific vulnerability addressed
- Exact protection implemented
```

## Manual Review Prompts

Ask yourself:

1. Would I understand this if I read it 6 months from now?
2. Could a competitor copy this without understanding our domain?
3. Are there numbers/metrics or just adjectives?
4. Would a human expert write it this way?
5. Is there a clear next action?
6. Have I used any prohibited slop words?

## References

- [references/examples.md](references/examples.md) - Detailed before/after comparisons and detection scripts
