# SYNTHESIS Module — Improve

**Persona**: SYNTHESIS (Integrated Analysis)  
**Purpose**: Combine RYAN rigor + FLASH pragmatism + SOCRATES reasoning into actionable recommendations  
**Priority**: Useful decisions, explicit trade-offs, concrete recommendations

## suggest_fixes

Generate prioritized fix recommendations from verification + scoring data.

### Usage

```bash
./scripts/suggest_fixes.sh \
  --verify-report verify_output.json \
  --score-report score_output.json \
  --output fixes.json
```

### Synthesis Logic

```python
def synthesize_fixes(verify_results, scores, lessons):
    """
    Combine all three persona outputs into prioritized fixes.
    """
    fixes = []

    # RYAN input: Critical issues first
    for issue in verify_results.critical_issues:
        fixes.append({
            "priority": "P0",
            "source": "RYAN-verify",
            "issue": issue.description,
            "fix": issue.remediation,
            "effort": issue.effort_estimate,
            "impact": issue.severity,
            "rationale": "Security/correctness risk"
        })

    # FLASH input: Quick wins
    for score in scores.low_scores:
        if score.effort_to_fix < 15:  # minutes
            fixes.append({
                "priority": "P1",
                "source": "FLASH-score",
                "issue": score.description,
                "fix": score.quick_fix,
                "effort": score.effort_to_fix,
                "impact": f"+{score.potential_improvement} points",
                "rationale": "High ROI, minimal effort"
            })

    # SOCRATES input: Knowledge-based prevention
    for lesson in lessons.relevant_lessons:
        fixes.append({
            "priority": "P2",
            "source": "SOCRATES-learn",
            "issue": lesson.pattern,
            "fix": lesson.prevention,
            "effort": lesson.prevention_effort,
            "impact": f"Prevents {lesson.frequency} future occurrences",
            "rationale": "Institutional knowledge application"
        })

    # Sort by: Priority, then Impact/Effort ratio
    return sorted(fixes, key=lambda f: (
        f["priority"],
        -f["impact"] / max(f["effort"], 1)
    ))
```

### Fix Output Format

```json
{
  "synthesis_timestamp": "2026-04-02T12:00:00Z",
  "input_summary": {
    "verify_issues": 3,
    "low_scores": 2,
    "relevant_lessons": 1
  },
  "fixes": [
    {
      "id": "FIX-001",
      "priority": "P0",
      "source": "RYAN-verify",
      "title": "Fix version mismatch in referral-system.md",
      "description": "File claims v0.1.1 but VERSION is 0.1.1",
      "current_state": "v0.1.1",
      "desired_state": "v0.1.1",
      "effort_minutes": 2,
      "impact": "Resolves HIGH severity accuracy issue",
      "fix_command": "sed -i 's/v0.1.1/v0.1.1/' agents-docs/features/referral-system.md",
      "rationale": "RYAN: Version accuracy is critical for trust",
      "trade_offs": "None - pure correctness improvement"
    },
    {
      "id": "FIX-002",
      "priority": "P1",
      "source": "FLASH-score",
      "title": "Remove fluff words from AGENTS.md",
      "description": "12 fluff words reduce clarity score by 5 points",
      "current_state": "Score: 85",
      "desired_state": "Score: 90",
      "effort_minutes": 5,
      "impact": "+5 clarity points, faster reading",
      "fix_command": "./scripts/remove_fluff.sh AGENTS.md",
      "rationale": "FLASH: 5 min effort → +5 points is high ROI",
      "trade_offs": "None - pure improvement"
    },
    {
      "id": "FIX-003",
      "priority": "P2",
      "source": "SOCRATES-learn",
      "title": "Add version check to skill template",
      "description": "Prevent future version mismatches at creation time",
      "current_state": "Template has hardcoded version",
      "desired_state": "Template uses {{VERSION}} variable",
      "effort_minutes": 30,
      "impact": "Prevents ~15 version errors/month",
      "fix_command": "Update skill scaffolding template",
      "rationale": "SOCRATES: Lesson learned from LESSON-042",
      "trade_offs": "30 min setup → saves 15*2 min = 30 min/month ongoing"
    }
  ],
  "synthesis_recommendation": {
    "immediate": ["FIX-001"],
    "today": ["FIX-002"],
    "this_sprint": ["FIX-003"],
    "estimated_total_effort": "37 minutes",
    "estimated_quality_improvement": "+15 overall score points"
  }
}
```

## auto_correct

Apply safe, deterministic fixes automatically.

### Usage

```bash
./scripts/auto_correct.sh --input fixes.json --dry-run
./scripts/auto_correct.sh --input fixes.json --apply
```

### Safety Rules

Only auto-correct if ALL are true:

1. Change is deterministic (same input → same output)
2. Change is reversible (can undo)
3. No semantic meaning altered (only formatting/typos)
4. Score improvement >10 points
5. RYAN severity < HIGH (no security risk)

### Auto-Correctable Issues

| Issue                 | Safe? | Method                      |
| --------------------- | ----- | --------------------------- |
| Version string update | Yes   | String replacement          |
| Fluff word removal    | Yes   | Pattern deletion            |
| Typo fixes            | Yes   | Dictionary replacement      |
| Formatting            | Yes   | Whitespace normalization    |
| Status claim changes  | No    | Requires human verification |
| Section additions     | No    | May change meaning          |

### Dry Run Output

```
=== Auto-Correct Dry Run ===

Would apply 2 of 3 fixes:

✅ FIX-001: Version update (safe, deterministic)
   Change: v0.1.1 → v0.1.1
   File: referral-system.md

✅ FIX-002: Fluff removal (safe, reversible)
   Remove: 12 instances of "basically", "essentially"
   File: AGENTS.md

❌ FIX-003: Skill template (not safe)
   Reason: Changes scaffolding behavior
   Action: Manual review required

Run with --apply to execute safe fixes.
```

## report_issues

Generate human-readable issue reports for review.

### Usage

```bash
./scripts/report_issues.sh --format markdown --output report.md
```

### Report Format

```markdown
# Issue Report

Generated: 2026-04-02T12:00:00Z  
Synthesized from: RYAN verify + FLASH score + SOCRATES lessons

---

## 🚨 Critical (P0) — Fix Immediately

### Issue 1: Version Mismatch (HIGH Severity)

**Location**: agents-docs/features/referral-system.md line 3  
**RYAN Analysis**: Claims v0.1.1, actual project version is 0.1.1  
**Impact**: Users may assume feature is production-ready  
**FLASH Assessment**: 2 minute fix, prevents trust erosion  
**SOCRATES Question**: What else claims v0.1.1 incorrectly?

**Fix**: `sed -i 's/v0.1.1/v0.1.1/' agents-docs/features/referral-system.md`

---

## ⚠️ Warning (P1) — Fix Today

### Issue 2: High Noise Level

**Location**: AGENTS.md lines 23-25  
**RYAN Analysis**: 5 fluff words in 50 word paragraph  
**Impact**: Reduced readability, slower comprehension  
**FLASH Assessment**: 5 minute fix for +5 clarity points  
**Recommendation**: Remove "essentially", "in order to"

---

## 💡 Opportunity (P2) — Fix This Sprint

### Issue 3: Recurring Pattern

**SOCRATES Insight**: Version mismatches occur 15x/month  
**Root Cause**: Template has hardcoded version  
**Long-term Fix**: Add variable to scaffolding  
**ROI**: 30 min setup → saves 30 min/month

---

## Summary

| Priority  | Count | Effort     | Impact                       |
| --------- | ----- | ---------- | ---------------------------- |
| P0        | 1     | 2 min      | Resolve trust issue          |
| P1        | 1     | 5 min      | +5 clarity points            |
| P2        | 1     | 30 min     | Prevent 15 errors/month      |
| **Total** | **3** | **37 min** | **Significant quality gain** |

## Recommended Actions

1. **Now**: Run auto_correct.sh --apply (safe fixes)
2. **Today**: Review and merge P1 fixes
3. **This sprint**: Implement P2 prevention

---

_This report synthesizes RYAN's rigor, FLASH's pragmatism, and SOCRATES' questioning._
```

## resolve_conflicts

Handle disagreements between persona analyses.

### When Personas Disagree

| Scenario                                   | Resolution                             |
| ------------------------------------------ | -------------------------------------- |
| RYAN says CRITICAL, FLASH says LOW_EFFORT  | Fix immediately (both agree urgency)   |
| RYAN says CRITICAL, FLASH says HIGH_EFFORT | Balanced: Fix with safety checks       |
| FLASH says QUICK_WIN, SOCRATES questions   | Test assumption, then decide           |
| All three disagree                         | Escalate to human, document trade-offs |

### Conflict Resolution Output

```markdown
## Conflict Resolution: Issue X

### RYAN Position

Severity: CRITICAL — Version mismatch could mislead users about stability

### FLASH Position

Effort: 2 minutes — String replacement, trivial fix

### SOCRATES Position

Confidence: HIGH — Clear evidence, no ambiguity

### Resolution

✅ **No conflict** — All agree fix is worth doing immediately
Action: Proceed with auto_correct

---

## Conflict Resolution: Issue Y

### RYAN Position

Severity: MEDIUM — Status claim slightly ahead of implementation

### FLASH Position

Effort: 2 hours — Requires actual implementation work

### SOCRATES Position

Confidence: LOW — Unclear if "Complete" means code or also tested

### Resolution

⚠️ **Unresolved tension** — Trade-off between accuracy and effort

Options:

1. **Conservative** (RYAN): Revert status to "In Progress"
2. **Pragmatic** (FLASH): Keep status, add "Tested in dev only" caveat
3. **Investigate** (SOCRATES): Check what "Complete" was intended to mean

**Synthesis Recommendation**: Option 2 with explicit caveat
Rationale: 2 hours of implementation for a documentation fix is poor ROI
```

## Integration with SYNTHESIS Phase

The improve module combines all three personas:

1. **RYAN contributes**: Rigor, correctness priorities, severity ranking
2. **FLASH contributes**: Pragmatism, effort estimates, quick wins
3. **SOCRATES contributes**: Questioning, assumption testing, knowledge application

**Synthesis converts tension into decisions**:

- When RYAN and FLASH disagree → Present explicit trade-off
- When confidence is low → SOCRATES probes further
- When all agree → Fast execution

This aligns with ANALYSIS SWARM Phase 5 (Synthesis).

## Decision Modes Integration

| Mode         | Synthesis Approach                                 |
| ------------ | -------------------------------------------------- |
| REVIEW       | Combine all three analyses for thorough assessment |
| TRIAGE       | FLASH-weighted, prioritize blockers                |
| COMPARE      | SOCRATES-heavy, test each option equally           |
| DEBUG        | RYAN-heavy, systematic cause analysis              |
| SECURITY     | RYAN-dominant, safety first                        |
| ARCHITECTURE | Balanced, long-term implications                   |
