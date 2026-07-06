# PEV Spec Template — do-deal-relay

Use this template for every task that goes through the PEV loop.
Fill in all sections before execution begins.

---

## Task

**Title**: [Short description]
**Author**: [Agent or human name]
**Date**: [ISO8601]
**Priority**: [high | medium | low]

## Goal

[One sentence: what are we building/changing?]

## Approach

[One sentence: how will we do it? This is what the human sanity-checks.]

## Non-Goals

Explicitly state what we are NOT doing:

- [ ] Not touching [unrelated system]
- [ ] Not rewriting [existing component]
- [ ] Not adding [out-of-scope feature]

## Steps

Decompose into the smallest steps that each leave the repo green:

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | | | low/medium/high |
| 2 | | | low/medium/high |
| 3 | | | low/medium/high |

## Acceptance Criteria

Concrete, testable statements the Verify phase will check:

- [ ] All 9 validation gates pass
- [ ] Unit test coverage >= 80%
- [ ] No lint warnings introduced
- [ ] No type errors introduced
- [ ] Trust score initialized correctly for new sources
- [ ] Deal schema validation passes
- [ ] Deduplication check passes
- [ ] Security scan clean (no SSRF, credential leak, injection)
- [ ] Existing tests still pass (no regression)

## Open Questions

If ambiguous, surface here instead of guessing:

- [ ] Question 1: [What's unclear?]
- [ ] Question 2: [What's unclear?]

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk 1] | [high/medium/low] | [How to mitigate] |

## Dependencies

- [ ] [Other task or system this depends on]

## Out of Scope for This Spec

- [Any related work that should be a separate spec]
