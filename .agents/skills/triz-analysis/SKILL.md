---
name: triz-analysis
description: Run a systematic TRIZ contradiction audit against a codebase, architecture, or workflow to identify hidden trade-offs and innovation opportunities.
category: analysis
---

# TRIZ Analysis

Systematic innovation audit for software systems, architectures, and workflows.

## Core Protocol

### Contradiction-First Approach

```
1. SCAN the scope
2. IDENTIFY contradiction: "Improving [X] causes [Y] to worsen"
3. CHECK if contradiction is real or apparent
4. RESOLVE using separation principles
5. DOCUMENT findings in analysis/
```

## Rationalizations
| Rationalization | Reality |
|-----------------|---------|
| "We don't have contradictions." | Every architectural choice is a trade-off (contradiction). Formalizing them reveals better solutions. |

## Red Flags
- [ ] Ignoring the worsening parameter when improving another.
- [ ] Failing to document the contradiction before proposing a fix.
