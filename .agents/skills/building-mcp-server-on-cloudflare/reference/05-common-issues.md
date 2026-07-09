# Common Issues

### "Tool not found" in Client

1. Verify tool name matches exactly (case-sensitive)
2. Ensure `init()` registers tools before connections
3. Check server logs: `wrangler tail`

### Connection Fails

1. Confirm endpoint path is `/mcp`
2. Check CORS if browser-based client
3. Verify Worker is deployed: `wrangler deployments list`

### OAuth Redirect Errors

1. Callback URL must match OAuth app config exactly
2. Check `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
3. For local dev, use `http://localhost:8788/callback`


> Extracted from: ../SKILL.md
