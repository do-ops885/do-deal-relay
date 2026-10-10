# Skills - Authoring Guide

> **Harness role: Feedforward guides (computational + inferential).** Skills provide procedural knowledge that steers agents toward correct behavior before they act. Each skill encodes domain-specific patterns that increase the probability of first-attempt success. See `agents-docs/HARNESS.md` for the full framework.
>
> Single Source of Truth: AGENTS.md. Skill index: `.agents/skills/README.md`.

## Canonical Location

All skills live in `.agents/skills/` (the canonical source). Claude Code, Gemini CLI and Qwen Code read it through symlinks; OpenCode reads the canonical path.

```bash
./scripts/setup-skills.sh       # create symlinks after clone
./scripts/validate-skills.sh    # verify symlinks, frontmatter, sections
```

## SKILL.md Standards

Every `SKILL.md` must contain:

1. **YAML frontmatter** with `name` and `description`. The description is the trigger surface: state scope and triggers, not marketing.
2. **`## Rationalizations`** - a `| Concern | Counter-Argument |` table naming the excuses an agent would use to cut corners on *this* skill and answering each one.
3. **`## Red Flags`** - a `- [ ]` checklist of skill-specific early-warning behaviors.
4. **<= 250 lines** (`MAX_LINES_PER_SKILL_MD` in `agents-docs/hard-constraints.md`).

> **Harness note:** Rationalizations are feedforward guides; Red Flags are both guides and informal sensors.

Rationalizations and Red Flags are per-skill content. Copy-pasted boilerplate shared with another skill is a defect, not a template, and fails the hygiene sensor.

## Progressive Disclosure

Skills prevent instruction budget exhaustion. Keep `SKILL.md` as the entry point and move depth into `reference/` files that the agent opens only when needed.

## Directory Structure

```text
.agents/skills/
+-- README.md           # index of every skill (checked by the hygiene sensor)
+-- skill-rules.json    # trigger keywords for activation (validated against existing skills)
+-- skill-name/
    +-- SKILL.md        # primary instructions (<= 250 lines)
    +-- reference/      # detailed docs (some upstream skills use references/)
    +-- scripts/        # executable helpers referenced from SKILL.md
    +-- evals/evals.json
```

Every relative link inside a `SKILL.md` (`reference/`, `references/`, `scripts/`, `evals/`) must resolve, either inside the skill directory or at the repository root.

## Sensors

| Sensor | Enforces |
| --- | --- |
| `./scripts/validate-skills.sh` | symlink integrity, frontmatter, `## Rationalizations`, `## Red Flags` |
| `./scripts/skill-eval-check.sh` | the above plus the 250-line limit, shared boilerplate between skills, dead local links, README index drift, `skill-rules.json` integrity |
| `./scripts/skill-splitter.sh` | split plan for an oversized SKILL.md (dry-run by default, `--apply` to write) |
| `./scripts/quality_gate.sh` | runs both sensors as checks 11 and 11.5 before push |

## Adding a Skill

1. Create `.agents/skills/<skill-name>/SKILL.md` with frontmatter, a core workflow, `## Rationalizations` and `## Red Flags`.
2. Add `reference/`, `scripts/` and `evals/evals.json` as needed.
3. Register trigger keywords in `.agents/skills/skill-rules.json`.
4. Add the skill to the index in `.agents/skills/README.md`.
5. Run `./scripts/setup-skills.sh && ./scripts/skill-eval-check.sh`.

## References

| Resource | Location |
| --- | --- |
| Skill index | `.agents/skills/README.md` |
| Skill creation and evaluation | `.agents/skills/skill-creator/`, `.agents/skills/skill-evaluator/` |
| Hard limits | `agents-docs/hard-constraints.md` |
| Quality criteria | `agents-docs/quality-standards.md` |
