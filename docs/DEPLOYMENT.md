# Deployment Guide

## Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- GitHub account
- GitHub CLI (`gh`) installed and authenticated

## Step 1: Clone and Setup

```bash
# Clone repository
git clone https://github.com/do-ops885/do-deal-relay.git
cd do-deal-relay

# Install dependencies
npm install

# Verify GitHub CLI
gh auth status
```

## Step 2: Configure Cloudflare

### Install Wrangler
```bash
npm install -g wrangler
```

### Login to Cloudflare
```bash
wrangler login
```

### Create KV Namespaces
```bash
# Create production namespaces
wrangler kv:namespace create "DEALS_PROD"
# Returns: {"id": "<PROD_ID>"}

wrangler kv:namespace create "DEALS_STAGING"
# Returns: {"id": "<STAGING_ID>"}

wrangler kv:namespace create "DEALS_LOG"
# Returns: {"id": "<LOG_ID>"}

wrangler kv:namespace create "DEALS_LOCK"
# Returns: {"id": "<LOCK_ID>"}

wrangler kv:namespace create "DEALS_SOURCES"
# Returns: {"id": "<SOURCES_ID>"}
```

### Update wrangler.toml
Edit `wrangler.toml` and replace placeholder IDs:
```toml
[[kv_namespaces]]
binding = "DEALS_PROD"
id = "<PASTE_PROD_ID_HERE>"

[[kv_namespaces]]
binding = "DEALS_STAGING"
id = "<PASTE_STAGING_ID_HERE>"

# ... etc for all 5 namespaces
```

## Step 3: Configure GitHub

### Set Repository Secrets
In your GitHub repository:

1. Go to Settings > Secrets and variables > Actions
2. Add `CLOUDFLARE_API_TOKEN`:
   - Create token at https://dash.cloudflare.com/profile/api-tokens
   - Use "Edit Cloudflare Workers" template
   - Add permissions: `Zone:Read`, `Workers Scripts:Edit`

### Verify GitHub Actions
The repository includes:
- `.github/workflows/ci.yml` - Runs on PRs
- `.github/workflows/deploy.yml` - Deploys on push to main

## Step 4: Local Testing

### Type Check
```bash
npx tsc --noEmit
```

### Run Tests
```bash
npm test
```

### Run Validation Script
```bash
./scripts/validate-codes.sh
```

### Local Development Server
```bash
wrangler dev
```

Server runs at `http://localhost:8787`

Test endpoints:
```bash
curl http://localhost:8787/health
curl http://localhost:8787/deals
curl http://localhost:8787/metrics
```

## Step 5: Deploy to Production

### Manual Deploy
```bash
wrangler deploy --env production
```

### Automated Deploy (GitHub Actions)
Push to main branch:
```bash
git add .
git commit -m "feat: ready for production"
git push origin main
```

GitHub Actions will:
1. Run tests
2. Type check
3. Deploy to Cloudflare
4. Verify deployment

## Step 6: Verify Deployment

### Health Check
```bash
curl https://your-worker.workers.dev/health
```

### Check Metrics
```bash
curl https://your-worker.workers.dev/metrics
```

### Trigger Discovery
```bash
curl -X POST https://your-worker.workers.dev/api/discover
```

### Check Deals
```bash
curl https://your-worker.workers.dev/deals
```

## Step 7: Configure Cron

The system runs every 6 hours automatically via Cron Triggers (configured in `wrangler.toml`).

To verify:
```bash
wrangler triggers list
```

## Environment Variables

### Required
- `GITHUB_REPO` - Set in `wrangler.toml` (e.g., "username/repo")
- `NOTIFICATION_THRESHOLD` - High-value threshold (default: 100)

### Optional (for notifications)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_CHAT_ID` - Target chat ID

### GitHub Actions Only
- `CLOUDFLARE_API_TOKEN` - API token for deployment
- `GITHUB_TOKEN` - Already set by GitHub Actions

## Troubleshooting

### TypeScript Errors
```bash
# Check types
npx tsc --noEmit

# Fix auto-fixable issues
npx tsc --noEmit --fix
```

### KV Errors
```bash
# List namespaces
wrangler kv:namespace list

# Verify IDs match wrangler.toml
```

### Deployment Failures
```bash
# Check logs
wrangler tail

# Deploy with debug
wrangler deploy --env production --debug
```

### GitHub Actions Failures
1. Check repository secrets are set
2. Verify `CLOUDFLARE_API_TOKEN` has correct permissions
3. Check Actions logs for details

## Security Checklist

Before production:
- [ ] No secrets in code (run `./scripts/validate-codes.sh`)
- [ ] All dependencies audited (`npm audit`)
- [ ] KV namespaces created
- [ ] GitHub token configured
- [ ] Cloudflare token configured
- [ ] Tests passing
- [ ] Validation script passing
- [ ] .gitignore configured

## Post-Deployment

### Monitor
- Check `/health` endpoint regularly
- Review logs in Cloudflare dashboard
- Monitor GitHub Issues for notifications

### Update
- Edit sources in `worker/config.ts`
- Commit and push (auto-deploy)
- Or run `wrangler deploy` manually

## Rollback

If issues detected:
```bash
# Deploy previous version
git checkout <previous-commit>
wrangler deploy --env production
```

Or via Cloudflare dashboard:
1. Go to Workers & Pages
2. Select your worker
3. Go to Deployments
4. Rollback to previous version
