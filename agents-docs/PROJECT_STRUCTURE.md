# Project Structure

**Reference**: Comprehensive directory structure for the deal discovery system
**Version**: 0.1.1
**Last Updated**: 2026-04-02

## Directory Tree

```
├── CLAUDE.md, GEMINI.md, QWEN.md  # Agent CLI specs (root level)
├── AGENTS.md                      # Master coordination hub
├── .agents/skills/                # Coordination skills
├── agents-docs/                   # System documentation
│   ├── coordination/              # Handoff logs, blockers, swarm configs
│   ├── agents/                    # Agent specifications
│   └── handoffs/                  # Handoff templates
├── temp/                          # State, reports, analysis docs (gitignored)
│   ├── analysis-*.md              # Swarm analysis results
│   └── research-*.md              # Web research results
├── scripts/                       # CLI tools
│   ├── cli/                       # Modular CLI implementation
│   ├── quality_gate.sh            # Quality validation
│   └── validate-codes.sh          # Code validation
├── worker/                        # Cloudflare Worker source
│   ├── lib/
│   │   ├── referral-storage/      # Referral CRUD operations
│   │   └── research-agent/        # Web research implementation
│   ├── routes/                    # API route handlers
│   ├── email/                     # Email integration
│   └── types.ts                   # ReferralInput, Research schemas
└── docs/                          # Documentation
    └── API.md                     # API documentation
```

## Component Descriptions

| Directory                         | Purpose                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| **CLAUDE.md, GEMINI.md, QWEN.md** | Agent CLI specifications (root level for immediate access)          |
| **AGENTS.md**                     | Master coordination hub with quick start, protocols, and references |
| **.agents/skills/**               | Coordination skills for agent capabilities                          |
| **agents-docs/**                  | System documentation, handoff logs, swarm configs, agent specs      |
| **temp/**                         | State files, reports, analysis docs (gitignored)                    |
| **scripts/**                      | CLI tools and validation scripts                                    |
| **worker/**                       | Cloudflare Worker source code, API routes, storage                  |
| **docs/**                         | API documentation and user-facing docs                              |

## Root Directory Policy

**CRITICAL**: Only standard project files belong in root:

### Allowed in Root

- `package.json` - NPM manifest
- `package-lock.json` - NPM lockfile
- `tsconfig.json` - TypeScript config
- `vitest.config.ts` - Test runner config
- `wrangler.toml` - Cloudflare Workers config
- `README.md` - Main project documentation
- `LICENSE` - License file
- `VERSION` - Version file
- `CHANGELOG.md` - Version history
- `.gitignore` - Git ignore patterns

### Required Subfolder Usage

**ALL other files MUST use appropriate subfolders**:

| Content Type  | Target Location           |
| ------------- | ------------------------- |
| Documentation | `agents-docs/` or `docs/` |
| Reports/State | `temp/`                   |
| Scripts/Tools | `scripts/`                |
| Tests         | `tests/`                  |
| Source Code   | `worker/`                 |

## Related Documentation

- [Guard Rails](./guard-rails.md) - Complete rules and security guidelines
- [System Reference](./SYSTEM_REFERENCE.md) - High-level architecture overview
- [AGENTS.md](../AGENTS.md) - Coordination hub and quick start
