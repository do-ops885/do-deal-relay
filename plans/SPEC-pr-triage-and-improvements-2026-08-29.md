# SPEC: PR Triage, Improvement Backlog & Feature Roadmap — 2026-08-29

**Mode**: Light (PR triage) + Full (analysis register)
**GOAP State**: v0.18.0
**Orchestrator**: goap-agent skill, swarm of explore agents

## 1. PR Triage Outcomes (10 open PRs processed)

| PR | Verdict | Action |
|:---|:---|:---|
| #719 fix(security): SSRF on referral creation | High impact | Rebase-merged first (hot file, regression test) |
| #718 deps: 5 patch/minor bumps | Impact | Rebase-merged |
| #717 JSDoc config-utils | Minor impact | Rebase-merged |
| #725 docs: PEV security gate | Minor impact | Rebase-merged |
| #723 perf: precompute lowercased category | Minor impact | Rebase-merged |
| #722 a11y: rescan tooltip | Minor impact | Rebase-merged |
| #716 improvement swarm (KV pagination, assertion sweep, popup split, AI binding, +115 tests) | Highest impact | Rebase-merged (failures pre-existing on main, see ADR-023) |
| #721 docs: agents.md prompt | No impact — zero file diff | Closed |
| #720 deps: upgrade | No impact — JSDoc mislabeled as deps bump | Closed |
| #724 JSDoc duplicate of #717 | No impact — duplicate | Closed |

## 2. Improvement Backlog (swarm findings, ranked)

| ID | Finding | Priority | Location | Fix Direction |
|:---|:---|:---|:---|:---|
| I-1 | Immutable Request header mutation in auth middleware throws at runtime on non-public routes | P1 | worker/lib/middleware/auth.ts:71-80 | Context object or reconstructed Request |
| I-2 | D1 executeWithRetry returns errors instead of throwing; callers ignore; retries non-idempotent writes | P1 | worker/lib/d1/client.ts:447-488 | Throw on exhaustion; retry reads only |
| I-3 | evolveTrust read-modify-write race: concurrent lost updates | P1 | worker/lib/d1/trust.ts:80-121 | SQL-side atomic update `trust_score = MAX(0, MIN(1, trust_score + ?))` |
| I-4 | validatedFetch TOCTOU DNS rebinding + redirect follow bypasses IP checks | P1 | worker/lib/security.ts:139-152 | redirect: manual with per-hop re-validation |
| I-5 | Referral schema validation theater: `as` casts, validation of constructed object not client body; code uniqueness TOCTOU | P2 | worker/routes/referrals.ts:117-202 | Validate raw body; DB unique constraint |
| I-6 | Client-supplied `domain` defeats domain-match check; open-redirect risk on `?redirect=true` | P2 | worker/routes/referrals.ts:133,256-259 | Server-side domain allowlist |
| I-7 | handleReactivateReferral: race, missing request/env in responses, no audit event | P2 | worker/routes/referrals.ts:360-400 | Atomic UPDATE, pass context, audit |
| I-8 | No rate limit on referral list/create in legacy router; dead 1MB body check | P2 | worker/router/legacy-routes.ts:235-247, referrals.ts:107-115 | Add limiter, delete dead check |
| I-9 | CONFIG.BLOCKED_HOSTS drifts from security.ts blocklists (dead config trap) | P3 | worker/config.ts:151-166 | Delete; single source of truth |
| I-10 | evolveTrustBatch N+1 SELECTs + wrong previous_score on clamp | P3 | worker/lib/d1/trust.ts:190-210 | IN-query batch; track scores in-app |

## 3. Feature Roadmap (impact-ranked)

| ID | Feature | Effort | Scope |
|:---|:---|:---|:---|
| MF-1 | Hybrid semantic search (FTS5 + vector fusion, `hybrid: true` param already accepted but ignored) | M | routes/semantic-search.ts, lib/search/, D1 FTS5 |
| MI-1 | Wire MCP SSE streaming + progress notifications (dead code, S effort, marketable) | S | legacy-routes.ts, mcp-stream.ts, lib/mcp/ |
| MF-N1 | High-value deal notifications (NOTIFICATION_THRESHOLD exists, no alert path) | M | lib/webhook/, publish phase |
| MF-A1 | Referral analytics & attribution API (per-source success, reward totals, conversion) | M | routes/core/analytics.ts, d1/referrals-batch.ts |
| NLQ-1 | NLQ saved queries + suggestions | M | routes/nlq/, new D1 table |
| MF-2 | Default research agent to real scrapers; retire simulateDiscovery (compliance risk from fabricated data) | M | lib/research-agent/ |
| UX-1 | Extension real-time deal feed + badge notifications | S | extension/background.js, popup.js |
| MI-3 | Wire AI Gateway client for LLM calls (caching, failover, cost observability) | S-M | lib/ai-gateway/, nlq/, search/ |

## 4. Verification

- Unit suite green locally; 7 PRs rebase-merged with clean CI; 3 no-impact PRs closed with reasons.
- CI failures on main (E2E/Smoke missing CLOUDFLARE_API_TOKEN; research-api unit flake) → ADR-023.
