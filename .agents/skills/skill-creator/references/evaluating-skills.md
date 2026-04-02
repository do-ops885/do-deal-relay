# Evaluating Skill Output Quality

## Overview

Skill evaluation measures how effectively an agent can use a skill to complete tasks. This guide covers evaluation methodology, metrics, and interpretation.

## Evaluation Framework

### Success Criteria

A skill is successful when an agent can:

1. **Understand** - Parse and comprehend the instructions
2. **Execute** - Follow the steps correctly
3. **Complete** - Achieve the stated goal
4. **Adapt** - Handle variations and edge cases

### Evaluation Types

#### 1. Correctness Evaluation

Does the output match expected results?

**Pass criteria**:

- Output format is correct
- Values are accurate
- Logic follows instructions
- Edge cases handled

**Example**:

```
Task: Generate a SQL query to find active users
Expected: SELECT * FROM users WHERE active = true
Actual:   SELECT * FROM users WHERE status = 'active'
Verdict:  PASS (semantically equivalent)
```

#### 2. Efficiency Evaluation

How efficiently does the agent complete the task?

**Metrics**:

- Time to completion
- Number of API calls
- Token usage
- Iterations required

**Scoring**:

- **Excellent**: First attempt, minimal resources
- **Good**: 1-2 corrections needed
- **Fair**: Multiple attempts but succeeds
- **Poor**: Fails or uses excessive resources

#### 3. Completeness Evaluation

Does the output address all requirements?

**Checklist approach**:

- [ ] All requested fields present
- [ ] Constraints respected
- [ ] Error cases covered
- [ ] Documentation included

## Evaluation Process

### Step 1: Define Test Cases

Create test cases covering:

- Common scenarios (80% of usage)
- Edge cases (boundary conditions)
- Error cases (invalid inputs)
- Complex scenarios (multiple requirements)

Example test suite:

```json
{
  "test_cases": [
    {
      "name": "Basic query",
      "input": "Get all users",
      "expected": "SELECT * FROM users",
      "type": "common"
    },
    {
      "name": "Filtered query",
      "input": "Get active users over 18",
      "expected": "SELECT * FROM users WHERE active = true AND age > 18",
      "type": "common"
    },
    {
      "name": "Empty result",
      "input": "Get users with negative age",
      "expected": "SELECT * FROM users WHERE age < 0",
      "type": "edge"
    }
  ]
}
```

### Step 2: Execute Tests

Run each test case through the agent with the skill loaded.

### Step 3: Score Results

Use this rubric:

| Score | Description                              |
| ----- | ---------------------------------------- |
| 5     | Perfect - exactly as expected            |
| 4     | Good - minor differences, still correct  |
| 3     | Acceptable - correct but could be better |
| 2     | Partial - some elements correct          |
| 1     | Wrong - does not meet requirements       |
| 0     | Failed - error or no output              |

### Step 4: Calculate Metrics

```python
# Success rate
success_rate = (passing_tests / total_tests) * 100

# Average score
avg_score = sum(all_scores) / len(all_scores)

# Weighted score by type
weighted_score = (
    common_avg * 0.5 +
    edge_avg * 0.3 +
    error_avg * 0.2
)
```

## Evaluation Metrics

### Primary Metrics

1. **Success Rate** (0-100%)
   - Critical for skill viability
   - Target: >90% for production skills

2. **Mean Score** (0-5 scale)
   - Overall quality indicator
   - Target: >4.0 for production skills

3. **Consistency** (std dev of scores)
   - Low variance = reliable skill
   - Target: <1.0 standard deviation

### Secondary Metrics

4. **Time to Complete** (seconds)
   - Efficiency measure
   - Compare against baseline

5. **Token Usage** (tokens)
   - Cost efficiency
   - Track across test runs

6. **Error Types** (categorized)
   - Understanding errors
   - Execution errors
   - Tool selection errors
   - Logic errors

## Benchmarking

### Creating a Benchmark Suite

```python
# benchmark.py
import json
from pathlib import Path

class SkillBenchmark:
    def __init__(self, skill_path, test_cases_path):
        self.skill_path = skill_path
        self.test_cases = json.loads(Path(test_cases_path).read_text())
        self.results = []

    def run(self):
        for test in self.test_cases:
            result = self.execute_test(test)
            self.results.append(result)
        return self.aggregate()

    def execute_test(self, test):
        # Run the test through the agent
        # Return structured result
        pass

    def aggregate(self):
        return {
            "success_rate": self.calculate_success_rate(),
            "mean_score": self.calculate_mean_score(),
            "by_type": self.aggregate_by_type()
        }
```

### Running Benchmarks

```bash
# Single skill
python benchmark.py --skill ./my-skill --tests ./tests.json --output results/

# Compare multiple skills
python benchmark.py --skills ./skill1 ./skill2 --tests ./tests.json --compare

# Use aggregate_benchmark.py to combine results
python aggregate_benchmark.py ./results/
```

## Interpreting Results

### Success Rate Analysis

| Range   | Interpretation | Action                        |
| ------- | -------------- | ----------------------------- |
| 95-100% | Excellent      | Production ready              |
| 85-94%  | Good           | Minor improvements needed     |
| 70-84%  | Fair           | Significant issues to address |
| 50-69%  | Poor           | Major revision required       |
| <50%    | Failing        | Redesign needed               |

### Score Distribution

Analyze score distribution to identify patterns:

```python
# Identify weak areas
common_scores = [r.score for r in results if r.type == 'common']
edge_scores = [r.score for r in results if r.type == 'edge']

if mean(common_scores) < 4:
    print("Common scenarios need improvement")

if mean(edge_scores) < 3:
    print("Edge case handling is weak")
```

### Error Pattern Analysis

Track error types to identify skill weaknesses:

```python
errors_by_type = {}
for result in results:
    if result.error:
        error_type = categorize_error(result.error)
        errors_by_type[error_type] = errors_by_type.get(error_type, 0) + 1

# Most common errors indicate skill gaps
most_common = max(errors_by_type, key=errors_by_type.get)
print(f"Most common error: {most_common}")
```

## Improving Skills Based on Evaluation

### Low Success Rate

**Causes**:

- Unclear instructions
- Missing context
- Overly complex examples
- Poor error handling

**Solutions**:

- Rewrite unclear sections
- Add more examples
- Break complex tasks into steps
- Document error scenarios

### High Variance

**Causes**:

- Ambiguous instructions
- Multiple valid approaches
- Missing constraints

**Solutions**:

- Make instructions more specific
- Show preferred approach
- Clearly define requirements

### Consistent Failures

**Causes**:

- Wrong information in skill
- Missing prerequisite knowledge
- Platform changes

**Solutions**:

- Verify all facts
- Add prerequisite section
- Update for platform changes

## Continuous Evaluation

### Regression Testing

Run benchmarks after any skill change:

```bash
# Before changes
git stash
python benchmark.py --output baseline/

# After changes
git stash pop
python benchmark.py --output current/

# Compare
python compare_benchmarks.py baseline/ current/
```

### Monitoring in Production

Track real-world performance:

- Log success/failure rates
- Collect user feedback
- Monitor error patterns
- Measure task completion time

### Iterative Improvement

1. **Collect data** from benchmarks and usage
2. **Identify weaknesses** from failures
3. **Update skill** to address issues
4. **Re-test** to verify improvements
5. **Version** and **deploy** updated skill

## Report Template

```markdown
# Skill Evaluation Report

## Summary

- Skill: [name]
- Version: [version]
- Date: [date]
- Success Rate: [X%]
- Mean Score: [X.X/5]

## Test Coverage

- Common scenarios: [X/Y]
- Edge cases: [X/Y]
- Error cases: [X/Y]

## Key Findings

1. [Finding 1]
2. [Finding 2]
3. [Finding 3]

## Recommendations

1. [Rec 1]
2. [Rec 2]
3. [Rec 3]

## Raw Results

[Link to detailed results]
```

## Tools

- [aggregate_benchmark.py](../scripts/aggregate_benchmark.py) - Combine benchmark runs
- quick_validate.py - Basic structure validation
- test_skill.py - Template for skill-specific tests
