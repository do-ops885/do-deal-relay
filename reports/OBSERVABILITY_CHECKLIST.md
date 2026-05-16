# Observability Verification Checklist (v0.1.4)

This checklist provides step-by-step instructions for verifying that logs and traces are correctly working in the Cloudflare Dashboard for the `do-deal-relay` worker.

---

## 1. Verify Invocation Logs

Cloudflare Workers Logs provide real-time console output. With `head_sampling_rate: 1`, all requests should be logged.

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Overview**.
3. Select the `do-deal-relay` (or `do-deal-relay-staging`) worker.
4. Go to the **Logs** tab.
5. Click **Begin log stream**.
6. In a separate terminal, trigger an activity (e.g., `curl https://do-deal-relay.<subdomain>.workers.dev/health`).
7. **Success Criteria**:
    - [ ] A new log entry appears for the request.
    - [ ] Expanding the log entry shows structured JSON if logged (e.g., pipeline phase starts).
    - [ ] The "Outcome" field shows "Success" (or the expected HTTP status).

---

## 2. Verify Trace Waterfalls

Cloudflare Workers Traces show timing and subrequests (KV, D1, fetch).

1. In the same worker dashboard, go to **Analytics** > **Traces**.
2. Ensure the time range covers your recent requests.
3. Click on a specific trace in the list.
4. **Success Criteria**:
    - [ ] A waterfall view appears showing the main request duration.
    - [ ] Sub-operations (e.g., `KV.get`, `D1.query`, `fetch`) are visible as child spans.
    - [ ] Timing information is visible for each span.
    - [ ] "Sampling Rate" in the trace metadata shows `100%`.

---

## 3. Verify WAF and Edge Security

Verify that the platform-level security rules documented in `docs/DEPLOYMENT.md` are active.

1. Navigate to **Security** > **WAF** > **Custom rules**.
2. Verify the following rules are present and enabled:
    - [ ] **Block SQLi**: regex pattern for SQL injection.
    - [ ] **Block XSS**: regex pattern for Cross-Site Scripting.
3. Navigate to **Security** > **API Shield**.
4. Verify:
    - [ ] **Schema Validation** is configured for `/api/*` endpoints (if applicable).
5. Navigate to **Security** > **Bots**.
6. Verify:
    - [ ] **Bot Fight Mode** is ON.

---

## 4. Troubleshooting

If logs or traces are missing:

- **Check Configuration**: Verify `wrangler.jsonc` has `observability.enabled: true` and `head_sampling_rate: 1`.
- **Redeploy**: Run `npx wrangler deploy` to ensure the latest configuration is active.
- **Proxy Status**: Ensure the domain is "Orange Clouded" (proxied by Cloudflare) if using custom WAF rules.
- **Permissions**: Ensure your API token has `Zone:Analytics:Read` and `Account:Workers:Read`.
