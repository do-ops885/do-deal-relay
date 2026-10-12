---
name: do-deal-relay
description: AI agent self-prompting instructions for do-deal-relay. Use for adding referral codes, querying referrals, and interacting via MCP protocol. EU AI Act compliant with 180-day logging retention.
metadata:
  version: "0.1.7"
  author: do-ops
  spec: "agentskills.io"
  eu_ai_act: "compliant"
  last_updated: "2026-04-02"
---

# AI Agent Self-Prompting Instructions

## 🤖 AI Agent Quick Reference

**System Purpose**: Autonomous deal discovery and referral code management for AI agents.

**EU AI Act Status**: Compliant (Limited Risk, Article 50 + Article 12 logging)

---

## Quick Commands

### 1. Add Referral (Smart-Add)

```bash
refcli codes smart-add "https://de.scalable.capital/en/invitation/b6zk2z"
```

### 2. API Direct

```bash
curl -X POST https://api.do-deal-relay.com/api/referrals \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "code": "B6ZK2Z",
    "url": "https://de.scalable.capital/en/invitation/b6zk2z",
    "domain": "de.scalable.capital",
    "metadata": {
      "title": "Scalable Capital Referral",
      "category": ["finance", "investing"]
    }
  }'
```

### 3. MCP Protocol

```bash
curl -X POST https://api.do-deal-relay.com/mcp/v1/tools/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tool": "add_referral",
    "input": {
      "code": "B6ZK2Z",
      "url": "https://de.scalable.capital/en/invitation/b6zk2z",
      "domain": "de.scalable.capital"
    },
    "correlationId": "your-trace-id"
  }'
```

---

## Available Tools (MCP)

| Tool                   | Purpose                    | Auth Required |
| ---------------------- | -------------------------- | ------------- |
| `search_referrals`     | Find codes by domain/query | Yes           |
| `add_referral`         | Add new referral code      | Yes           |
| `get_referral_details` | Lookup specific code       | No            |
| `research_domain`      | Research domain for codes  | Yes           |
| `get_stats`            | System statistics          | No            |
| `validate_url`         | Check URL safety           | No            |

---

## EU AI Act Compliance

### Required Logging

All operations automatically logged for:

- Article 12: Record-keeping (180-day retention)
- Article 50: Transparency
- GDPR compliance

### Transparency Disclosure

When interacting with users, include:

```
You are interacting with an AI-powered deal discovery system.
System: do-deal-relay
Provider: do-ops
All operations logged per EU AI Act Article 12.
```

---

## Cloudflare Limits (Free Tier)

| Resource         | Limit       |
| ---------------- | ----------- |
| Workers Requests | 100,000/day |
| KV Storage       | 1 GB        |
| D1 Storage       | 5 GB        |
| D1 Reads         | 100,000/day |
| D1 Writes        | 100,000/day |

---

## Self-Test Protocol

Run after any deployment:

```bash
npx ts-node temp/ai-agent-self-test.ts
```

Expected: 5/5 tests pass, 100% success rate.

---

## Error Handling

### 401 Unauthorized

- Missing or invalid API key
- Get key: `refcli auth login`

### 429 Rate Limited

- Too many requests
- Default: 60 req/min, 1000 req/hour

### 503 Service Unavailable

- D1 database not configured
- Check wrangler.jsonc

---

## Version Check

Current: see root `VERSION`
Verify: `cat package.json | grep version`

Last Updated: 2026-04-02

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "Any tool name works; the aliases cover it." | AGENTS.md pins the canonical names `search_deals`, `get_deal`, `add_referral`; `get_deals`, `get_deal_by_code`, and `submit_deal` are aliases. This skill's own table lists `search_referrals`, `add_referral`, `get_referral_details`. |
| "Article 12 logging can be bolted on after the feature ships." | The skill states 180-day retention as required. Interactions never recorded cannot be reconstructed later. |
| "Referral lookups are public, so auth can be skipped everywhere." | The tool table marks `search_referrals`, `add_referral`, and `research_domain` as auth-required; only `get_referral_details`, `get_stats`, and `validate_url` are open. |
| "Pinning the product version in the body is harmless." | Root `VERSION` is the single source of truth per AGENTS.md; the body now points at it instead of restating a pinned version. |

## Red Flags

- [ ] A version string restated in the skill body instead of deferring to root `VERSION`.
- [ ] `add_referral` used without showing the Article 50 transparency disclosure to the user.
- [ ] An alias (`get_deals`, `submit_deal`) presented as the canonical MCP tool name.
- [ ] Self-test result claimed without running `npx ts-node temp/ai-agent-self-test.ts` after a deployment.
- [ ] Auth-required tools called without `X-API-Key`/bearer token and the 401 logged as a server fault.
