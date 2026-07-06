---
description: Run Plan-Execute-Verify loop for a task
subtask: true
---

# PEV Command

Execute a task through the Plan-Execute-Verify discipline.

## Usage

```
/pev <task description>
```

## What Happens

1. **PLAN**: Generate structured spec using `plans/SPEC_TEMPLATE.md`
2. **EXECUTE**: Implement in isolated context
3. **VERIFY**: Run `./scripts/pev-gates.sh`

## Plan Phase

Create spec in `plans/` with:
- `goal`: What we're building (one sentence)
- `approach`: How we're doing it (one sentence)
- `non_goals`: What we're NOT doing
- `acceptance_criteria`: Testable requirements
- `open_questions`: Ambiguities to resolve

**Output**: `plans/PEV-{task-name}.md`

## Execute Phase

- Work in isolated context
- Atomic commits with `type(scope): subject`
- Progress logged to `plans/PROGRESS.json`

## Verify Phase

```bash
./scripts/pev-gates.sh
```

All gates must pass:
- format, typecheck, lint
- tests:unit (coverage >= 80%)
- security (SSRF, credentials, injection)
- schema, trust, dedupe

## Failure Flow

If gates fail:
1. Extract specific failing tests/findings
2. Feed structured failure back to PLAN
3. Re-plan with failure as new context
4. Max 3 iterations → escalate to human

## Human Boundaries

- **Plan Approval**: Review spec before execution
- **Verify Escalation**: Receive structured failure
- **Merge Decision**: PR requires human approval

## Example

```
/pev Add new broker source for Trading212 with trust_score 0.7
```

Produces:
1. `plans/PEV-trading212.md` (spec)
2. Code changes in isolated context
3. `./scripts/pev-gates.sh` results
4. PR if all gates pass
