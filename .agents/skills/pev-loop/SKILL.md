---
name: pev-loop
description: Plan-Execute-Verify loop for non-trivial tasks. Use when implementing features, fixing bugs, or making architectural changes. Produces structured specs, executes in isolation, and verifies through independent gates the author cannot bypass.
---

# PEV Loop Skill

Plan-Execute-Verify discipline for reliable, auditable code changes. Replaces "prompt and hope" with structured engineering.

## When to Use

- Any task touching 2+ files
- Bug fixes requiring root cause analysis
- Feature additions with acceptance criteria
- Architectural changes requiring ADRs
- Security-sensitive modifications

## Core Loop

```
PLAN → EXECUTE → VERIFY → [pass: PR] / [fail: re-plan]
```

### 1. PLAN Phase

Produce a structured spec BEFORE writing any code.

**Use template**: `plans/SPEC_TEMPLATE.md`

Required fields:
- `goal`: One sentence describing what we're building
- `approach`: One sentence describing how (human sanity-checks this)
- `non_goals`: Explicit list of what we are NOT doing
- `acceptance_criteria`: Concrete, testable statements
- `open_questions`: Surface ambiguity instead of guessing

**Rules**:
- Decompose into smallest steps that each leave the repo green
- If uncertain, populate `open_questions` — do not guess
- Human reviews plan before execution begins

### 2. EXECUTE Phase

Implement the approved spec in isolated context.

**Rules**:
- Work in isolated context (git worktree or fresh branch)
- Every tool call executes within the worktree
- Write files only within the worktree boundary
- Progress logged to `plans/PROGRESS.json`
- Atomic commits with `type(scope): subject` format

### 3. VERIFY Phase

Run independent checks the author cannot bypass.

```bash
./scripts/pev-gates.sh
```

**Gate pipeline** (each is blocking):
1. `format` — Code formatting
2. `typecheck` — Type checking
3. `lint` — Linting rules
4. `tests:unit` — Unit tests with coverage floor
5. `security` — Security scanner
6. `deps` — Dependency audit
7. `schema` — Deal schema validation
8. `trust` — Trust score validation
9. `dedupe` — Deduplication check

**Failure flow**:
- Extract specific failing tests/findings
- Feed structured failure back to PLAN phase
- Re-plan with failure as new context
- Max 3 iterations before escalating to human

## Human Boundaries

Humans sit at three boundaries (not in the inner loop):

1. **Plan Approval** (highest ROI): Review approach + non_goals + acceptance_criteria — 30 seconds catches expensive mistakes
2. **Verify Escalation**: When loop exhausts attempts — receive structured failure, not raw logs
3. **Merge Decision**: Passing gate produces a PR, never auto-merge

## Integration with Existing Patterns

- **GOAP**: Plan phase uses GOAP decomposition for task breakdown
- **ADRs**: Complex architectural decisions produce ADRs in `plans/`
- **Validation Gates**: Verify phase runs the existing 9-gate validation
- **Trust Model**: Security gate uses existing trust scoring
- **Skills**: Reference `multi-agent-orchestration` for role separation

## Audit Trail

Every PEV run should emit:
```json
{
  "run_id": "uuid",
  "task": "description",
  "plan": { "approach": "...", "steps": [...], "non_goals": [...] },
  "gate_results": { "tests": "pass", "security": "pass", ... },
  "merge_decision": "pending",
  "timestamp": "ISO8601"
}
```

## Anti-Patterns to Avoid

- **Self-graded work**: Author and tester must be different agents/roles
- **Optional security**: Security scanning is blocking, not optional
- **Skipping plan**: Never execute without approved spec
- **Guessing in plan**: Surface ambiguity as `open_questions`
- **Human in inner loop**: Humans at boundaries, not reviewing every diff

## References

- `plans/PEV_LOOP.md` — Full PEV loop specification
- `plans/SPEC_TEMPLATE.md` — Structured spec template
- `scripts/pev-gates.sh` — Executable verification gates
- `worker/pipeline/independent-tester.ts` — Independent verification
- `worker/pipeline/security-gate.ts` — Security scanning
