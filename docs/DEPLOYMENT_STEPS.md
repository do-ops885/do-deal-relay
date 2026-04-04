# Deployment Guide - Manual Steps Required

## Status: Configuration Complete ✅

All automated deployment preparation steps have been completed:

- ✅ 5 KV namespaces created
- ✅ wrangler.jsonc updated with namespace IDs
- ✅ TypeScript compilation passing
- ✅ All 207 tests passing
- ✅ Security audit complete (Grade A-)

## Manual Action Required

To complete deployment, you must register a **workers.dev subdomain** via the Cloudflare Dashboard:

### Step 1: Register Workers.dev Subdomain

Visit: **https://dash.cloudflare.com/1192502f519a5ae3cbf3d934e6f33ef2/workers/onboarding**

Or follow these steps:

1. Log in to Cloudflare Dashboard
2. Navigate to **Workers & Pages**
3. Click **Create a Service**
4. Choose a subdomain name (e.g., `do-deal-relay`)
5. Complete the registration

### Step 2: Deploy to Staging

Once the subdomain is registered, run:

```bash
npx wrangler deploy --env staging
```

### Step 3: Verify Staging

Test the staging deployment:

```bash
# Check health endpoint
curl https://do-deal-relay-staging.<your-subdomain>.workers.dev/health

# Check metrics
curl https://do-deal-relay-staging.<your-subdomain>.workers.dev/metrics
```

Expected response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-03-31T..."
}
```

### Step 4: Deploy to Production

```bash
npx wrangler deploy
```

### Step 5: Set Secrets (Optional)

If using GitHub/Telegram notifications:

```bash
# Set GitHub token
npx wrangler secret put GITHUB_TOKEN

# Set Telegram bot token
npx wrangler secret put TELEGRAM_BOT_TOKEN

# Set Telegram chat ID
npx wrangler secret put TELEGRAM_CHAT_ID
```

### Step 6: Initialize Data

Add initial source configuration:

```bash
# Create a file with initial sources
npx wrangler kv key put --namespace-id be3c0fc148b749b49a59aa7cfa23e3ac "registry" '[{"domain":"trading212.com","url_patterns":["/invite/*","/referral/*"],"trust_initial":0.7,"classification":"probationary","active":true}]'
```

### Step 7: Verify Production

```bash
# Test health
curl https://do-deal-relay.<your-subdomain>.workers.dev/health

# Trigger manual discovery
curl -X POST https://do-deal-relay.<your-subdomain>.workers.dev/api/discover

# Get deals
curl https://do-deal-relay.<your-subdomain>.workers.dev/deals
```

## KV Namespaces Created

| Name          | ID                               | Status     |
| ------------- | -------------------------------- | ---------- |
| DEALS_PROD    | 23ee9b8c9e2748e5880f476b8b57a524 | ✅ Created |
| DEALS_STAGING | b0db85b92fae45c1895152737ab72649 | ✅ Created |
| DEALS_LOG     | 1f1a901fd6fb4dffbdcc86aa4a914ba8 | ✅ Created |
| DEALS_LOCK    | e3ab520eafd5430ab72978e78bdd257e | ✅ Created |
| DEALS_SOURCES | be3c0fc148b749b49a59aa7cfa23e3ac | ✅ Created |

## Post-Deployment Monitoring

After deployment, monitor these endpoints:

1. **Health Check**: `/health` - Should return status "healthy"
2. **Metrics**: `/metrics` - Prometheus-compatible metrics
3. **Pipeline Status**: `/api/status` - Current pipeline state
4. **Logs**: `/api/log` - Recent pipeline logs

The cron trigger will run automatically every 6 hours.

## Troubleshooting

### Worker not receiving requests

- Verify subdomain is registered and DNS is propagated
- Check Workers dashboard for any errors

### KV operations failing

- Verify all 5 KV namespaces are bound correctly in wrangler.jsonc
- Check namespace IDs match what's in the dashboard

### Pipeline not running

- Check `/api/status` to see current state
- Look at logs via `/api/log` or `npx wrangler tail`
- Verify cron trigger is configured (visible in dashboard)

## Summary

**Deployment Status**: ⏳ Pending workers.dev subdomain registration

All infrastructure is provisioned and ready. Complete the manual subdomain registration step to finish deployment.

**Next Action**: Visit https://dash.cloudflare.com/1192502f519a5ae3cbf3d934e6f33ef2/workers/onboarding
