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

## Required Inputs

```text
CONTENT: Code, text, or output to review
TYPE: (code/docs/config/tests/other)
STANDARD: Acceptable quality threshold
```

## Quick Detection Patterns

### Code Slop Markers

| Pattern            | Slop Example                      | Better                                    |
| ------------------ | --------------------------------- | ----------------------------------------- |
| Generic comments   | `// This function processes data` | Explain _why_, not _what_                 |
| Placeholder errors | `catch (e) { console.log(e) }`    | Handle specific error types with recovery |
| Empty TODOs        | `// TODO: Implement`              | Throw error or include issue reference    |
| Generic names      | `handleData(data)`                | `extractDealMetrics(rawPost)`             |

### Content Slop Markers

| Pattern           | Slop Example                       | Better                           |
| ----------------- | ---------------------------------- | -------------------------------- |
| Fluffy intros     | "In today's fast-paced world..."   | Specific problem + solution      |
| Vague lists       | "Easy to use, Fast, Great support" | Quantified benefits with context |
| Boilerplate steps | "1. Install 2. Configure 3. Run"   | Exact commands with real values  |

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

## Manual Review Prompts

Ask yourself:

1. Would I understand this if I read it 6 months from now?
2. Could a competitor copy this without understanding our domain?
3. Are there numbers/metrics or just adjectives?
4. Would a human expert write it this way?
5. Is there a clear next action?

## References

- [references/examples.md](references/examples.md) - Detailed before/after comparisons and detection scripts
