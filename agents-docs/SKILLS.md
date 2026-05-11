# Skills - Authoring Guide

> Single Source of Truth: AGENTS.md

## Canonical Location

All skills live in `.agents/skills/` (the canonical source).
Claude Code, Gemini CLI, and Qwen Code use symlinks; OpenCode reads directly.

Run `./scripts/setup-skills.sh` after cloning to create symlinks.
Run `./scripts/validate-skills.sh` to verify integrity.

## SKILL.md Standards

Every `SKILL.md` MUST include:
1. **YAML Frontmatter**: `name` and `description`.
2. **Rationalizations**: A table countering common excuses for cutting corners.
3. **Red Flags**: A checklist of early warning behaviors.

## Progressive Disclosure

Skills prevent instruction budget exhaustion. Load only when needed.

## Directory Structure
```
.agents/skills/
+-- skill-name/
    +-- SKILL.md          # Primary instructions (<= 250 lines)
    +-- reference/        # Detailed docs
    +-- scripts/          # Executable validation scripts
```
