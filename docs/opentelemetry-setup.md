# OpenTelemetry Trace Export Setup

Phase 1 of OpenTelemetry integration for `do-deal-relay`.

## Overview

Cloudflare Workers supports native OTLP trace export via the `observability`
block in `wrangler.jsonc`. Traces are already **enabled** — no npm packages
required. This guide covers connecting an export destination so traces flow
to your observability backend.

**Current config** (`wrangler.jsonc`):

```jsonc
"observability": {
  "logs": { "enabled": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true, "head_sampling_rate": 1 }
}
```

## Prerequisites

- Cloudflare Workers **Paid plan** (includes 10M trace events/month)
- An account with a supported observability vendor (see below)

## Step-by-Step

### 1. Choose a Vendor

| Vendor | Free Tier | Best For |
|--------|-----------|----------|
| [Honeycomb](https://www.honeycomb.io) | 20M events/mo | BubbleUp debugging, high-cardinality queries |
| [Grafana Cloud](https://grafana.com/products/cloud/) | 50M spans/mo | Unified metrics + traces + logs in one stack |
| [Axiom](https://www.axiom.co) | 1GB/mo ingest | Simple pricing, fast exploration |
| [SigNoz](https://signoz.io) | Open-source self-hosted | Full control, no vendor lock-in |

### 2. Get Your API Key

**Honeycomb:**
1. Sign up → Settings → API Keys
2. Create a new write-only key
3. Note the dataset name (or create one called `do-deal-relay`)

**Grafana Cloud:**
1. Sign up → Cloud → Connection → OTLP
2. Copy the OTLP gateway endpoint and generate an API key
3. Note your stack ID from the URL

**Axiom:**
1. Sign up → Settings → API Tokens
2. Create a token with "Ingest" scope
3. Create a dataset called `do-deal-relay`

**SigNoz (Cloud):**
1. Sign up → Settings → Keys → Ingestion Key
2. Copy the key and your cloud region from the endpoint URL

**SigNoz (Self-Hosted):**
1. Deploy SigNoz via Docker Compose or Helm
2. Note the OTLP endpoint (default: `http://<host>:4318`)

### 3. Add API Key as Cloudflare Secret

```bash
# Replace with your vendor and actual key
wrangler secret put HONEYCOMB_API_KEY
# Paste the key when prompted
```

Repeat for each key you'll use:
- `HONEYCOMB_API_KEY`
- `GRAFANA_CLOUD_API_KEY`
- `AXIOM_API_KEY`
- `SIGNOZ_API_KEY`

### 4. Enable the Export Destination in `wrangler.jsonc`

Uncomment and customize the destination block inside `observability.traces`.
Example for Honeycomb:

```jsonc
"traces": {
  "enabled": true,
  "head_sampling_rate": 0.1,
  "destination": {
    "type": "OTLP",
    "url": "https://api.honeycomb.io/v1/traces",
    "headers": {
      "x-honeycomb-team": "${HONEYCOMB_API_KEY}",
      "x-honeycomb-dataset": "do-deal-relay"
    }
  }
}
```

### 5. Deploy

```bash
wrangler deploy --env production
```

Verify traces appear in your vendor's dashboard within 1–2 minutes.

## Cost Analysis

Cloudflare Workers Observability pricing (Paid plan):

| Resource | Included | Overage |
|----------|----------|---------|
| Trace events | 10M/mo | $0.50 per million |
| Log events | 10M/mo | $0.50 per million |
| Log retention | 2 days | — |

**Estimating usage:** Each pipeline run (every 6h) generates ~50–200 trace
events depending on source count. With 4 runs/day × 30 days = ~120 runs/mo,
producing roughly 6K–24K trace events. Well within the free allocation.

**Vendor costs:** Check each vendor's pricing page — most include a generous
free tier that covers this volume easily.

## Recommended Sampling Rate

| Environment | `head_sampling_rate` | Rationale |
|-------------|---------------------|-----------|
| Development | `1` (100%) | Capture everything for debugging |
| Staging | `0.5` (50%) | Validate trace structure before production |
| Production | `0.1` (10%) | Balance visibility with cost; increase for incident investigation |

To change sampling, update `head_sampling_rate` in `wrangler.jsonc` and
redeploy. Sampling is applied at trace creation — you cannot resample
retroactively.

## What You Get

With this configuration, the following are automatically instrumented:

- **Request/response spans** for every HTTP call to the worker
- **Pipeline phase timing** (discover → normalize → dedupe → validate →
  score → stage → publish → verify → finalize)
- **KV and D1 operation latency** as child spans
- **Error attribution** to specific pipeline phases

Traces correlate with the existing Prometheus metrics at `/metrics` and the
log stream, giving you three complementary observability signals.

## Next Phases

- **Phase 2**: Add custom span attributes (deal IDs, source names, trust
  scores) via the `trace` API in worker code
- **Phase 3**: Wire trace context into the pipeline executor for end-to-end
  distributed tracing across pipeline runs

## Troubleshooting

**Traces not appearing?**

1. Confirm `traces.enabled: true` in `wrangler.jsonc`
2. Verify the secret is set: `wrangler secret list`
3. Check vendor logs for auth errors (401/403)
4. Ensure the URL points to the OTLP **HTTP** endpoint (not gRPC)

**High latency?**

- Lower `head_sampling_rate` to reduce export volume
- Check if the vendor endpoint is region-appropriate

**Need help?**
- Cloudflare: [Workers Observability docs](https://developers.cloudflare.com/workers/observability/)
- OpenTelemetry: [OTLP spec](https://opentelemetry.io/docs/specs/otlp/)
