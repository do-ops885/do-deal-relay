---
name: learn
description: Extract discoveries and update project-specific documentation.
---

# Learn Skill

Extract session learnings into scoped `AGENTS.md` files or project documentation.

## Instructions
1. Identify non-obvious patterns or gotchas discovered during the task.
2. Update the `Lessons Learned` table in the nearest `AGENTS.md`.
3. Run `./scripts/analyze-codebase.sh` to update self-learning rules.

## Rationalizations
| Rationalization | Reality |
|-----------------|---------|
| "I'll remember this." | You won't, and the next agent definitely won't. Documentation is externalized memory. |

## Red Flags
- [ ] Closing a task without updating the Lessons Learned table if a blocker was encountered.
