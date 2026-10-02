# .agents/skills/ - Canonical Skill Source

This is the **single canonical location** for all skills in this repository.

Claude Code, Gemini CLI, and Qwen Code use symlinks; OpenCode reads directly from `.agents/skills/`:

```
.claude/skills/<name>      -> ../../.agents/skills/<name>
.gemini/skills/<name>      -> ../../.agents/skills/<name>
.qwen/skills/<name>        -> ../../.agents/skills/<name>
```

## Setup

After cloning, run once to create all symlinks:

```bash
./scripts/setup-skills.sh
```

Validate symlinks are intact:

```bash
./scripts/validate-skills.sh
```

## Adding a New Skill

1. Create `.agents/skills/<skill-name>/SKILL.md` (see `agents-docs/SKILLS.md`)
2. Add `reference/` folder for detailed content (optional)
3. Run `./scripts/setup-skills.sh` to create symlinks for all CLI tools
4. The skill is now available in Claude Code, OpenCode, Gemini CLI, and Qwen Code

## Skills in This Repository

There are 58 skills in this library (51 authored in-repo, 7 vendored from
`cloudflare/skills` via `skills-lock.json`). The stale 10-row table previously
here has been replaced by a pointer to the full distilled catalog:

- **Full inventory, categories, redundancy clusters, and evals coverage**:
  [`agents-docs/SKILLS-DISTILLED.md`](../../agents-docs/SKILLS-DISTILLED.md)
- **Authoring standards** (frontmatter, rationalizations, red flags, 250-line
  cap): [`agents-docs/SKILLS.md`](../../agents-docs/SKILLS.md)
- **Per-skill usage**: load only as needed via `skill <name>` (progressive
  disclosure per AGENTS.md §5)
