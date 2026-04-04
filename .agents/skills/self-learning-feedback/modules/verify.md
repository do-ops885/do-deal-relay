# RYAN Module — Verify

**Persona**: RYAN (Methodical Analyst)
**Purpose**: Deep analysis, risk control, evidence-backed verification
**Priority**: Security, correctness, maintainability

## verify_version_consistency

Check all version claims against the single source of truth (VERSION file).

### Usage

```bash
./scripts/verify_version_consistency.sh [--fix] [--report]
```

### Checks

1. Read VERSION file (source of truth)
2. Find all version claims in:
   - All SKILL.md frontmatter
   - All documentation headers
   - All markdown version badges
3. Compare each claim to VERSION
4. Report mismatches
5. Optionally fix (with --fix)

### Output Format

```json
{
  "source_version": "0.1.1",
  "checks": [
    {
      "file": "AGENTS.md",
      "claimed": "0.1.1",
      "actual": "0.1.1",
      "status": "PASS"
    },
    {
      "file": "agents-docs/features/referral-system.md",
      "claimed": "v0.1.1",
      "actual": "0.1.1",
      "status": "FAIL",
      "severity": "HIGH"
    }
  ],
  "summary": {
    "total": 20,
    "pass": 18,
    "fail": 2
  }
}
```

### Severity Levels

| Level    | Criteria                        | Action            |
| -------- | ------------------------------- | ----------------- |
| CRITICAL | Security doc version mismatch   | Block release     |
| HIGH     | Feature doc vs VERSION mismatch | Must fix          |
| MEDIUM   | Skill version mismatch          | Should fix        |
| LOW      | Comment/inline version          | Fix if convenient |

### Fix Mode

With `--fix`, automatically updates:

- SKILL.md frontmatter version fields
- Documentation version headers
- Badge versions in markdown

Preserves:

- Historical version references in changelog
- Comments explaining version rationale
- Internal version tracking files

## verify_status_accuracy

Verify that "Status: Complete" and similar claims have evidence.

### Usage

```bash
./scripts/verify_status_accuracy.sh [--strict]
```

### Evidence Requirements

| Claim                  | Required Evidence                        |
| ---------------------- | ---------------------------------------- |
| "Status: Complete"     | Implementation files exist, tests pass   |
| "All Implemented"      | Each item has corresponding file/code    |
| "Ready for Production" | No unchecked TODOs, security checks pass |
| "MVP Complete"         | Core features demonstrable               |

### Strict Mode

With `--strict`, also requires:

- Test coverage >80% for "Complete"
- Documentation exists for all public APIs
- No open blockers in tracking files

## verify_todo_alignment

Check that unchecked [ ] items don't conflict with status claims.

### Usage

```bash
./scripts/verify_todo_alignment.sh
```

### Logic

```
IF document says "Status: Complete"
AND document has unchecked [ ] items
THEN status claim is MISLEADING
```

### Exceptions

These are allowed and don't count as misaligned:

- [ ] Items in "Future Work" or "Roadmap" sections
- [ ] Items explicitly marked as "Optional"
- [ ] Items with "Deferred" or "Post-MVP" labels

## verify_cross_references

Check that all internal links resolve correctly.

### Usage

```bash
./scripts/verify_cross_references.sh [--fix-broken]
```

### Checks

1. Extract all markdown links `[text](path)`
2. Resolve relative paths
3. Verify target files exist
4. Check anchor links (#section) exist in target
5. Report 404s and suggest fixes

## verify_typo_misleading

Check for typos that could mislead (like "left learnded").

### Usage

```bash
./scripts/verify_typo_misleading.sh
```

### Patterns Checked

| Pattern        | Why Misleading     | Suggested Fix         |
| -------------- | ------------------ | --------------------- |
| "left learned" | Nonsensical phrase | "lessons learned"     |
| "learnded"     | Misspelling        | "learned" or "learnt" |
| "complet"      | Incomplete word    | "complete"            |
| "statu:"       | Missing letter     | "status:"             |

### Confidence Levels

- **HIGH**: Clear misspelling with obvious fix
- **MEDIUM**: Ambiguous, requires context review
- **LOW**: Possible false positive, flag for review

## Verification Report Format

All verify commands output structured reports:

```markdown
# Verification Report

**Run Date**: 2026-04-02T12:00:00Z
**Source Version**: 0.1.1
**Status**: NEEDS_ATTENTION

## Summary

| Check               | Status  | Count        |
| ------------------- | ------- | ------------ |
| Version Consistency | ❌ FAIL | 2 mismatches |
| Status Accuracy     | ⚠️ WARN | 1 unverified |
| TODO Alignment      | ✅ PASS | 0 conflicts  |
| Cross References    | ✅ PASS | 0 broken     |
| Typos               | ⚠️ WARN | 3 found      |

## Details

### Version Consistency

| File                   | Claimed | Actual | Severity |
| ---------------------- | ------- | ------ | -------- |
| referral-system.md     | v0.1.1  | 0.1.1  | HIGH     |
| agents-update/SKILL.md | 1.0.0   | 0.1.1  | MEDIUM   |

### Recommended Actions

1. [HIGH] Update referral-system.md version
2. [MEDIUM] Update agents-update skill version
3. [LOW] Review typo warnings in AGENTS.md line 45
```

## Integration with RYAN Analysis

The verify module implements RYAN's methodical approach:

1. **Gather Context**: Find all version/status claims
2. **Identify Risks**: Mismatches, misleading claims
3. **Explain Impact**: Why accuracy matters
4. **Rank by Severity**: Critical > High > Medium > Low
5. **Provide Remediation**: Clear fix instructions

This aligns with ANALYSIS SWARM Phase 2 (RYAN view).
