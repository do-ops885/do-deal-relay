---
name: trust-model
description: Source classification scoring system for establishing data trustworthiness. Use for calculating confidence scores, source reputation, data quality assessment, and risk-based processing decisions.
---

# Trust Model

Calculate and manage trust scores for data sources, with configurable factors and risk-based decision making.

## Quick Start

```typescript
import { TrustModel, Source } from './trust-model';

const model = new TrustModel({
  factors: ['reputation', 'freshness', 'consistency', 'volume'],
  weights: { reputation: 0.4, freshness: 0.3, consistency: 0.2, volume: 0.1 }
});

const score = await model.score(source);
if (score.value >= 0.8) {
  await processHighTrust(source.data);
}
```

## Trust Factors

| Factor | Description | Calculation |
|--------|-------------|-------------|
| Reputation | Historical accuracy | Correct / Total predictions |
| Freshness | Data recency | 1 / (1 + age_hours) |
| Consistency | Variance over time | std_dev / mean |
| Volume | Sample size | min(actual / target, 1) |
| Provenance | Source chain | Verified steps / Total steps |
| Redundancy | Cross-validation | Agreeing sources / Total |

## Scoring Methods

**Weighted Average**:
```typescript
const model = new TrustModel({
  method: 'weighted',
  weights: { reputation: 0.5, freshness: 0.3, consistency: 0.2 }
});
```

**Minimum Threshold**:
```typescript
const model = new TrustModel({
  method: 'min',
  thresholds: { reputation: 0.6, freshness: 0.5 }
});
```

**Bayesian**:
```typescript
const model = new TrustModel({
  method: 'bayesian',
  prior: 0.5,
  evidence: historicalData
});
```

## Source Classification

**High Trust (>= 0.8)**:
- Verified sources
- Long track record
- Cross-validated

**Medium Trust (0.5 - 0.8)**:
- Established sources
- Limited history
- Some validation

**Low Trust (< 0.5)**:
- New sources
- Unverified claims
- High variance

## Risk-Based Actions

```typescript
const actions = new RiskActions({
  high: { autoProcess: true, alert: false },
  medium: { autoProcess: true, alert: true, review: true },
  low: { autoProcess: false, alert: true, quarantine: true }
});

await actions.handle(score, data);
```

## Source Registry

```typescript
const registry = new SourceRegistry();

// Register source
await registry.register({
  id: 'source-1',
  name: 'Verified API',
  tier: 'official',
  verification: 'oauth'
});

// Update metrics
await registry.updateMetrics('source-1', {
  predictions: 100,
  correct: 95,
  timestamp: Date.now()
});
```

## Time Decay

```typescript
const model = new TrustModel({
  decay: {
    type: 'exponential',
    halfLife: 86400 * 7  // 7 days
  }
});
// Older data contributes less to score
```

## Confidence Intervals

```typescript
const result = await model.scoreWithCI(source, { confidence: 0.95 });
// { value: 0.85, lower: 0.78, upper: 0.91 }
```

## Integration

```typescript
// In data pipeline
const score = await trustModel.score(source);
const decision = riskEngine.decide(score);

switch (decision.action) {
  case 'accept': await save(data); break;
  case 'review': await queueForReview(data); break;
  case 'reject': await logRejection(data); break;
}
```

## Configuration

```typescript
interface TrustConfig {
  factors: string[];
  weights: Record<string, number>;
  method: 'weighted' | 'min' | 'bayesian';
  decay?: DecayConfig;
  thresholds: {
    high: number;
    medium: number;
    low: number;
  };
}
```

See [templates/scoring.ts](templates/scoring.ts) and [examples/source-ranking.ts](examples/source-ranking.ts) for complete examples.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "One deal's score cannot move a source's trust much." | Each validated deal adjusts trust by `CONFIG.TRUST_ADJUSTMENT` (+0.1 success / -0.2 failure); two failures push a 0.6 source under `CONFIG.MIN_TRUST_SCORE` (0.3) and the trust gate drops its entire feed. |
| "Trust is a fixed per-domain constant I can hardcode." | `worker/lib/d1/trust.ts` evolves trust atomically via a D1 batch; a hardcoded value reintroduces the KV read-modify-write race that ADR-017 removed. |
| "Confidence and trust measure the same thing, so I will reuse one score." | `worker/lib/ranking.ts` keeps `confidence` and `trust` as separate breakdown factors in `calculateDetailedScore`; merging them double-counts source reputation in the composite rank. |
| "I only need the numeric score, not the classification band." | `CONFIG.TRUST_BOUNDS` maps score ranges to trusted/probationary/unverified/blocked; reading the raw float skips the blocked (<0.2) risk path. |

## Red Flags

- [ ] Source trust persisted with a KV read-modify-write instead of the D1 batch in `worker/lib/d1/trust.ts`.
- [ ] A gate or ranking branch comparing `trust_score` to a literal instead of `getTrustThreshold(env)`.
- [ ] Adjustment magnitudes edited without updating `CONFIG.TRUST_ADJUSTMENT` / `CONFIG.TRUST_BOUNDS`.
- [ ] A brand-new domain classified as trusted with no provenance or verification record.
- [ ] `trust_score` left undefined or defaulted to 1.0 for a source with no history.
