# SOCRATES Module — Learn

**Persona**: SOCRATES (Questioning Facilitator)  
**Purpose**: Surface assumptions, expose blind spots, test confidence, improve synthesis  
**Priority**: Disciplined questioning, assumption testing, knowledge building

## capture_lesson

Store errors and their fixes for future learning.

### Usage

```bash
./scripts/capture_lesson.sh \
  --error-type version_mismatch \
  --context "Referral system claims v0.1.1" \
  --evidence "VERSION file shows 0.1.1" \
  --fix "Update frontmatter version" \
  --prevention "Add version check to skill template"
```

### Lesson Format

```json
{
  "lesson_id": "LESSON-042",
  "timestamp": "2026-04-02T12:00:00Z",
  "error_type": "version_mismatch",
  "severity": "HIGH",
  "context": "Skill created from template without version update",
  "evidence": {
    "claimed": "v0.1.1",
    "actual": "0.1.1",
    "files_affected": [
      "agents-docs/features/referral-system.md",
      ".agents/skills/agents-update/SKILL.md"
    ]
  },
  "root_cause": "Template included hardcoded version; no verification step in skill creation workflow",
  "fix_applied": "Updated all instances to match VERSION file",
  "prevention": {
    "immediate": "Run verify_version_consistency.sh after skill creation",
    "long_term": "Add version template variable to skill scaffolding"
  },
  "tags": ["version", "template", "verification"],
  "confidence": "HIGH"
}
```

### Lesson Categories

| Category          | Examples                    | Storage      |
| ----------------- | --------------------------- | ------------ |
| version_mismatch  | Wrong version claims        | lessons.json |
| status_inaccurate | "Complete" without evidence | lessons.json |
| noise_excess      | Verbose outputs             | lessons.json |
| typo_misleading   | "left learnded"             | lessons.json |
| claim_unverified  | Unsubstantiated statements  | lessons.json |

## track_trends

Analyze quality scores over time.

### Usage

```bash
./scripts/track_trends.sh --period 30d --output trends.json
```

### Trend Metrics

```json
{
  "period": "30d",
  "summary": {
    "files_tracked": 15,
    "total_scans": 127,
    "average_score": 82.3,
    "trend_direction": "improving",
    "trend_slope": +1.4
  },
  "improvements": [
    {
      "file": "AGENTS.md",
      "score_30d_ago": 72,
      "current_score": 89,
      "improvement": +17,
      "likely_cause": "Applied agents-update skill"
    }
  ],
  "regressions": [
    {
      "file": "new-feature.md",
      "score_30d_ago": null,
      "current_score": 65,
      "concern": "New file below threshold"
    }
  ],
  "patterns": [
    {
      "pattern": "Version mismatches decreasing",
      "evidence": "5 last month → 1 this month",
      "attribution": "verify_version_consistency.sh in CI"
    }
  ]
}
```

## build_knowledge

Accumulate institutional knowledge from lessons.

### Knowledge Base Structure

```json
{
  "patterns": {
    "common_errors": [
      {
        "pattern": "Template version not updated",
        "frequency": 15,
        "first_seen": "2026-03-01",
        "last_seen": "2026-04-02",
        "fix_effectiveness": 100,
        "related_lessons": ["LESSON-001", "LESSON-042"]
      }
    ],
    "successful_interventions": [
      {
        "intervention": "Add verification to CI",
        "error_type_reduced": "version_mismatch",
        "reduction_percentage": 80,
        "confidence": "HIGH"
      }
    ]
  },
  "heuristics": {
    "high_noise_indicators": [
      "Words ending in -ly >5% of text",
      "Sentence length >30 words average",
      "Same phrase repeated >3 times"
    ],
    "accuracy_red_flags": [
      "Version number without v prefix inconsistency",
      "Status claim in header without date",
      "All items checked without evidence"
    ]
  }
}
```

## question_assumptions

SOCRATES' core method: ask questions that improve decision quality.

### Usage

```bash
./scripts/question_assumptions.sh --context <file> --depth medium
```

### Output Format

```markdown
# Assumption Testing Report

## Context

File: agents-update/SKILL.md
Claim: "Version: 0.1.1"

## Questions

1. **What version should this be?**
   - Assumption tested: 1.0.0 is correct
   - Evidence: VERSION file shows 0.1.1
   - Finding: Assumption incorrect

2. **Why was 1.0.0 chosen?**
   - Assumption tested: Intentional version bump
   - Evidence: Matches template default
   - Finding: Likely copy-paste error, not intentional

3. **What if this version is trusted?**
   - Assumption tested: Consequences of error are low
   - Evidence: User may think feature is production-ready
   - Finding: Risk is MEDIUM (misleading stability)

## Conclusion

Version claim appears to be template default, not intentional.
Recommend updating to match project VERSION (0.1.1).
```

### Question Categories

| Category    | Purpose                     | Example                              |
| ----------- | --------------------------- | ------------------------------------ |
| Evidence    | Test if claims have backing | "What evidence supports 'Complete'?" |
| Consequence | Test impact of being wrong  | "What if this status is inaccurate?" |
| Alternative | Surface other possibilities | "What else could explain this?"      |
| Confidence  | Test certainty level        | "How sure are we about this?"        |

## test_confidence

Measure confidence levels and suggest when to escalate.

### Confidence Levels

| Level   | Criteria                           | Action                  |
| ------- | ---------------------------------- | ----------------------- |
| HIGH    | Verified by multiple sources       | Proceed with confidence |
| MEDIUM  | Partial evidence, some assumptions | Proceed with monitoring |
| LOW     | Limited evidence, high assumptions | Escalate for review     |
| UNKNOWN | No evidence available              | Block until verified    |

### Usage

```bash
./scripts/test_confidence.sh --claim "All input methods implemented" --evidence files/
```

## Integration with SOCRATES Analysis

The learn module implements SOCRATES' questioning approach:

1. **Ask Targeted Questions**: The fewest that most improve the decision
2. **Challenge Views Equally**: Both cautious and aggressive views
3. **Reveal Missing Context**: What don't we know?
4. **Test Consequences**: What if we're wrong?
5. **Identify Confidence Changers**: What would change our mind?

This aligns with ANALYSIS SWARM Phase 4 (SOCRATES view).
