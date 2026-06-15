---
name: cloudflare
description: Comprehensive Cloudflare platform skill covering Workers, Pages, storage (KV, D1, R2), AI (Workers AI, Vectorize, Agents SDK), feature flags (Flagship), networking (Tunnel, Spectrum), security (WAF, DDoS), and infrastructure-as-code (Terraform, Pulumi). Use for any Cloudflare development task. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.
version: 1.0.0
author: jules
references:
  - workers
  - pages
  - d1
  - durable-objects
  - workers-ai
  - product-index
---

# Cloudflare Platform Skill

## Overview

Consolidated skill for building on the Cloudflare platform. Use decision trees below to find the right product, then load detailed references.

Your knowledge of Cloudflare APIs, types, limits, and pricing may be outdated. **Prefer retrieval over pre-training**.

## Quick Start

1.  **Identify the need** (Compute, Storage, AI, etc.) using the [Quick Decision Trees](#quick-decision-trees).
2.  **Locate the product** in the [Product Index](references/product-index.md).
3.  **Fetch the latest docs** using the `cloudflare-docs` search tool or visiting `https://developers.cloudflare.com/`.
4.  **Check the relevant reference** in `references/` for specific implementation patterns and gotchas.
5.  **Validate against types** by checking `node_modules/@cloudflare/workers-types`.

## Retrieval Sources

Fetch the **latest** information before citing specific numbers, API signatures, or configuration options. Do not rely on baked-in knowledge or these reference files alone.

| Source | How to retrieve | Use for |
|--------|----------------|---------|
| Cloudflare docs | `cloudflare-docs` search tool or `https://developers.cloudflare.com/` | Limits, pricing, API reference, compatibility dates/flags |
| Workers types | `npm pack @cloudflare/workers-types` or check `node_modules` | Type signatures, binding shapes, handler types |
| Wrangler config schema | `node_modules/wrangler/config-schema.json` | Config fields, binding shapes, allowed values |
| Product changelogs | `https://developers.cloudflare.com/changelog/` | Recent changes to limits, features, deprecations |

When a reference file and the docs disagree, **trust the docs**.

## Usage Example

```typescript
// Example: Basic Cloudflare Worker with KV binding
export interface Env {
  MY_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const value = await env.MY_KV.get("my-key");
    return new Response(value || "Key not found");
  },
};
```

## Quick Decision Trees

### "I need feature flags"
- Feature toggles, targeting rules, percentage rollouts → flagship/
- Evaluate in Workers → Flagship binding (env.FLAGS)

### "I need to run code"
- Serverless functions at the edge → workers/
- Full-stack web app with Git deploys → pages/
- Stateful coordination/real-time → durable-objects/
- Long-running multi-step jobs → workflows/
- Run containers → containers/
- Multi-tenant (customers deploy code) → workers-for-platforms/
- Scheduled tasks (cron) → cron-triggers/
- Lightweight edge logic (modify HTTP) → snippets/

### "I need to store data"
- Key-value (config, sessions, cache) → kv/
- Relational SQL → d1/ (SQLite) or hyperdrive/ (existing Postgres/MySQL)
- Object/file storage (S3-compatible) → r2/
- Message queue (async processing) → queues/
- Vector embeddings (AI/semantic search) → vectorize/
- Strongly-consistent per-entity state → durable-objects/ (DO storage)
- Persistent cache (long-term retention) → cache-reserve/

### "I need AI/ML"
- Run inference (LLMs, embeddings, images) → workers-ai/
- Vector database for RAG/search → vectorize/
- Build stateful AI agents → agents-sdk/
- Gateway for any AI provider (caching, routing) → ai-gateway/

### "I need networking/connectivity"
- Expose local service to internet → tunnel/
- TCP/UDP proxy (non-HTTP) → spectrum/
- Private network connectivity → network-interconnect/
- Optimize routing → argo-smart-routing/
- Optimize latency to backend (not user) → smart-placement/

### "I need security"
- Web Application Firewall → waf/
- DDoS protection → ddos/
- Bot detection/management → bot-management/
- CAPTCHA alternative → turnstile/

### "I need media/content"
- Image optimization/transformation → images/
- Video streaming/encoding → stream/
- Browser automation/screenshots → browser-rendering/
- Third-party script management → zaraz/

### "I need analytics/metrics data"
- Query across all Cloudflare products (HTTP, Workers, DNS, etc.) → graphql-api/
- Custom high-cardinality metrics from Workers → analytics-engine/
- Client-side (RUM) performance data → web-analytics/
- Workers Logs and real-time debugging → observability/

### "I need infrastructure-as-code"
- IaC? → pulumi/ (Pulumi), terraform/ (Terraform), or api/ (REST API)

## Rationalizations

| Concern | Counter-Argument |
|---------|-----------------|
| The "Cloudflare skill" can be skipped because sub-skills cover everything. | Sub-skills are the deep references; this skill is the index + retrieval orchestration. |
| Cached references are fine to use without re-fetching. | Cloudflare product behavior changes between compat dates. The skill mandates fresh fetches. |

## Red Flags

- [ ] Do not answer a Cloudflare product question without first checking the relevant `references/` subdirectory.
- [ ] Do not cite a blog post or third-party tutorial when an official `developers.cloudflare.com` page exists.
- [ ] Do not skip the `compatibility_date` context — runtime behavior varies across dates.
