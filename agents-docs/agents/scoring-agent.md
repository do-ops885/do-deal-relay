# Scoring Agent

**Agent ID**: `scoring-agent`
**Status**: ⚪ Pending
**Scope**: Confidence scoring, trust scoring, deal ranking
**Previous Agent**: Validation Agent
**Next Agent**: Publish Agent

## Input

From Validation Agent:
- Validated deals (passed all 9 gates)
- Quarantined deals (anomalies)
- Validation statistics

## Deliverables

### Scoring System
- [ ] `worker/pipeline/score.ts`
  - Confidence score calculation
  - Trust score calculation
  - Deal ranking by score
  - Source trust evolution

### Scoring Algorithm
```
confidence_score =
  validity_ratio × 0.25 +
  uniqueness_score × 0.20 +
  source_diversity × 0.15 +
  historical_trust × 0.15 +
  (1 - duplicate_penalty) × 0.10 +
  reward_plausibility × 0.10 +
  expiry_confidence × 0.05
```

### Trust Evolution
- +0.1 on validation success
- -0.2 on validation failure
- Bounded [0, 1]

## Interface Contract

```typescript
score(deals: Deal[], ctx: PipelineContext): ScoredDeal[]

calculateSourceDiversity(deals: Deal[]): number
calculateUniquenessScore(duplicates: number, total: number): number

interface ScoredDeal extends Deal {
  metadata: Deal['metadata'] & {
    confidence_score: number;
  };
}
```

## Scoring Weights

From config:
- validity_ratio: 0.25
- uniqueness_score: 0.20
- source_diversity: 0.15
- historical_trust: 0.15
- duplicate_penalty: 0.10
- reward_plausibility: 0.10
- expiry_confidence: 0.05

## Quarantine Check

High-value deals (> $100) with low trust (< 0.5):
- Move to quarantine
- Do not publish
- Log with warning

## Handoff Checklist

Before handing to Publish Agent:
- [ ] All deals scored
- [ ] High-value anomalies quarantined
- [ ] Source trust scores updated
- [ ] Confidence scores in metadata

## Context for Next Agent

Publish Agent receives:
- Scored deals (confidence_score set)
- Staging snapshot ready to build
- Quarantine list (for notifications)

## Dependencies

- Validated deals
- Source registry (trust scores)
- Config (weights, thresholds)
- Logger

## Blockers

None expected.
