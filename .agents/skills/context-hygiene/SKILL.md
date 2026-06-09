---
name: context-hygiene
description: >
  Context window management patterns for AI coding agents. Use when
  sessions get long, context feels bloated, or to prevent context rot.
  Triggers on "context", "session management", "context rot", "clear context",
  "reduce context", "context window".
---

# Context Hygiene

Manage context window to maximize reliability and minimize cost.

## When to Use

- Sessions exceed 30 minutes
- Agent starts making inconsistent changes
- Multiple unrelated tasks in one session
- Context feels bloated with irrelevant code

## Back-Pressure Priority

Implement verification in this order:
1. Typecheck / build (fast, deterministic)
2. Unit tests (validates logic)
3. Integration tests (validates behavior)
4. Lint / format (enforces style)

## Context Hygiene Rules

1. **`/clear` between unrelated tasks** — Don't carry context from task A into task B
2. **Use Glob/Grep** — Don't read entire files; search for specific patterns
3. **Sub-agents for research** — Noise stays in their window, not yours
4. **Progressive skill loading** — Load skills when needed, not at session start
5. **CLI over MCP** — Prefer well-known CLIs (GitHub, Docker) over MCP servers

## Anti-Patterns

- Running the full test suite after every change
- Reading large file trees into context
- Installing many MCP servers "just in case"
- One very long session for a multi-day project
- Using larger context windows as a substitute for context isolation

## Context Budget

| Item | Approximate Cost |
|------|-----------------|
| Tool descriptions | ~500 tokens each |
| File contents | ~4 tokens/line |
| Conversation messages | ~2 tokens/word |

Keep total context under 80% of model limit for best results.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "I need to see all the code to understand." | You need the right code, not all code. Use targeted searches. |
| "Clearing context loses my progress." | The plan and metrics persist. Context rot costs more than re-reading. |
| "Sub-agents add complexity." | They add isolation. The parent stays clean and focused. |

## Red Flags

- [ ] Session running > 30 minutes without /clear
- [ ] Reading entire files when you only need one function
- [ ] Agent making contradictory changes across commits
- [ ] Context window > 80% capacity
