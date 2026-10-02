# SKILLS-DISTILLED.md — Distilled Catalog of the Agent Skills Library

**Date**: 2026-10-02
**Source**: `.agents/skills/` (canonical), `skills-lock.json`
**Purpose**: A distilled, load-on-demand map of all 58 skills — what each
does, when to load it, where redundancy exists, and what is missing. Complements
`agents-docs/SKILLS.md` (authoring standards) and `.agents/skills/README.md`
(installation/symlinks).

**Library stats**: 58 skills — 51 authored in-repo, 7 vendored from
`cloudflare/skills` (agents-sdk, cloudflare, cloudflare-email-service,
durable-objects, sandbox-sdk, turnstile-spin, web-perf). Evals coverage:
37/58 (64%). All SKILL.md files respect the 250-line authoring cap (max 249).

---

## A. Product-Domain Skills (load for feature work on the deal platform)

| Skill | Purpose | Evals |
|:---|:---|:--:|
| `do-deal-relay` | Self-prompting instructions for the platform: add/query referrals, pipeline flow | y |
| `nlq` | Natural-language deal queries: conversion, hybrid FTS+vector retrieval | y |
| `refcli` | Referral-code management via CLI (full-URL contract) | y |
| `validation-gates` | Execute/report the 9-gate validation pipeline | y |
| `trust-model` | Source trust scoring and classification | y |
| `expiration-manager` | Time-based expiry scheduling and tracking | y |
| `reddit-engagement` | Safe Reddit community engagement for the r/ do-deal presence | y |
| `eu-ai-act-compliance` | Article 12/14 logging and human-oversight requirements | y |

## B. Cloudflare Platform (vendored — load for platform-primitive work)

| Skill | Purpose | Evals |
|:---|:---|:--:|
| `cloudflare` | Umbrella: Workers, Pages, KV, D1, R2, Workers AI | y |
| `durable-objects` | DO patterns: state, RPC, coordination | n |
| `agents-sdk` | Stateful agents on Workers via Agents SDK | n |
| `cloudflare-email-service` | Email sending + routing | n |
| `turnstile-spin` | Human-verification (Turnstile) end-to-end | n |
| `sandbox-sdk` | Sandboxed code execution apps | n |
| `web-perf` | Core Web Vitals via Chrome DevTools MCP | n |

## C. Platform-Adjacent Patterns (repo-authored, mirror worker/lib modules)

| Skill | Purpose | Evals |
|:---|:---|:--:|
| `d1-ops` | D1 migrations across local/preview/prod + runbook | n |
| `webhook-system` | HMAC-signed delivery, retry, DLQ | y |
| `metrics-pipeline` | Prometheus-compatible metrics export | y |
| `stateful-pipeline` | State-machine pipelines w/ retry + failure handling | y |
| `circuit-breaker` | Failure isolation, auto-recovery | y |
| `distributed-locking` | TTL-based cross-worker/agent locks | y |
| `guard-rails` | Safety/quality enforcement checklists | y |
| `crypto-utils` | HMAC, hashing, encryption patterns | y |
| `error-sanitization` | Replace unsafe error handling | n |
| `structured-logging` | Correlation-ID structured logging | y |
| `console-to-logger` | Migrate console.* to structured logging | n |

## D. Code Quality & External Analysis

| Skill | Purpose | Evals |
|:---|:---|:--:|
| `codacy-code-review` | Enrich PR reviews with Codacy findings | n |
| `codacy-analysis-cli` | Local static analysis runs | n |
| `codacy-cloud-cli` | Query Codacy Cloud (repos, PRs, coverage) | n |
| `configure-codacy` | Tailor Codacy config to project stack | n |
| `configure-codacy-cloud` | Tune Codacy Cloud repo settings | n |
| `setup-coverage` | Coverage reporting + Codacy upload | n |
| `typescript-coding-standards` | Type-safety, file caps, naming rules | n |
| `shell-script-quality` | ShellCheck + BATS discipline | y |
| `pre-commit` | Multi-language pre-commit hook management | y |
| `anti-ai-slop` | Reject filler, formatting noise, low-value output | y |

## E. Agent Process & Orchestration

| Skill | Purpose | Evals |
|:---|:---|:--:|
| `pev-loop` | Plan-Execute-Verify loop w/ atomic commits (AGENTS.md §4 core) | n |
| `goap-agent` | GOAP swarm orchestration of multi-step tasks | y |
| `agent-coordination` | Handoffs, state, parallel swarm protocol | y |
| `multi-agent-orchestration` | Supervisor + worker role patterns | n |
| `parallel-execution` | Run independent tasks simultaneously | y |
| `task-decomposition` | Break work into atomic, dependent steps | y |
| `iterative-refinement` | Validation-loop improvement cycles | y |
| `self-learning-feedback` | 3-persona verify/score/improve loop | y |
| `agentic-abstention` | Stop when infeasible rather than waste calls | n |
| `context-hygiene` | Keep context lean; prune stale assumptions | n |
| `pr-resolver` | PR lifecycle: CI fixes, conflicts, reviews | n |
| `agents-update` | Keep AGENTS.md under 200 lines; move detail out | y |
| `skill-creator` | Author/modify skills with structure standards | y |
| `skill-evaluator` | Evaluate skill structure + eval coverage | y |
| `jules-usage` | Jules CLI for long-running validation tasks | y |

## F. Research, Docs & External Services

| Skill | Purpose | Evals |
|:---|:---|:--:|
| `web-search-researcher` | Systematic web research methodology | y |
| `github-readme` | Human-focused README authoring (2026 standards) | y |
| `architecture-diagram` | Generate architecture SVG from live structure | y |
| `codeberg-api` | Codeberg API operations | y |
| `agent-browser` | Browser automation CLI for agents | y |
| `privacy-first` | Data-minimization design patterns | y |

---

## Redundancy Clusters (consolidation candidates)

1. **Logging (3 skills vs 1 open code issue)** — `structured-logging`,
   `console-to-logger`, and the N-3 migration (108 `global-logger` importers
   vs `lib/logger/*`). The skills describe three target behaviors while the
   repo itself has not converged. Recommendation: after N-3 lands, merge
   `console-to-logger` into `structured-logging` as a migration section.
2. **Codacy family (5 skills)** — `codacy-code-review`, `codacy-analysis-cli`,
   `codacy-cloud-cli`, `configure-codacy`, `configure-codacy-cloud` overlap in
   setup/query/review flows. None have evals. Recommendation: consolidate to
   2: `codacy-review` (local+cloud analysis, PR enrichment) and
   `codacy-config` (repo + cloud tuning), or add a shared `reference/`.
3. **Orchestration (5 skills, heavy overlap)** — `goap-agent`,
   `agent-coordination`, `multi-agent-orchestration`, `parallel-execution`,
   `task-decomposition` each carry part of the same protocol. They are
   intentionally layered (GOAP = strategy, coordination = protocol, others =
   tactics) but should cross-reference each other rather than restate the
   same handoff/atomic-commit rules. Keep all five; deduplicate content.

## Evals Coverage Gaps

21/58 skills lack `evals/`: agentic-abstention, agents-sdk, cloudflare-email-service,
codacy-analysis-cli, codacy-cloud-cli, codacy-code-review, configure-codacy,
configure-codacy-cloud, console-to-logger, context-hygiene, d1-ops, durable-objects,
error-sanitization, multi-agent-orchestration, pev-loop, pr-resolver, sandbox-sdk,
setup-coverage, typescript-coding-standards, turnstile-spin, web-perf.
Priority to backfill (highest usage, no evals): **pev-loop**, **d1-ops**,
**pr-resolver**, **typescript-coding-standards** — these gate every PR.

## New Skill Proposals

1. **`cloudflare-queues`** — producer/consumer + max_retries + DLQ patterns.
   Zero coverage of Queues anywhere in the library, yet ADR-031's descope and
   `reports/analysis/2026-10-02-codebase-improvement-analysis.md` (F-2) both
   call for it. Highest-value gap.
2. **`cloudflare-workflows`** — step/durable-execution patterns, shadow-mode
   cutover discipline. The repo runs flag-gated Workflows today with no skill
   encoding the "shadow → review diff → flip flag" protocol.
3. **`success-feedback-loop`** — after F-1 lands: encode the
   feedback → trust/ranking loop design so agents extend it consistently
   (analogous to how `trust-model` encodes trust evolution).
4. *(Vendored candidates)* — request upstream `cloudflare/skills` add a Queues
   skill rather than forking, per ADR-024 version-independence policy.

---

*Maintained alongside `agents-docs/SKILLS.md` and `.agents/skills/README.md`.
Library stats: 58 skills — 51 in-repo, 7 vendored; 37/58 with evals (64%);
all SKILL.md under the 250-line cap.*
