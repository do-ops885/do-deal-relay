# Harness Engineering — do-deal-relay

> **Agent = Model + Harness**
> The harness is everything around the AI model: AGENTS.md, MCP servers, skills, sub-agents, hooks, guard rails, back-pressure mechanisms, test suites, linters, type checkers, and CI pipelines. Harness engineering is the practice of designing and iterating on these controls to increase our confidence in AI-generated code.

Reference: [Harness Engineering for Coding Agent Users](https://martinfowler.com/articles/harness-engineering.html) — Birgitta Böckeler, 2026

---

## 1. Core Framework: Guides + Sensors

A well-built harness combines two types of controls:

### Guides (Feedforward Controls)
Anticipate the agent's behaviour and steer it **before** it acts. Guides increase the probability that the agent produces good results on the first attempt.

| Guide | Type | Location |
|---|---|---|
| AGENTS.md (coordination rules) | Computational | `AGENTS.md` |
| Skills (procedural knowledge) | Both | `.agents/skills/` |
| TypeScript anti-patterns table | Computational | `AGENTS.md` |
| Hard constraints (line limits, trust thresholds) | Computational | `agents-docs/hard-constraints.md` |
| Quality standards (500-line limit, atomic commits) | Computational | `agents-docs/quality-standards.md` |
| Root directory policy | Computational | `agents-docs/PROJECT_STRUCTURE.md` |
| Delegation routing rules | Computational | `AGENTS.md` |
| NEVER-BYPASS-SYSTEM (audit requirements) | Computational | `agents-docs/NEVER-BYPASS-SYSTEM.md` |
| MCP tool signatures | Computational | `agents-docs/SYSTEM_REFERENCE.md` |
| Context budget tables | Computational | `agents-docs/CONTEXT.md` |

### Sensors (Feedback Controls)
Observe **after** the agent acts and help it self-correct. Sensors produce signals optimized for LLM consumption — custom error messages, lint output, test failures.

| Sensor | Type | Location |
|---|---|---|
| `pev-gates.sh` (verify after every change) | Computational | `scripts/pev-gates.sh` |
| TypeScript typecheck (`npx tsc --noEmit`) | Computational | CI + hooks |
| Unit tests (vitest) | Computational | `tests/unit/` |
| Validation gates (9-gate pipeline) | Computational | `worker/validation/pipeline.ts` |
| Pre-commit guard rails (10 gates) | Computational | `scripts/pre-commit-hook.sh` |
| Pre-push guard rails (9 gates) | Computational | `scripts/pre-push-hook.sh` |
| Quality gate script (13 gates) | Computational | `scripts/quality_gate.sh` |
| Lint/format (Prettier, actionlint) | Computational | CI + hooks |
| Secret detection (TruffleHog) | Computational | CI + hooks |
| Lessons learned / Learnings log | Inferential | `agents-docs/LEARNINGS.md` `agents-docs/LESSONS.md` |
| Accuracy guardrails (config contract checks) | Inferential | `agents-docs/accuracy-guardrails.md` |
| Self-learning patterns (escalation) | Inferential | `agents-docs/self-learning-patterns.md` |
| Fix-Forward rule | Inferential | `agents-docs/accuracy-guardrails.md` |

---

## 2. Computational vs Inferential

Guides and sensors come in two execution types:

**Computational** — Deterministic, fast, run by CPU. Type checks, linters, structural tests, guard rails. Run in milliseconds to seconds; results are reliable. These are the **backbone** of our harness.

**Inferential** — Semantic analysis, patterns derived from experience, "what went wrong and how to prevent it." Slower/resource-intensive, non-deterministic. Used for higher-order corrections: learnings logs, accuracy guardrails, self-learning patterns.

### Priority: Computational First

Computational sensors run on every change. Inferential sensors are applied during retrospectives, swarms, and quality sweeps. If a pattern emerges frequently in the inferential layer, escalate it to a computational guide or sensor (see Steering Loop below).

---

## 3. The Steering Loop

> Whenever an issue happens multiple times, improve the feedforward and feedback controls to make it less probable in the future — or prevent it entirely.

```
ISSUE OCCURS
    ↓
ANALYZE ROOT CAUSE
    ↓
IS IT RECURRING? ──→ No ──→ Log in LEARNINGS.md
    │
    Yes
    ↓
CAN IT BE PREVENTED COMPUTATIONALLY?
    ├── Yes ──→ Add guard rail / lint rule / type constraint
    ├── Partially ──→ Update skill + add computational sensor
    └── No ──→ Document as accuracy guardrail (inferential)
    ↓
VERIFY: Does the new control catch the issue?
    ↓
MONITOR: Track recurrence rate
```

### Escalation Path

| Stage | Action | Example |
|---|---|---|
| 1. Event Log | Record in `LEARNINGS.md` | "PR #423: Production deploy failed due to missing secret" |
| 2. Skill Update | Update `.agents/skills/` with procedural fix | "Add config contract check to deploy skill" |
| 3. Hard Constraint | Add to `hard-constraints.md` | "When adding `validateConfig()` var, update ALL CI workflows" |
| 4. Guard Rail | Add to pre-commit/pre-push hooks | "Block commits with missing workflow env vars" |
| 5. CI Gate | Add to `quality_gate.sh` or CI workflow | "Verify all secrets are present in deploy workflow" |

The steering loop is documented in `agents-docs/self-learning-patterns.md`.

---

## 4. Regulation Categories

The harness regulates the codebase across three dimensions:

### 4.1 Maintainability Harness
> Regulates internal code quality and maintainability. **This is our strongest category.**

**Guides:** AGENTS.md rules, TypeScript anti-patterns, line-count limits, quality standards, root directory policy.

**Sensors:** Typecheck, lint/format, quality gates (13 gates), pre-commit/pre-push hooks, guard rails.

**What it catches reliably (computational):** Duplicate code, cyclomatic complexity, missing test coverage, architectural drift, style violations, line-limit breaches, root policy violations.

**What it catches partially (inferential):** Semantically duplicate code, brute-force fixes, over-engineered solutions, misdiagnosis of issues.

**What it cannot catch:** Misunderstood instructions, unnecessary features — requires human judgment.

### 4.2 Architecture Fitness Harness
> Regulates architecture characteristics: performance, observability, security, reliability.

**Guides:** Infrastructure contracts in AGENTS.md, KV namespace bindings, validation gate definitions, MCP tool signatures.

**Sensors:** Validation gates (9-gate pipeline), DORA metrics endpoint, continuous verification (weekly sweep), OTLP exports.

**Current state:** Partially built. We have infrastructure contracts and validation gates, but limited performance/observability automated feedback.

### 4.3 Behaviour Harness
> Regulates functional correctness: does the application behave as intended?

**Guides:** Functional specs, GOAP plans, ADRs.

**Sensors:** Unit tests, integration tests, E2E tests, validation gates, the PEV (Plan-Execute-Verify) loop.

**Current state:** The hardest category. We rely on AI-generated tests + manual review. The PEV loop provides structured verification, but confidence in behavioural correctness still requires human supervision. See `agents-docs/accuracy-guardrails.md` for config contract checks that prevent specific failure modes.

---

## 5. Keep Quality Left

Following the article's guidance, checks are distributed across the development lifecycle from earliest to latest:

| Stage | Controls | Cost |
|---|---|---|
| **Pre-agent** (feedforward) | AGENTS.md, skills, hard constraints, context budgets | Negligible |
| **During agent** (inline) | TypeScript typecheck on changed files, format check | ~seconds |
| **Post-agent** (stop hooks) | `pev-gates.sh`, targeted unit tests in changed dirs | ~seconds–minutes |
| **Pre-commit** | Guard rails (10 gates): secrets, file size, line limits | ~seconds |
| **Pre-push** | Guard rails (9 gates): typecheck, tests, validation, security | ~1–5 minutes |
| **CI pipeline** | Full quality gate (13 gates), full test suite, build check | ~5–10 minutes |
| **Post-merge** | Weekly validation sweep, continuous verification, DORA metrics | ~minutes |
| **Continuous** | LEARNINGS.md monitoring, drift detection, dependency scanning | Ongoing |

---

## 6. Harnessability

> Not every codebase is equally amenable to harnessing.

### This Project's Strengths (Ambient Affordances)
- **TypeScript** — strong type system provides natural computational sensor
- **Cloudflare Workers** — well-defined infrastructure boundaries (KV, D1, DO)
- **Well-defined module structure** — `worker/routes/`, `worker/lib/`, `worker/pipeline/`
- **Existing quality infrastructure** — guard rails, hooks, quality gates already in place
- **Explicit contracts** — validation gates, MCP tool signatures, infrastructure bindings

### This Project's Challenges
- **Legacy complexity** — accrued technical debt from rapid iteration
- **Distributed state** — multiple KV namespaces, D1, Durable Objects, Vectorize
- **AI-generated code surface** — large portions built by agents; quality varies
- **Non-deterministic agents** — different models have different failure modes

### Improving Harnessability
- Enforce line-count limits to keep files tractable
- Maintain clear module boundaries with documented interfaces
- Escalate recurring issues through the steering loop
- Prefer computational sensors over inferential where possible

---

## 7. Harness Templates

The project already follows patterns that could become harness templates:

| Template | What's in place | What's missing |
|---|---|---|
| **Cloudflare Worker service** | wrangler.jsonc, KV/D1/DO bindings, middleware pipeline | Standardized deploy workflow harness |
| **API route** | Middleware (auth → rate-limit → handler), 9-gate validation | Route registration automated check |
| **Skill** | SKILL.md with frontmatter, reference/ subdir, ≤250 lines | Automated eval coverage verification |
| **GOAP swarm** | Plan → decompose → execute → verify | Pre-packaged swarm harness (guides + sensors bundle) |

---

## 8. The Role of the Human

> A harness externalizes what human developer experience brings to the table — but it can only go so far.

The goal of this harness is **not** to eliminate human input. It is to:
1. **Catch the predictable failures** computationally (style, types, structure, security)
2. **Self-correct the common mistakes** via hooks and guard rails
3. **Direct human attention** to what matters: functional correctness, design decisions, and what "good" looks like in this context

Human judgment is still required for: merge decisions, plan approval, verifying functional behaviour, and steering the harness itself.

---

## 9. Coherence: Keeping Guides and Sensors in Sync

As the harness grows, guides and sensors must not contradict:

- A guide that says "never use `x!`" must have a sensor (lint/typecheck) that catches it
- A sensor that fires must have a guide that explains the fix
- When a sensor never fires, verify: is quality high, or is detection inadequate?

The LEARNINGS.md log tracks failures where guides and sensors were out of sync (e.g., config contract changes that weren't picked up by existing sensors).

---

## 10. Architecture: How the Files Fit Together

```
HARNESS.md (this file — framework & philosophy)
  │
  ├── GUIDES (Feedforward)
  │   ├── AGENTS.md .................. Coordination rules, anti-patterns, delegation
  │   ├── hard-constraints.md ........ Line limits, trust thresholds, hot files
  │   ├── quality-standards.md ....... 500-line rule, atomic commits, URL rules
  │   ├── SKILLS.md .................. Skills as procedural guides
  │   ├── SUB-AGENTS.md .............. Sub-agents as context isolation guides
  │   ├── CONTEXT.md ................. Token budgets, back-pressure, chunking
  │   ├── PROJECT_STRUCTURE.md ....... Root policy, directory ownership
  │   └── NEVER-BYPASS-SYSTEM.md ..... Audit requirements, bypass policies
  │
  ├── SENSORS (Feedback)
  │   ├── HOOKS.md ................... Stop hooks, verify-on-change
  │   ├── GUARD_RAILS.md ............. Pre-commit/pre-push gates (10+9)
  │   ├── SYSTEM_REFERENCE.md ........ 9-gate validation pipeline, DORA metrics
  │   ├── accuracy-guardrails.md ..... Config contracts, endpoint format checks
  │   ├── LEARNINGS.md ............... Failure log (steering loop input)
  │   ├── LESSONS.md ................. Detailed post-mortems of failures
  │   └── self-learning-patterns.md .. Escalation from event → skill → constraint
  │
  └── OPERATIONS
      ├── quality-standards.md ....... Standards enforced by sensors
      ├── GUARD_RAILS.md ............. Local CI-matching enforcement
      └── CONTEXT.md ................. Back-pressure (both guide and sensor)
```

---

## 11. Further Reading

| Topic | File |
|---|---|
| Harness Engineering (source) | [martinfowler.com](https://martinfowler.com/articles/harness-engineering.html) |
| Skills | `agents-docs/SKILLS.md` |
| Sub-Agents | `agents-docs/SUB-AGENTS.md` |
| Hooks | `agents-docs/HOOKS.md` |
| Context & Back-Pressure | `agents-docs/CONTEXT.md` |
| Hard Constraints | `agents-docs/hard-constraints.md` |
| Self-Learning Patterns | `agents-docs/self-learning-patterns.md` |
| Never-Bypass System | `agents-docs/NEVER-BYPASS-SYSTEM.md` |
