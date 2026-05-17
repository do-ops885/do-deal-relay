# Project Structure

**Reference**: Comprehensive directory structure for the deal discovery system
**Version**: 0.1.3

## Directory Tree

```
├── .github/workflows/    # CI/CD pipelines
├── .agents/skills/       # Shared agent capabilities
├── agents-docs/          # Machine-facing specifications
├── docs/                 # Human-facing documentation
├── scripts/              # Automation & Quality gates
├── tests/                # Verification suite
├── worker/               # Core logic (Cloudflare Workers)
│   ├── pipeline/         # State machine stages (normalize, validate, etc.)
│   ├── lib/              # Shared utilities (mcp, auth, storage, etc.)
│   ├── routes/           # API & MCP entry points
│   └── types.ts          # Core type definitions
├── reports/              # Permanent analysis (committed)
├── plans/                # Execution plans
├── temp/                 # Local state & logs (gitignored)
└── public/               # Static assets
```

## Root Directory Policy

**CRITICAL**: Only standard configuration files belong in root.

### Allowed Files (Root Only)
- `.gitignore`, `.eslintignore`, `.prettierignore`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`
- `wrangler.jsonc`
- `AGENTS.md`, `README.md`, `CLAUDE.md`, `GEMINI.md`, `QWEN.md`
- `VERSION`, `NOTICE`, `LICENSE`

### Folder Ownership
| Directory | Purpose | Retention |
| :--- | :--- | :--- |
| `worker/` | Production source code | Permanent |
| `agents-docs/` | Behavioral contracts | Permanent |
| `docs/` | External documentation | Permanent |
| `reports/` | Investigation outputs | Permanent |
| `scripts/` | Tooling & Hooks | Permanent |
| `temp/` | Transient session data | Session-only |

## Related Documentation
- [AGENTS.md](../AGENTS.md) - Master coordination hub
- [SYSTEM_REFERENCE.md](./SYSTEM_REFERENCE.md) - Technical specs
- [GUARD_RAILS.md](./GUARD_RAILS.md) - File & security constraints
