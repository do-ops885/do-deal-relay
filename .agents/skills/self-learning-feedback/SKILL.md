---
name: self-learning-feedback
description: Continuous verification, scoring, and improvement of AI outputs. Implements the 3-persona ANALYSIS SWARM pattern (RYAN-deep analysis, FLASH-speed, SOCRATES-questioning) for self-correcting documentation and code.
version: 0.1.6
author: analysis-swarm-team
tags: [verification, scoring, self-learning, feedback, analysis-swarm, quality]
---
# self-learning-feedback Skill
**Purpose**: Continuous verification, scoring, and improvement of AI outputs with integrated 3-persona analysis (RYAN, FLASH, SOCRATES).
**Problem Solved**:
- Version claims that don't match reality
- "Status: Complete" without evidence
- Misleading documentation left unchecked
- No feedback loop for improvement
## Core Architecture (ANALYSIS SWARM Pattern)
```
┌─────────────────────────────────────────────────────────────┐
│              self-learning-feedback SKILL                     │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │   RYAN     │  │   FLASH    │  │  SOCRATES  │             │
│  │   Module   │  │   Module   │  │   Module   │             │
│  │   (verify) │  │   (score)  │  │  (learn)   │             │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘             │
│        │               │               │                      │
│        └───────────────┼───────────────┘                      │
│                        ▼                                      │
│              ┌──────────────────┐                            │
│              │   SYNTHESIS      │                            │
│              │   (improve)      │                            │
│              └──────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```
## When to Use
- Before committing documentation or code claims
- When version numbers are referenced
- When claiming "Complete" or "Implemented" status
- To detect and reduce noise in outputs
- To build institutional knowledge from mistakes
- To prevent misleading information propagation
## Core Rule
**VERIFY BEFORE CLAIM**: Every status claim must have verifiable evidence
**SCORE BEFORE SHIP**: Every output gets a quality score (0-100)
**LEARN FROM MISTAKES**: Every error becomes institutional knowledge
## Module Reference

| Module    | Persona   | Purpose                            | Key Functions                                                                   |
| --------- | --------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `verify`  | RYAN      | Deep analysis, risk control        | `verify_version_consistency`, `verify_status_accuracy`, `verify_todo_alignment` |
| `score`   | FLASH     | Speed, pragmatism, noise detection | `score_noise_level`, `score_accuracy`, `score_completeness`, `score_clarity`    |
| `learn`   | SOCRATES  | Questioning, assumption testing    | `capture_lesson`, `track_trends`, `build_knowledge`                             |
| `improve` | SYNTHESIS | Balanced recommendations           | `suggest_fixes`, `auto_correct`, `report_issues`                                |

## Workflow
### 1. Verify Phase (RYAN Mode)
```bash
# Load verify module methods
skill self-learning-feedback
verify_method: verify_version_consistency
```
**Checks**:
- VERSION file matches all version claims
- "Status: Complete" has file/evidence backing
- Unchecked [ ] boxes don't conflict with status
- Cross-references resolve correctly
- No misleading typos ("left learnded")
### 2. Score Phase (FLASH Mode)
```bash
# Score output quality
score_method: score_output
input: <file_or_text>
criteria: [noise, accuracy, completeness, clarity]
```
**Scoring** (0-100 each):
- **Noise**: Verbosity, repetition, fluff ratio
- **Accuracy**: Claims match verifiable facts
- **Completeness**: Required sections present
- **Clarity**: Readability, structure, formatting
### 3. Learn Phase (SOCRATES Mode)
```bash
# Capture what went wrong
learn_method: capture_lesson
error_type: version_mismatch
evidence: "Skill claims v0.1.1 but VERSION is 0.1.1"
fix: "Update skill frontmatter to match VERSION file"
```
### 4. Improve Phase (SYNTHESIS)
```bash
# Get recommendations
improve_method: suggest_fixes
context: verify_results + scores + lessons
output: prioritized_fixes
```
## Verification Commands
### Quick Verify
```bash
# Run all verifications
bash .agents/skills/self-learning-feedback/scripts/quick_verify.sh
# Check specific file
bash .agents/skills/self-learning-feedback/scripts/verify_file.sh AGENTS.md
```
### Version Consistency
```bash
# Check all version claims
./scripts/verify_version_consistency.sh --fix
# Output shows:
# ✅ AGENTS.md: version 0.1.1 (matches VERSION)
# ❌ referral-system.md: claims v0.1.1 (should be 0.1.1)
# ❌ agents-update/SKILL.md: claims 1.0.0 (should be 0.1.1)
```
### Status Accuracy
```bash
# Verify "Complete" claims
./scripts/verify_status_accuracy.sh
# Output shows:
# ✅ input-methods.md: "All Implemented" - 6 files exist
# ❌ security.md: "Complete" - but has unchecked [ ] items
```
## Scoring System
### Output Scoring (0-100)

| Dimension    | Weight | Criteria                        |
| ------------ | ------ | ------------------------------- |
| Noise        | 25%    | <20% fluff words, no repetition |
| Accuracy     | 30%    | All verifiable claims correct   |
| Completeness | 25%    | All required sections present   |
| Clarity      | 20%    | Flesch reading ease >50         |

### Grade Thresholds

| Score  | Grade | Action                 |
| ------ | ----- | ---------------------- |
| 90-100 | A     | Ship immediately       |
| 80-89  | B     | Ship with minor fixes  |
| 70-79  | C     | Needs improvement      |
| 60-69  | D     | Block, requires rework |
| <60    | F     | Major revision needed  |

## Quality Gates
After verification and scoring:
```markdown
## Pre-Commit Gates
- [ ] Version claims match VERSION file (verify)
- [ ] "Status: Complete" has evidence (verify)
- [ ] All unchecked [ ] items explained (verify)
- [ ] Cross-references resolve (verify)
- [ ] No "left learnded" typos (verify)
- [ ] Score >80 on noise/accuracy (score)
- [ ] Lessons captured if errors found (learn)
- [ ] Fixes suggested if score <90 (improve)
```
## Error Handling
### Version Mismatch Found
**Cause**: Skill template copied, version not updated
**Solution**: Run `verify_version_consistency.sh --fix`
**Prevention**: Add to pre-commit hooks
### Status Claim Without Evidence
**Cause**: Documentation outdated vs. implementation
**Solution**: Update status or implement missing pieces
**Prevention**: Automated status verification in CI
### High Noise Score
**Cause**: Verbose output, repetition, low signal
**Solution**: Run `suggest_fixes` for condensation
**Prevention**: Noise check in pre-commit
## Best Practices
### DO:
- ✓ Verify before every commit that touches claims
- ✓ Score outputs before handoff
- ✓ Capture lessons from every error
- ✓ Use all 3 personas for complex decisions
- ✓ Maintain feedback history in D1/KV
### DON'T:
- ✗ Trust "Status: Complete" without verification
- ✗ Ignore version mismatches as "cosmetic"
- ✗ Skip scoring for "quick" changes
- ✗ Let one persona dominate decisions
- ✗ Lose error context between runs
## Integration Patterns
### With agents-update
```bash
# Optimize AGENTS.md, then verify
skill agents-update
skill self-learning-feedback verify_file AGENTS.md
```
### With skill-evaluator
```bash
# Evaluate skill structure + content
skill skill-evaluator --path agents-update
skill self-learning-feedback score_output agents-update/SKILL.md
```
### With CI Pipeline
```yaml
# .github/workflows/quality.yml
- name: Verify Claims
  run: skill self-learning-feedback verify_all --fail-on-error
- name: Score Outputs
  run: skill self-learning-feedback score_all --min-score 80
```
## References
- [Module Documentation](modules/) - RYAN, FLASH, SOCRATES, SYNTHESIS
- [Verification Scripts](scripts/) - Ready-to-use verification tools
- [Lesson Database](references/lessons.json) - Captured errors and fixes
- [ANALYSIS SWARM Pattern](references/analysis-swarm.md) - 3-persona methodology

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "Status: Complete" is already written down, so re-verifying it just burns cycles. | The RYAN verify phase exists because agents-docs/LESSONS.md LESSON-023 recorded features marked missing that had already shipped; verify_status_accuracy.sh flags a "Complete" label that still has unchecked boxes. |
| Noise and clarity are subjective, so scoring short docs adds nothing. | FLASH weights Noise at 25% and Clarity at 20% of the 0-100 score; anything under 90 is meant to trigger suggest_fixes.sh, so skipping the score lets fluff pass the gate. |
| Version strings are cosmetic; the frontmatter can lag the VERSION file. | verify_version_consistency.sh --fix is bundled precisely for this drift, and a stale version claim in a SKILL.md is the cheapest defect to catch at commit time. |
| Lessons live in my head; writing them to references/lessons.jsonl is busywork. | The SOCRATES learn phase turns each failure into a queryable record, and references/lessons.jsonl plus agents-docs/LESSONS.md are what later runs read back. |

## Red Flags

- [ ] A "Status: Complete" or "Implemented" claim is committed with no file path or command output attached as evidence.
- [ ] An output ships with no 0-100 score, or scores below 80 with no suggest_fixes.sh run.
- [ ] A version string is quoted in docs without verify_version_consistency.sh being run against the VERSION file.
- [ ] An error is corrected but no lesson is appended to references/lessons.jsonl or agents-docs/LESSONS.md.
- [ ] A section still carrying unchecked `[ ]` items is left labeled complete.
