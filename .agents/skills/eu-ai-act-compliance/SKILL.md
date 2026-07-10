---
name: eu-ai-act-compliance
description: EU AI Act compliance logging and requirements for AI systems. Use for logging AI system operations, ensuring transparency, human oversight, and record-keeping per Regulation (EU) 2024/1689.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
  regulation: "Regulation (EU) 2024/1689"
  effective_date: "2026-08-02"
---

# EU AI Act Compliance

Comprehensive logging and compliance framework for AI systems under the EU AI Act (Regulation (EU) 2024/1689).

## Quick Start

```typescript
import { AIActLogger } from "./eu-ai-act-compliance";

// Initialize logger for your AI system
const logger = new AIActLogger({
  systemId: "do-deal-relay",
  providerName: "do-ops",
  riskClassification: "limited_risk", // or "high_risk"
});

// Log AI operation (Article 12)
await logger.logOperation({
  operation: "deal_discovery",
  inputData: {
    source: "web_research",
    query: "AI agent deals",
    hash: "sha256:abc123...",
  },
  outputData: {
    result: "3_deals_found",
    confidence: 0.85,
  },
  humanOversight: {
    reviewerId: "user_123",
    decision: "approved",
    timestamp: new Date().toISOString(),
  },
});
```


## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "This is just a small change, no need for coordination." | Even small changes can have side effects. Structured coordination ensures nothing is missed. |
| "Writing an ADR/Plan takes too much time." | Investing time in planning saves significantly more time during execution and debugging. |
| "I can do this all in one go." | Breaking tasks down into atomic steps increases reliability and allows for better verification. |


## Red Flags

- [ ] Starting execution before a plan is approved.
- [ ] Making multiple unrelated changes in a single commit.
- [ ] Skipping validation gates or quality checks.
- [ ] Lack of coordination between parallel tasks leading to conflicts.
- [ ] Failing to update documentation after architectural changes.

## Reference

- [Core Concepts](reference/01-core-concepts.md)
- [Risk Classification](reference/02-risk-classification.md)
- [Logging Requirements](reference/03-logging-requirements.md)
- [Implementation](reference/04-implementation.md)
- [Compliance Checklist](reference/05-compliance-checklist.md)
- [Timeline](reference/06-timeline.md)
- [References](reference/07-references.md)
- [Integration](reference/08-integration.md)
- [Best Practices](reference/09-best-practices.md)
