# FLASH Module — Score

**Persona**: FLASH (Rapid Pragmatic Analyst)  
**Purpose**: Speed, pragmatism, shipping pressure, noise detection  
**Priority**: Unblock progress, minimize delay, target highest-impact issues

## score_output

Score any text output against configurable criteria.

### Usage

```bash
./scripts/score_output.sh <file> [--criteria noise,accuracy,completeness,clarity]
```

### Scoring Dimensions

#### 1. Noise Score (0-100)

Measures verbosity, repetition, and signal-to-noise ratio.

**Calculation**:

```
fluff_words = count_fluff_words(text)
total_words = word_count(text)
repetition_penalty = detect_repetition(text)

noise_score = 100 - ((fluff_words / total_words) * 100) - repetition_penalty
```

**Fluff Words** (weighted by severity):

- High: "very", "really", "quite", "rather", "fairly"
- Medium: "basically", "essentially", "actually", "literally"
- Low: "in order to", "due to the fact that", "at this point in time"

**Repetition Detection**:

- Same phrase >3 times in 100 words: -10 points
- Same sentence structure >5 times: -5 points
- Redundant headings (e.g., "Summary" then "In Summary"): -5 points

#### 2. Accuracy Score (0-100)

Measures how well claims match verifiable facts.

**Calculation**:

```
verifiable_claims = extract_claims(text)
correct_claims = verify_against_sources(verifiable_claims)

accuracy_score = (correct_claims / len(verifiable_claims)) * 100
```

**Claim Types Checked**:

- Version numbers (against VERSION file)
- File paths (existence check)
- Status claims ("Complete" vs actual state)
- Date references (chronological consistency)
- Count claims ("5 features" vs actual count)

#### 3. Completeness Score (0-100)

Measures presence of required sections.

**Calculation**:

```
required_sections = get_required_sections(doc_type)
present_sections = detect_sections(text)
missing_penalty = (len(required_sections - present_sections) / len(required_sections)) * 100

completeness_score = 100 - missing_penalty
```

**Required Sections by Type**:

| Document Type    | Required Sections                                 |
| ---------------- | ------------------------------------------------- |
| SKILL.md         | name, description, version, when_to_use, workflow |
| AGENTS.md        | Quick Start, Status, References                   |
| Feature doc      | Overview, Status, Usage                           |
| Coordination doc | Purpose, Protocol, State                          |

#### 4. Clarity Score (0-100)

Measures readability and structure.

**Calculation**:

```
flesch_score = flesch_reading_ease(text)
structure_score = evaluate_structure(text)
formatting_score = check_formatting(text)

clarity_score = (flesch_score * 0.4) + (structure_score * 0.4) + (formatting_score * 0.2)
```

**Flesch Reading Ease**:

- 90-100: Very Easy (score: 100)
- 80-89: Easy (score: 90)
- 70-79: Fairly Easy (score: 80)
- 60-69: Standard (score: 70)
- 50-59: Fairly Difficult (score: 60)
- 30-49: Difficult (score: 40)
- 0-29: Very Confusing (score: 20)

**Structure Evaluation**:

- Clear heading hierarchy: +20
- Consistent formatting: +20
- Logical flow: +20
- Bullet points for lists: +20
- Code examples where relevant: +20

### Overall Score Calculation

```
overall_score =
  (noise_score * 0.25) +
  (accuracy_score * 0.30) +
  (completeness_score * 0.25) +
  (clarity_score * 0.20)
```

### Grade Output

| Score  | Grade | Action                 | Time to Fix |
| ------ | ----- | ---------------------- | ----------- |
| 90-100 | A     | Ship immediately       | 0 min       |
| 80-89  | B     | Ship with minor fixes  | 5 min       |
| 70-79  | C     | Needs improvement      | 15 min      |
| 60-69  | D     | Block, requires rework | 30 min      |
| <60    | F     | Major revision needed  | 60+ min     |

## score_noise_level

Focused noise detection for quick checks.

### Usage

```bash
./scripts/score_noise_level.sh <file>
```

### Fast Noise Detection

Quick heuristics for rapid feedback:

```bash
# Check in <100ms for files <10KB
word_count=$(wc -w < "$file")
fluff_count=$(grep -c -E "\b(very|really|basically|essentially)\b" "$file")
repetition_lines=$(uniq -d "$file" | wc -l)

noise_percentage=$(( (fluff_count * 2 + repetition_lines) * 100 / word_count ))
score=$(( 100 - noise_percentage ))
```

### Output

```json
{
  "file": "AGENTS.md",
  "noise_score": 85,
  "findings": {
    "fluff_words": 12,
    "fluff_percentage": 2.4,
    "repeated_phrases": ["in order to", "please note"],
    "suggestions": [
      "Replace 'in order to' with 'to'",
      "Remove 'please note' - it's filler"
    ]
  },
  "grade": "B",
  "action": "Minor cleanup suggested"
}
```

## score_batch

Score multiple files for comparative analysis.

### Usage

```bash
./scripts/score_batch.sh <directory> [--output report.json]
```

### Output

```markdown
# Batch Scoring Report

| File                 | Noise | Accuracy | Complete | Clarity | Overall | Grade |
| -------------------- | ----- | -------- | -------- | ------- | ------- | ----- |
| AGENTS.md            | 85    | 95       | 90       | 88      | 89      | B+    |
| referral-system.md   | 78    | 60       | 85       | 82      | 75      | C     |
| quality-standards.md | 92    | 90       | 95       | 85      | 91      | A-    |

## Trends

- Average score: 81.7 (B-)
- Lowest: referral-system.md (version mismatch)
- Highest: quality-standards.md

## Quick Wins

1. Fix version in referral-system.md (+15 accuracy points)
2. Remove fluff from AGENTS.md line 23-25 (+5 noise points)
```

## Integration with FLASH Analysis

The score module implements FLASH's pragmatic approach:

1. **Fast Feedback**: Score in milliseconds, not seconds
2. **Blocker Focus**: Identify what actually blocks shipping
3. **Quick Wins**: Smallest changes for biggest impact
4. **Time Estimates**: How long to fix each issue
5. **Opportunity Cost**: What happens if we don't fix

This aligns with ANALYSIS SWARM Phase 3 (FLASH view).
