---
name: agentic-abstention
description: Define the abstention protocol when environmental infeasibility makes further tool calls wasteful.
---

# Agentic Abstention Skill

## Purpose
When environmental infeasibility makes further tool calls wasteful, agents MUST abstain rather than continue in loops. This skill defines the abstention protocol.

Reference: AGENTS.md — Behavioral Rules, Rule 3

## When to Abstain

### Environment Infeasibility
- Missing required secrets (e.g., API keys, tokens)
- External service unavailable (e.g., Cloudflare dashboard down)
- Required permissions not granted (e.g., OAuth token scope)
- Network connectivity issues preventing tool execution

### Code Infeasibility
- Circular dependency that would require architectural redesign
- Breaking change in a pinned dependency
- Configuration locked by external system (e.g., Cloudflare dashboard)

### Knowledge Gaps
- Private/internal API without documentation
- Undocumented breaking change in dependency
- Domain-specific logic requiring human expertise

## Abstention Protocol

1. **Identify**: Detect the infeasibility before attempting the task
2. **Document**: Write findings in an ADR (`plans/`)
3. **Report**: Use the standard abstention format
4. **Exit**: Stop execution, do not retry

## Abstention Output Format
```json
{
  "timestamp": "ISO8601",
  "agent": "name",
  "task": "description",
  "abstained": true,
  "abstention_reason": "code",
  "stopped_at_step": N,
  "resume_hint": "What needs to change to unblock"
}
```

## Non-Abstention Cases
Do NOT abstain for:
- Fixable type errors
- Test failures with known fixes
- Lint warnings (these are fixable)
- Missing documentation (can be written)
- File size violations (can be split)

Only abstain when the issue is fundamentally unfixable without external intervention.

## Rationalizations
- "I'll just try one more time" — repeated retries produce the same error and consume credits without progress. Detect and document the infeasibility instead.
- "The CI must just be flaky, ignore it" — flakiness is a known condition; abstain only when the infeasibility is fundamental, not transient.
- "I can ask the user for the missing secret" — secrets must come via the project's own secret-management channel, not via prompt-injected values.
- "The wrapper script could work around this" — workarounds re-introduce the failure under load; an ADR is required when abstaining on a wrapper-bypassable issue.
- "We can pick this back up later, no need to document" — without an ADR and the abstention JSON entry, the next agent picks up a task with no resume hint.

## Red Flags
- An agent loops >5 times on the same error without producing new diagnostic information.
- Tool results are ignored (no log, no follow-up reasoning) after a hard failure.
- An abstention is reported with `stopped_at_step: 0` — this usually means the agent never even started; investigate the task spec.
- An `abstention_reason` of `"unknown"` — be specific: `"missing-secret"`, `"external-service-down"`, `"circular-dependency"`, etc.
- The same task is re-spawned within the same session without addressing the prior abstention's `resume_hint`.
