# Common Output Patterns for Agents

## Overview

This guide documents common output patterns that skills should use for consistent, agent-friendly responses.

## Response Formats

### 1. Action-Based Responses

When the agent should perform actions, use a structured format:

```markdown
## Actions to Take

1. **Read file**: `/path/to/file`

   - Offset: 10
   - Limit: 50 lines

2. **Edit file**: `/path/to/file`

   - Replace line 15: `old code` → `new code`

3. **Run command**: `npm test`
   - Working directory: `/project`
```

### 2. Informational Responses

When providing information:

```markdown
## Summary

[Concise summary of findings]

## Details

### Section 1

- Point A
- Point B

### Section 2

- Point C
- Point D

## Recommendations

1. [First recommendation]
2. [Second recommendation]
```

### 3. Error Responses

When something goes wrong:

```markdown
## Error

**Type**: [error category]
**Location**: [where it occurred]
**Message**: [what went wrong]

## Context

[Relevant information about the error]

## Suggested Actions

1. [How to fix or investigate]
2. [Alternative approach]
```

## Code-Related Patterns

### Code Changes

````markdown
## Changes Required

### File: `src/example.js`

**Change 1**: Add import at line 1

```javascript
import { newFunction } from "./module";
```
````

**Change 2**: Update function at line 25

```javascript
// Before
function oldFunc() {
  return oldValue;
}

// After
function oldFunc() {
  return newFunction(oldValue);
}
```

````

### Code Review

```markdown
## Review: `src/example.js`

### Issues Found

1. **Line 15**: Unused variable `temp`
   - Severity: minor
   - Suggestion: Remove or use the variable

2. **Line 42**: Missing error handling
   - Severity: major
   - Suggestion: Add try-catch block

### Positive Observations

- Good use of async/await
- Clear variable naming
- Proper documentation

### Suggestions

1. Consider extracting logic into smaller functions
2. Add unit tests for edge cases
````

## File System Patterns

### File Listing

```markdown
## Files in `src/`
```

- src/
  - main.js (updated 2 hours ago)
  - utils/
    - helper.js (updated 1 day ago)
    - constants.js (updated 3 days ago)
  - components/
    - Button.jsx (updated 5 hours ago)
    - Card.jsx (updated 1 day ago)

```

```

### File Search Results

````markdown
## Search Results for "TODO"

Found 3 matches:

1. `src/main.js:15`
   ```javascript
   // TODO: Add error handling
   processData();
   ```
````

2. `src/utils/helper.js:42`

   ```javascript
   // TODO: Optimize this loop
   for (let i = 0; i < items.length; i++) {
   ```

3. `tests/main.test.js:8`
   ```javascript
   // TODO: Add more test cases
   test('basic functionality', () => {
   ```

````

## Data Presentation

### Tabular Data

```markdown
## Results

| Name | Status | Score | Last Updated |
|------|--------|-------|--------------|
| Test 1 | PASS | 95% | 2025-01-20 |
| Test 2 | FAIL | 45% | 2025-01-20 |
| Test 3 | PASS | 88% | 2025-01-19 |
````

### Comparison

```markdown
## Comparison: Option A vs Option B

| Criteria    | Option A | Option B |
| ----------- | -------- | -------- |
| Performance | Fast     | Slower   |
| Complexity  | Low      | High     |
| Maintenance | Easy     | Hard     |
| Cost        | $100/mo  | $50/mo   |

**Recommendation**: Option A for performance-critical paths, Option B for cost savings
```

### Progress Tracking

```markdown
## Progress: Task Implementation

- [x] Step 1: Setup project structure
- [x] Step 2: Install dependencies
- [x] Step 3: Create basic components
- [ ] Step 4: Add authentication
  - [x] Login form
  - [ ] Registration form
  - [ ] Password reset
- [ ] Step 5: Write tests

**Progress**: 60% complete
```

## Decision Patterns

### Decision Matrix

```markdown
## Decision: Which Database to Use?

### Options Considered

1. **PostgreSQL**

   - Pros: Mature, ACID compliant, great for relational data
   - Cons: Requires more setup, scaling complexity
   - Use case: Complex relationships, transactions

2. **MongoDB**
   - Pros: Flexible schema, easy to scale horizontally
   - Cons: Less ACID compliance, eventual consistency
   - Use case: Rapid prototyping, document storage

### Decision

**Chosen**: PostgreSQL

**Rationale**: Our application requires strong consistency and complex joins. The operational overhead is acceptable for the data integrity guarantees.
```

### Go/No-Go Checklist

```markdown
## Deployment Readiness

### Required Checks

- [x] All tests passing
- [x] Code review completed
- [x] Documentation updated
- [x] Performance benchmarks acceptable
- [ ] Monitoring alerts configured
- [ ] Rollback plan documented

**Status**: BLOCKED - Complete remaining items before deployment
```

## Process Patterns

### Step-by-Step Instructions

````markdown
## How to Set Up the Project

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/org/project.git
   cd project
   ```
````

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment**

   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

### Verification

Visit http://localhost:3000 to confirm the server is running.

````

### Troubleshooting Guide

```markdown
## Troubleshooting: Connection Errors

### Symptom: "Cannot connect to database"

**Step 1**: Verify database is running
```bash
pg_isready -h localhost -p 5432
````

Expected: `localhost:5432 - accepting connections`

**Step 2**: Check credentials

```bash
cat .env | grep DATABASE_URL
```

Expected: Valid connection string format

**Step 3**: Check network access

```bash
telnet localhost 5432
```

Expected: Connected successfully

**Resolution**: If all checks pass, check database logs for errors.

````

## Status Patterns

### Task Status

```markdown
## Task: Database Migration

**Status**: In Progress
**Started**: 2025-01-20 10:00 AM
**ETA**: 2025-01-20 11:30 AM
**Progress**: 60%

### Completed
- [x] Backup existing data
- [x] Create new schema
- [x] Migrate 80% of records

### In Progress
- [ ] Migrate remaining records
  - Current: 80,000 / 100,000

### Blocked
- None

### Next Steps
1. Complete remaining migrations
2. Run validation scripts
3. Switch traffic to new database
````

### System Health

```markdown
## System Health Check

| Component | Status   | Latency | Error Rate |
| --------- | -------- | ------- | ---------- |
| API       | HEALTHY  | 45ms    | 0.1%       |
| Database  | HEALTHY  | 12ms    | 0%         |
| Cache     | DEGRADED | 200ms   | 2%         |
| Queue     | HEALTHY  | 5ms     | 0%         |

### Alerts

⚠️ **Cache**: Elevated latency detected

- Investigating root cause
- Impact: Minor slowdown on cache misses
```

## Best Practices

### Consistency

- Use the same patterns across all responses
- Maintain consistent terminology
- Follow established formatting

### Clarity

- Lead with the most important information
- Use visual hierarchy (headers, lists, tables)
- Include context when needed

### Actionability

- Make next steps clear
- Provide exact commands or actions
- Include verification steps

### Conciseness

- Remove unnecessary words
- Use bullet points over paragraphs
- Link to details rather than including them

## Pattern Selection Guide

| Scenario               | Recommended Pattern        |
| ---------------------- | -------------------------- |
| Providing instructions | Step-by-Step               |
| Presenting options     | Comparison/Decision Matrix |
| Reporting results      | Tabular Data               |
| Tracking work          | Progress Tracking          |
| Debugging issues       | Troubleshooting Guide      |
| Reviewing code         | Code Review                |
| Presenting findings    | Informational              |
| Reporting errors       | Error Responses            |
