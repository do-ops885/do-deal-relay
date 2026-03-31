# Documentation Index

## Core Documentation

### System Overview

- **[AGENTS.md](../AGENTS.md)** - Agent coordination and system reference (root)
- **[README.md](../README.md)** - Quick start and system status (root)

### Technical Documentation

- **[API.md](API.md)** - Complete API reference and endpoint documentation
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Step-by-step deployment guide

### Legal & Compliance

- **[LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md)** - FTC, GDPR, CCPA compliance requirements

### Agent Documentation

See `../agents-docs/` directory for:

- Agent specifications
- Handoff protocols
- Coordination state
- Self-learning lessons

## Quick Navigation

### For Developers

1. Start with [API.md](API.md) for integration
2. Read [DEPLOYMENT.md](DEPLOYMENT.md) for setup
3. Check [AGENTS.md](../AGENTS.md) for architecture

### For Legal/Compliance

1. Read [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md)
2. Review API disclosure requirements
3. Check jurisdiction restrictions

### For DevOps

1. Follow [DEPLOYMENT.md](DEPLOYMENT.md)
2. Use `../scripts/validate-codes.sh` for validation
3. Monitor via `/health` and `/metrics` endpoints

## Document Structure

```
docs/
├── API.md                 # API documentation
├── DEPLOYMENT.md          # Deployment guide
├── LEGAL_COMPLIANCE.md    # Legal requirements
└── INDEX.md              # This file

agents-docs/
├── README.md              # Agent coordination hub
├── LESSONS.md             # Self-learning system
├── guard-rails.md         # Safety documentation
├── agents/                # Agent specifications
│   ├── test-agent.md
│   ├── validation-agent.md
│   └── ...
└── coordination/          # State tracking
    ├── state.json
    └── handoff-log.jsonl

.agents/skills/           # Coordination patterns
├── agent-coordination/   # Multi-agent orchestration
├── goap-agent/          # Goal-oriented planning
├── task-decomposition/  # Task breakdown
└── parallel-execution/  # Parallel execution

~/.agents/skills/        # External platform skills
├── cloudflare/          # Cloudflare platform
├── agents-sdk/         # Agent SDK guidance
├── durable-objects/    # Durable Objects
└── wrangler/           # Wrangler CLI
```

## Document Status

| Document            | Status      | Last Updated |
| ------------------- | ----------- | ------------ |
| API.md              | ✅ Complete | 2024-03-31   |
| DEPLOYMENT.md       | ✅ Complete | 2024-03-31   |
| LEGAL_COMPLIANCE.md | ✅ Complete | 2024-03-31   |
| AGENTS.md           | ✅ Complete | 2024-03-31   |

## Contributing

When adding documentation:

1. Place technical docs in `docs/`
2. Place agent docs in `agents-docs/agents/`
3. Update this INDEX.md
4. Follow markdown style guide
5. Keep under 500 lines per file
