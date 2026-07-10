# Self-Learning Patterns - do-deal-relay

> **Harness role: The steering loop mechanism.** This file defines how failures escalate from one-off events into permanent harness controls. It's the process that converts inferential feedback (LEARNINGS.md) into computational feedforward guides and sensors. See `agents-docs/HARNESS.md` for the full framework.

Guidelines for capturing and escalating repository-specific knowledge.

## Compound Engineering Pattern
The repository follows a compound-engineering approach where every correction is codified to prevent future regressions.

- **Rule 1**: Every correction becomes a rule (e.g., in `AGENTS.md` or a Skill).
- **Rule 2**: Every recurring regression becomes either a learning, a checklist item, or a hard constraint.
- **Rule 3**: Use `agents-docs/LEARNINGS.md` for event logs of failures and fixes.

## Escalation Path
Patterns should be escalated based on their recurrence and impact:

1. **Event Log**: Record the failure/fix in `agents-docs/LEARNINGS.md`.
2. **Skill Update**: If the fix is procedural, update the relevant skill in `.agents/skills/`.
3. **Hard Constraint**: If the fix requires strict enforcement, add it to `agents-docs/hard-constraints.md`.
4. **Guard Rail**: If the fix can be caught by a hook, add to `scripts/pre-commit-hook.sh` or `scripts/pre-push-hook.sh`.
5. **CI Gate**: If the fix requires workflow-level enforcement, add to `quality_gate.sh` or CI workflows.

### Escalation Decision Matrix

| Recurrence | Impact | Action |
|---|---|---|
| First occurrence | Any | Log in LEARNINGS.md |
| Second occurrence | Low | Update relevant skill |
| Second occurrence | High | Add hard constraint |
| Third+ occurrence | Any | Add guard rail or CI gate |
| Cannot be automated | Any | Add to accuracy-guardrails.md (inferential) |

## Evidence-Based Learning
- When encountering a tool failure or a code bug, analyze the root cause before applying a fix.
- Document the "Red Flags" in skills to help future agent sessions avoid the same pitfalls.
