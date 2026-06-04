# Self-Learning Patterns - do-deal-relay

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

## Evidence-Based Learning
- When encountering a tool failure or a code bug, analyze the root cause before applying a fix.
- Document the "Red Flags" in skills to help future agent sessions avoid the same pitfalls.
