---
name: do-deal-relay
description: AI agent self-prompting instructions for do-deal-relay. Use for adding referral codes, querying referrals, and interacting via MCP protocol. EU AI Act compliant with 180-day logging retention.
metadata:
  version: "0.1.2"
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

Current: v0.1.2
Verify: `cat package.json | grep version`

Last Updated: 2026-04-02
