# ADR-021: ci-workflow-validator gate structurally over-strict for wrangler-provisioned vars

**Date**: 2026-08-22
**Status**: Accepted (blocker registered per AGENTS.md Always-Fix triage)
**Gate**: scripts/ci-workflow-validator.sh (invoked by scripts/pev-gates.sh)

## Context

The gate extracts every top-level var and secret from wrangler.jsonc
(14 items as of 2026-08-22: AI_GATEWAY_URL, CANDIDATE_BUDGET_GLOBAL,
CANDIDATE_BUDGET_PER_SOURCE, CANDIDATE_BUDGET_HIGH_TRUST_BONUS, ENVIRONMENT,
GITHUB_REPO, JWT_SECRET, MCP_PROTOCOL_VERSION, MCP_RATE_LIMIT_PER_MINUTE,
NOTIFICATION_THRESHOLD, TRUST_THRESHOLD, WEBHOOK_SECRET,
EMAIL_WEBHOOK_SECRET, API_ENCRYPTION_KEY) and requires each to appear as
env.NAME or secrets.NAME in at least one GitHub Actions workflow.

All 14 items fail. Verified identical on vanilla main (14/14 fail on commit
7798eb6), so this is pre-existing drift, not a regression of the 2026-08-22
swarm branch.

## Why the premise does not hold

Runtime configuration for this worker is provisioned through wrangler.jsonc
vars during Cloudflare Workers Builds (see ADR-018: deploys flow through the
Cloudflare Git Integration, not GitHub Actions). GitHub workflows here only
trigger already-deployed workers over HTTP (discovery.yml smoke tests) or run
local dev-server tests with deterministic test credentials (nightly.yml).
Requiring workflow-level env references for wrangler-provisioned runtime vars
would force artificial references with no functional effect.

Secrets deserve a split verdict:

- WEBHOOK_SECRET / EMAIL_WEBHOOK_SECRET / API_ENCRYPTION_KEY are intentionally
  hardcoded CI-test literals in nightly.yml (public-repo determinism); wiring
  secrets.X there would break reproducible local test runs.
- JWT_SECRET is a runtime var provisioned by wrangler; no workflow consumes it.

## Decision

Register BLOCKED-3 in plans/GOAP_STATE.md and defer remediation to a dedicated
gate rework. Two acceptable remediation paths for a future sprint:

1. Scope the gate to vars that workflows actually manage (deploy-time inputs),
   dropping pure-runtime wrangler vars from the expectation set.
2. Introduce an explicit config-parity manifest (e.g., deploy-config.json)
   that both wrangler.jsonc and workflows derive from, making the check
   satisfiable without artificial env blocks.

## Consequences

- pev-gates.sh will report ci-workflow-validator FAIL until remediation lands;
  treat this single known-fail as accepted debt tracked via BLOCKED-3.
- No production risk: the gate validates documentation-style consistency, not
  runtime behavior; worker config remains governed by wrangler.jsonc.
