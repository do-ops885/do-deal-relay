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
| "The worker already emits structured logs, so Article 12 record-keeping is handled." | Runtime logging is not the compliance record; `worker/lib/eu-ai-act-logger.ts` writes the operation, input digest, output, and oversight fields into `ai_act_logs` with a 180-day retention window. |
| "Only a hash of the input is stored, so there is nothing else to record." | `hashInputData` exists so Article 12.3 can capture `input_source` and `input_description` alongside the digest; the hash replaces raw text, not the log entry. |
| "The model returned 0.85 confidence, which counts as the human decision." | Article 14 oversight is a separate `humanOversight` record with `reviewerId`, `reviewerRole`, and a decision; a confidence score is not a reviewer. |
| "The system is limited_risk, so only Article 50 transparency applies." | `createComplianceLogger` defaults to `limited_risk` and still writes Article 12 logs; high_risk adds Articles 9-11, it does not remove record-keeping. |

## Red Flags

- [ ] An operation that changes deal state reaches `worker/lib/eu-ai-act-logger.ts` with `humanOversight` omitted.
- [ ] `retentionDays` is set below the 180-day default that Article 19 requires.
- [ ] A raw prompt, email body, or API payload is written into `ai_act_logs` instead of a `hashInputData` digest.
- [ ] `riskClassification` is lowered to `limited_risk` to avoid the high_risk Articles 9-11 documentation.
- [ ] `cleanupExpiredLogs()` removes rows whose `retention_until` has not passed.

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
