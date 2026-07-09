# Integration

### With web-search-researcher

```typescript
// Research communities before engaging
skill web-search-researcher
query: "r/AI_Agents community quality reviews"
output: temp/reddit-community-research.md

// Analyze findings
skill reddit-engagement
research: temp/reddit-community-research.md
riskThreshold: "low"
output: temp/safe-communities.json
```

### With self-learning-feedback

```typescript
// Review engagement effectiveness
skill self-learning-feedback
analyze: temp/reddit-engagement-results.md
criteria: ["karma_growth", "sentiment", "conversion"]
lesson: "What worked and what didn't"
```


> Extracted from: ../SKILL.md
