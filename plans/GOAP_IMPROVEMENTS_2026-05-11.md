# GOAP Improvements Plan (2026-05-11)

**status**: planned  
**owner**: agent-swarm  
**scope**: codebase + plans/ + docs/ + agents-docs/ + skills index  
**method**: GOAP (Analyze → Decompose → Strategize → Coordinate → Execute → Synthesize)

---

## 1) Task Analysis

**Primary Goal**: Convert current mixed-status documentation into an actionable, verifiable implementation roadmap that closes known CI, validation, and product gaps while preserving production stability.

**Observed Constraints**:
- Root `AGENTS.md` still states "All 9 MUST Pass" while repo materials and tests indicate 10 gates.
- Multiple plan docs are stale or duplicated, with historical execution logs mixed into active plans.
- CI reliability is affected by known vitest worker pool instability and pending workflow shellcheck issues.
- Security/compliance work is partly complete but tracked across fragmented files.

**Complexity**: Complex (cross-cutting infra, docs, tests, and product features).

---

## 2) Decomposition (Sub-goals)

### P0 — Governance & Source-of-Truth Alignment
1. Align validation gate count and naming across `AGENTS.md`, docs, and test references.
2. Define one canonical status ledger for production-readiness items.
3. Split "historical report" content from "active execution plan" content in `plans/`.

### P0 — CI Stability Recovery
1. Resolve/work around Cloudflare vitest pool post-run crash (without masking real failures).
2. Fix workflow shellcheck/actionlint issues in GitHub Actions YAML.
3. Establish deterministic quality-gate behavior in local + CI execution.

### P1 — Security & Dependency Hygiene
1. Remediate pending `npm audit` issues with changelog notes and risk acceptance if needed.
2. Migrate deprecated Node 20 action usage to supported versions/runtime.
3. Tighten secret scanning rules to reduce false positives while preserving high-signal checks.

### P1 — Product Feature Completion
1. Add authenticated/manual trigger controls and idempotency for `/api/discover`.
2. Expand analytics persistence model (snapshot history + trend window controls).
3. Add deal search relevance improvements (tokenization/synonyms/domain weighting).

### P2 — Operability & DX
1. Add runbook-quality incident workflows (health degraded, empty snapshot, rollback failure).
2. Add doc freshness checks for plans/docs drift.
3. Add smoke-profile tests that run even when worker pool is unstable.

---

## 3) Strategy Selection

**Strategy**: Hybrid
- **Sequential** for governance alignment and CI baseline stabilization (dependency-sensitive).
- **Parallel** for independent implementation tracks (security, product features, docs refactors).

**Quality Gates for this plan**:
1. Consistency gate: all gate-count references are identical.
2. CI gate: `quality_gate.sh` passes or has explicit tracked environment limitation.
3. Traceability gate: each TODO mapped to owner, file, and completion signal.

---

## 4) Missing Implementations (Actionable Backlog)

## A. Validation & pipeline integrity
- [ ] Add explicit "10th gate" documentation to root governance docs and API docs.
- [ ] Emit per-gate pass/fail counters to a single metrics schema for dashboards.
- [ ] Add test asserting gate registry completeness (no undocumented gates).

## B. CI/CD hardening
- [ ] Implement alternate vitest mode for CI fallback (fork pool or split profile).
- [ ] Add workflow matrix lane for "typecheck + fast unit subset" independent of worker pool.
- [ ] Fix shell quoting and summary redirection patterns in workflow scripts.

## C. Security/compliance
- [ ] Resolve high severity dependency findings first; document accepted residual risks.
- [ ] Add periodic audit workflow artifact retention policy doc.
- [ ] Add compliance check linking EU AI Act logging requirements to concrete log keys.

## D. Product feature gaps
- [ ] Add `/api/discover` anti-abuse guardrail (rate limit + signed internal trigger option).
- [ ] Add analytics endpoint query params for time windows and source filters.
- [ ] Add dedupe explainability metadata (why item considered duplicate/non-duplicate).

## E. Documentation debt
- [ ] Rewrite `plans/EXECUTION_PLAN.md` as current-future plan (move historical run logs to `reports/`).
- [ ] Remove duplicated sections in `plans/multi-agent-workflow.md`.
- [ ] Add `plans/INDEX.md` to classify: active, blocked, archived.

---

## 5) New Feature Proposal

## Feature: **Deal Confidence Explainability API**

**Problem**: Confidence/trust/ranking outputs exist, but users and operators cannot easily inspect the reasoning chain per deal.

**Proposal**:
- Add endpoint: `GET /deals/:id/explain`
- Response includes:
  - validation gates outcome summary
  - source trust inputs and adjustments
  - ranking factor contributions (confidence/trust/recency/value/expiry)
  - dedupe decision rationale

**Benefits**:
- Increases operator trust and debugging speed.
- Improves user-facing transparency and reduces false-positive dispute time.
- Supports compliance narratives (decision traceability).

**Implementation Outline**:
1. Add explainability model in worker domain types.
2. Persist minimal decision trace during pipeline phases.
3. Expose read-only explain endpoint with redacted internals.
4. Add unit/integration tests for deterministic explanations.
5. Add docs examples and failure modes.

---

## 6) Execution Plan (GOAP)

### Phase 1 (P0): Canonicalization
- Update gate-count references and governance consistency.
- Define current/authoritative plans index.
- Exit criteria: no conflicting gate count in `AGENTS.md` / plans docs.

### Phase 2 (P0): CI Reliability
- Implement fallback test profile and YAML fixes.
- Exit criteria: CI green on at least one stable test lane + lint lane.

### Phase 3 (P1): Security + Dependency
- Patch high-risk dependencies and Node action runtime updates.
- Exit criteria: no high vulnerabilities; deprecation warnings removed.

### Phase 4 (P1): Explainability Feature MVP
- Ship `/deals/:id/explain` with tests + docs.
- Exit criteria: endpoint covered by integration tests and included in API docs.

### Phase 5 (P2): Documentation Lifecycle
- Archive stale plans to `reports/`, maintain `plans/INDEX.md` and status tags.
- Exit criteria: all active plans are implementation-oriented and date-stamped.

---

## 7) Success Metrics

- CI pass rate > 95% over 14 days.
- Zero gate-count inconsistencies in docs/plans.
- Mean time to diagnose rejected deal reduced by 40% (via explainability).
- No high severity dependency vulnerabilities.

---

## 8) Risks & Mitigations

- **Risk**: Worker-pool fallback may hide runtime-specific bugs.  
  **Mitigation**: Keep one worker-pool lane as non-blocking signal while blocking on stable lane.

- **Risk**: Additional explainability storage overhead.  
  **Mitigation**: Store compressed/minimal trace with TTL and redaction.

- **Risk**: Plan churn without execution ownership.  
  **Mitigation**: Assign owner + due date in `plans/PROGRESS.md` before each phase starts.
