---
name: self-fix-loop
description: Self-learning fix loop - commit, push, monitor CI, auto-fix failures.
---

# Self-Fix Loop Skill

Automated self-learning cycle: **commit → push → monitor → analyze failures → fix → retry**.

## Usage
```bash
./scripts/self-fix-loop.sh
```

## Rationalizations
| Rationalization | Reality |
|-----------------|---------|
| "I can fix it locally." | Local success != CI success. The loop ensures environment parity. |

## Red Flags
- [ ] Continuing the loop after 3+ identical failures (signals a deeper issue).
