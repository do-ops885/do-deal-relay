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
