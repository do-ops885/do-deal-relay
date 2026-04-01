# Quick Start Guide - do-deal-relay

Get the AI-powered deal discovery system running in under 10 minutes.

## Prerequisites

Before you begin, ensure you have:

| Tool                                                                                   | Version         | Purpose                      |
| -------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| [Git](https://git-scm.com/)                                                            | Latest          | Clone the repository         |
| [Node.js](https://nodejs.org/)                                                         | >= 18.0.0       | Runtime environment          |
| [npm](https://www.npmjs.com/)                                                          | >= 9.0.0        | Package management           |
| [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) | Latest          | Deploy to Cloudflare Workers |
| [Cloudflare account](https://dash.cloudflare.com/sign-up)                              | Free tier works | Cloud infrastructure         |

### Install Wrangler CLI

```bash
# Install globally
npm install -g wrangler

# Or use npx (no install needed)
npx wrangler --version

# Authenticate with Cloudflare
wrangler login
```

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/do-ops885/do-deal-relay.git
cd do-deal-relay

# Verify structure
ls -la
# Should see: worker/, scripts/, tests/, package.json, wrangler.toml
```

## Step 2: Install Dependencies

```bash
# Install all project dependencies
npm install

# Verify installation
npm run lint
```

This installs:

- **Runtime**: `agent-browser` for web discovery, `zod` for validation
- **Development**: TypeScript, Vitest, Wrangler, Miniflare

## Step 3: Configure Environment

### 3.1 Review wrangler.toml

The project uses **5 KV namespaces** for different data types:

| Binding         | Purpose                        |
| --------------- | ------------------------------ |
| `DEALS_PROD`    | Active deals in production     |
| `DEALS_STAGING` | Pending validation deals       |
| `DEALS_LOG`     | Pipeline execution logs        |
| `DEALS_LOCK`    | Distributed locking            |
| `DEALS_SOURCES` | Source registry & trust scores |

```bash
# View current configuration
cat wrangler.toml
```

### 3.2 Create Local Environment File

```bash
# Create local dev secrets (not committed)
touch .dev.vars
```

Add your secrets to `.dev.vars`:

```bash
# Optional: GitHub integration for PR creation
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Optional: Telegram notifications
TELEGRAM_BOT_TOKEN=1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
TELEGRAM_CHAT_ID=-1001234567890
```

> **Security**: `.dev.vars` is gitignored by default. Never commit secrets.

### 3.3 Create KV Namespaces (First Time Only)

If deploying to a new Cloudflare account, create the KV namespaces:

```bash
# Create production namespaces
wrangler kv:namespace create "DEALS_PROD"
wrangler kv:namespace create "DEALS_STAGING"
wrangler kv:namespace create "DEALS_LOG"
wrangler kv:namespace create "DEALS_LOCK"
wrangler kv:namespace create "DEALS_SOURCES"

# Update wrangler.toml with the returned IDs
```

## Step 4: Setup Skills

The project uses **multi-agent coordination skills** for the 9-agent pipeline:

```bash
# Setup skill symlinks for all agent CLIs
./scripts/setup-skills.sh
```

This creates symlinks in:

- `.claude/skills/` - For Claude CLI
- `.gemini/skills/` - For Gemini CLI
- `.qwen/skills/` - For Qwen CLI

Available skills include:

- `agent-coordination` - Multi-agent task management
- `cloudflare` - Workers, KV, Durable Objects
- `goap-agent` - Goal-oriented planning
- `wrangler` - Deployment & management

## Step 5: Test the System

### 5.1 Run Unit Tests

```bash
# Run full test suite
npm run test:ci

# Run with watch mode (development)
npm run test
```

### 5.2 Start Local Development Server

```bash
# Start Wrangler dev server
npm run dev

# Or use Wrangler directly
wrangler dev
```

You should see:

```
⬣ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

### 5.3 Test the Endpoints

In another terminal, test the API:

```bash
# Health check
curl http://localhost:8787/health

# Get active deals
curl http://localhost:8787/deals

# Get full snapshot with metadata
curl http://localhost:8787/deals.json

# Check pipeline status
curl http://localhost:8787/api/status

# View metrics (Prometheus format)
curl http://localhost:8787/metrics
```

### 5.4 Trigger Manual Discovery

```bash
# Trigger the 9-agent discovery pipeline manually
curl -X POST http://localhost:8787/api/discover

# Expected response:
# {"success": true, "message": "Discovery pipeline triggered"}
```

### 5.5 Submit a Test Deal

```bash
# Submit a new deal manually
curl -X POST http://localhost:8787/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/deal",
    "code": "TEST2024",
    "source": "manual_test",
    "metadata": {
      "title": "Test Deal",
      "description": "A test deal for validation",
      "category": ["test"],
      "tags": ["test", "demo"],
      "reward": {
        "type": "cash",
        "value": 50,
        "currency": "USD"
      }
    }
  }'
```

## Step 6: Deploy (Optional)

### 6.1 Deploy to Staging

```bash
# Deploy to staging environment
wrangler deploy --env staging
```

### 6.2 Run Quality Gates

```bash
# Run all validation gates before production
./scripts/quality_gate.sh

# Silent on success, loud on failure
```

### 6.3 Deploy to Production

```bash
# Deploy to production
npm run deploy

# Or explicitly
wrangler deploy
```

You should see:

```
✨ Successfully deployed to:
https://do-deal-relay.YOUR_SUBDOMAIN.workers.dev
```

### 6.4 Verify Deployment

```bash
# Replace with your actual worker URL
WORKER_URL="https://do-deal-relay.YOUR_SUBDOMAIN.workers.dev"

# Health check
curl "$WORKER_URL/health"

# Verify pipeline is ready
curl "$WORKER_URL/api/status"
```

## The 9-Agent Pipeline

The system uses a **9-phase state machine** for deal discovery:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   init   │───▶│ discover │───▶│ normalize│───▶│  dedupe  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                    │
┌──────────┐    ┌──────────┐    ┌──────────┐      ▼
│ finalize │◀───│  verify  │◀───│  publish │◀──┌──────────┐
└──────────┘    └──────────┘    └──────────┘   │ validate │
    ▲                                          └──────────┘
    │                                               │
┌───┴──────┐                                       ▼
│revert/   │                                  ┌──────────┐
│quarantine│◀─────────────────────────────────│   score  │
└──────────┘                                  └──────────┘
```

| Phase         | Agent     | Purpose                       |
| ------------- | --------- | ----------------------------- |
| **init**      | System    | Initialize run, acquire locks |
| **discover**  | Scout     | Web discovery from sources    |
| **normalize** | Parser    | Extract & normalize deal data |
| **dedupe**    | Filter    | Remove duplicates             |
| **validate**  | Validator | 9-gate quality checks         |
| **score**     | Scorer    | Trust & value scoring         |
| **stage**     | Publisher | Prepare for release           |
| **publish**   | Deployer  | Write to production KV        |
| **verify**    | Auditor   | Verify deployment             |
| **finalize**  | Cleaner   | Complete & notify             |

The pipeline runs automatically every **6 hours** via cron triggers.

## Troubleshooting

### Issue: `wrangler login` fails

```bash
# Try browserless authentication
wrangler login --browserless

# Or use API token
wrangler config
```

### Issue: KV namespace not found

```bash
# List your KV namespaces
wrangler kv:namespace list

# Update wrangler.toml with correct IDs
```

### Issue: Tests fail with module errors

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Issue: Local dev server won't start

```bash
# Check port availability
lsof -i :8787

# Use different port
wrangler dev --port 8788
```

### Issue: Pipeline shows "locked" status

```bash
# Check current status
curl http://localhost:8787/api/status

# Wait for current run to complete, or check logs
curl http://localhost:8787/api/log
```

### Issue: TypeScript compilation errors

```bash
# Check types without emitting
npm run lint

# Get detailed error info
npx tsc --noEmit --pretty
```

## Next Steps

Now that you have the system running:

| Resource               | Location                                                           | Purpose                |
| ---------------------- | ------------------------------------------------------------------ | ---------------------- |
| **API Reference**      | [docs/API.md](docs/API.md)                                         | Endpoint documentation |
| **Architecture**       | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) | System design          |
| **Deployment**         | [agents-docs/DEPLOYMENT.md](agents-docs/DEPLOYMENT.md)             | Production setup       |
| **Agent Coordination** | [AGENTS.md](AGENTS.md)                                             | Multi-agent protocols  |
| **Contributing**       | [CONTRIBUTING.md](CONTRIBUTING.md)                                 | Development guidelines |
| **Security**           | [SECURITY.md](SECURITY.md)                                         | Security policy        |

### Common Development Tasks

```bash
# Run validation gates
./scripts/quality_gate.sh

# Initialize KV with test data
./scripts/init-kv-data.sh

# Dry run the pipeline
./scripts/dry-run.sh

# Check code style
npm run format
```

### API Examples

```bash
# Get deals filtered by category
curl "http://localhost:8787/deals?category=saas&limit=10"

# Get deals with minimum reward
curl "http://localhost:8787/deals?min_reward=100"

# Export logs as JSONL
curl "http://localhost:8787/api/log?format=jsonl"

# Get logs for specific run
curl "http://localhost:8787/api/log?run_id=abc-123&count=50"
```

## Support

- **Issues**: [GitHub Issues](https://github.com/do-ops885/do-deal-relay/issues)
- **Status**: Check `/health` endpoint
- **Logs**: Access via `/api/log` endpoint

---

**Version**: 0.2.0
**License**: MIT
**Last Updated**: 2024
