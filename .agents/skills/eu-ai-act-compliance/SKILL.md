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

## Core Concepts

| Concept           | Article | Description                        |
| ----------------- | ------- | ---------------------------------- |
| Automatic Logging | Art. 12 | Record events over system lifetime |
| Transparency      | Art. 50 | Disclose AI interaction to users   |
| Human Oversight   | Art. 14 | Enable human intervention          |
| Data Governance   | Art. 10 | Document training/validation data  |
| Retention         | Art. 19 | Keep logs minimum 6 months         |

## Risk Classification

### Limited Risk (Article 50)

Applies to AI systems interacting with natural persons:

```typescript
const config: AIActConfig = {
  riskClassification: "limited_risk",
  obligations: {
    transparency: true, // Art. 50.1 - AI disclosure
    syntheticContent: false, // Art. 50.2 - If generating content
    biometricCategorization: false, // Art. 50.3
    deepfakeDisclosure: false, // Art. 50.4
  },
};
```

**Requirements:**

- Disclose AI interaction at first contact (Art. 50.1)
- Mark synthetic content as AI-generated (Art. 50.2)
- Inform users of emotion recognition (Art. 50.3)
- Disclose deepfake content (Art. 50.4)

### High Risk (Chapter III, Articles 8-17)

Applies to systems in Annex III (recruitment, credit scoring, etc.):

```typescript
const config: AIActConfig = {
  riskClassification: "high_risk",
  annexIIIReference: "point_4", // Recruitment
  obligations: {
    riskManagement: true, // Art. 9
    dataGovernance: true, // Art. 10
    technicalDocumentation: true, // Art. 11
    recordKeeping: true, // Art. 12
    transparency: true, // Art. 13
    humanOversight: true, // Art. 14
    accuracy: true, // Art. 15
    qualityManagement: true, // Art. 17
  },
};
```

**Full Compliance Required:**

- Risk management system (Art. 9)
- Data governance (Art. 10)
- Technical documentation (Art. 11)
- Automatic logging (Art. 12)
- Transparency to deployers (Art. 13)
- Human oversight design (Art. 14)
- Accuracy/robustness (Art. 15)
- Quality management (Art. 17)
- Conformity assessment (Art. 43)
- CE marking (Art. 48)
- EU database registration (Art. 49)

## Logging Requirements

### Article 12: Automatic Record-Keeping

```typescript
interface AIActLogEntry {
  // Temporal information
  timestamp: string; // ISO 8601 - Event time
  startTime?: string; // For operations with duration
  endTime?: string; // End of operation

  // System identification
  systemId: string; // Unique AI system ID
  operationId: string; // Unique operation ID
  correlationId?: string; // For tracing across services

  // Operation details
  operation: string; // Type of AI operation
  operationVersion: string; // System version at time of operation

  // Input data (Article 12.3)
  inputData: {
    source: string; // Data source (API, web, sensor)
    hash: string; // Cryptographic hash for integrity
    description: string; // Description without PII
    referenceDatabase?: string; // Database checked (if applicable)
    inputMatch?: string; // Data that led to match (if applicable)
    metadata?: Record<string, unknown>;
  };

  // Output data
  outputData: {
    result: string; // Operation result
    confidence?: number; // Confidence score
    explanation?: string; // Human-readable explanation
    decisionBasis?: string; // How decision was reached
  };

  // Human oversight (Article 14, 12.3)
  humanOversight?: {
    reviewerId: string; // Natural person who verified
    reviewerRole: string; // Role/competence of reviewer
    decision: "approved" | "rejected" | "modified" | "overridden";
    timestamp: string; // When oversight occurred
    modificationNotes?: string;
  };

  // Risk and monitoring
  riskFlags?: string[]; // Risk indicators triggered
  anomalies?: string[]; // Anomalies detected
  performanceMetrics?: {
    accuracy?: number;
    latencyMs?: number;
    resourceUsage?: Record<string, number>;
  };

  // Compliance metadata
  retentionUntil: string; // When log can be deleted (min 6 months)
  dataProtectionCompliance: {
    gdprCompliant: boolean;
    dataMinimizationApplied: boolean;
    purposeLimitationRespected: boolean;
  };
}
```

### Article 19: Provider Log Retention

```typescript
interface LogRetentionPolicy {
  // Minimum 6 months (Article 19, 26.6)
  minimumRetentionDays: 180;

  // Extended periods for specific contexts
  extendedRetention: {
    financialInstitutions: "as_required_by_governance";
    legalProceedings: "until_concluded_plus_6_months";
    regulatoryInvestigation: "until_resolved_plus_6_months";
  };

  // Storage requirements
  storage: {
    immutable: true; // Cannot be modified
    tamperEvidence: true; // Integrity checks
    encrypted: true; // At rest and in transit
    accessibleToAuthorities: true; // For compliance checks
  };
}
```

## Implementation

### Basic Setup

```typescript
// Initialize compliance logger
const logger = new AIActLogger({
  systemId: "do-deal-relay",
  systemVersion: "0.1.2",
  providerName: "do-ops",
  providerContact: "compliance@do-ops.dev",
  intendedPurpose: "Autonomous deal discovery and research",
  riskClassification: "limited_risk",
  retentionDays: 180, // Minimum 6 months
});
```

### Logging Operations

```typescript
// Log a simple operation
await logger.log({
  level: "info",
  operation: "referral_code_discovery",
  input: { source: "web_research", query: "scalable capital referral" },
  output: { codesFound: 1, confidence: 0.92 },
});

// Log with human oversight
await logger.log({
  operation: "deal_validation",
  input: { dealId: "deal-123", source: "user_submitted" },
  output: { validated: true, riskScore: 0.15 },
  humanOversight: {
    reviewerId: "admin_456",
    reviewerRole: "senior_validator",
    decision: "approved",
    timestamp: new Date().toISOString(),
  },
});

// Log anomaly detected
await logger.log({
  level: "warn",
  operation: "anomaly_detection",
  input: { dealId: "deal-789", pattern: "rapid_submission" },
  output: { anomalyDetected: true, type: "potential_spam" },
  riskFlags: ["unusual_pattern", "rate_limit_exceeded"],
});
```

### Transparency Implementation (Article 50)

```typescript
// AI interaction disclosure
const transparency = new TransparencyModule({
  aiDisclosure: {
    enabled: true,
    message: "You are interacting with an AI-powered deal discovery system.",
    displayAtFirstInteraction: true,
    accessibleFormats: ["text", "audio", "easy_read"],
  },

  syntheticContentMarking: {
    enabled: true,
    method: "metadata_watermark", // or "visible", "both"
    metadataSchema: "https://do-ops.dev/schemas/ai-content-v1",
    machineReadable: true,
  },

  systemInfo: {
    provider: {
      name: "do-ops",
      contact: "compliance@do-ops.dev",
      address: "...",
    },
    capabilities: {
      description: "Autonomous web research and deal discovery",
      limitations: [
        "May miss deals from sources not indexed",
        "Confidence scores are estimates",
        "Requires human validation for final decisions",
      ],
      accuracyMetrics: {
        precision: 0.87,
        recall: 0.82,
        f1Score: 0.84,
        lastUpdated: "2026-03-15",
      },
    },
  },
});

// Display at first interaction
app.use((req, res, next) => {
  if (isFirstInteraction(req.user)) {
    res.setHeader("X-AI-System-Disclosure", transparency.getDisclosureText());
  }
  next();
});
```

### Human Oversight (Article 14)

```typescript
interface HumanOversightFramework {
  // Enable understanding of system limitations
  systemUnderstanding: {
    documentation: string; // Clear capability/limitation docs
    trainingRequired: boolean; // For high-risk systems
    competencyAssessment: boolean;
  };

  // Monitor operation
  monitoring: {
    realTimeDashboard: boolean;
    anomalyAlerts: boolean;
    performanceTracking: boolean;
    overrideCapability: boolean;
  };

  // Override capabilities
  override: {
    enabled: boolean;
    requiresAuthorization: string; // Role required
    auditTrail: boolean; // Log all overrides
    responseTimeSla: number; // Max time to override
  };

  // Emergency stop
  emergencyStop: {
    enabled: boolean;
    mechanism: "button" | "api" | "both";
    safeState: "pause_operations" | "revert_to_manual" | "shutdown";
    recoveryProcedure: string;
  };
}

// Implementation
const oversight = new HumanOversightModule({
  override: {
    enabled: true,
    requiresAuthorization: "senior_validator",
    auditTrail: true,
  },
  emergencyStop: {
    enabled: true,
    mechanism: "api",
    safeState: "pause_operations",
    recoveryProcedure: "manual_review_and_restart",
  },
});

// Log human override
await logger.log({
  operation: "human_override",
  input: { originalDecision: "approved", dealId: "deal-123" },
  output: { overriddenDecision: "rejected", reason: "policy_violation" },
  humanOversight: {
    reviewerId: "admin_789",
    reviewerRole: "senior_validator",
    decision: "overridden",
    timestamp: new Date().toISOString(),
    modificationNotes: "Deal violates partnership terms",
  },
});
```

### Data Governance (Article 10)

```typescript
interface DataGovernancePolicy {
  // Training, validation, testing data sets
  dataSets: {
    training: {
      source: string;
      collectionDate: string;
      size: number;
      description: string;
      preparationOperations: string[];
      assumptions: string[];
      qualityMetrics: {
        representativeness: number;
        errorRate: number;
        completeness: number;
      };
    };
    validation: DatasetMetadata;
    testing: DatasetMetadata;
  };

  // Bias assessment
  biasAssessment: {
    conductedAt: string;
    methodology: string;
    identifiedBiases: string[];
    mitigationMeasures: string[];
    residualRisks: string[];
    reviewer: string;
  };

  // Special category data handling (Art. 10.5)
  specialCategoryData?: {
    processed: boolean;
    legalBasis: "bias_detection_only";
    necessityJustification: string;
    securityMeasures: string[];
    deletionDate: string;
  };
}
```

## Compliance Checklist

### Limited Risk Systems

- [ ] **Transparency (Article 50.1)**
  - [ ] AI interaction disclosure implemented
  - [ ] Clear and distinguishable at first interaction
  - [ ] Accessibility compliant

- [ ] **Synthetic Content (Article 50.2)** - If applicable
  - [ ] Machine-readable marking implemented
  - [ ] Detection mechanisms in place

- [ ] **Documentation**
  - [ ] Provider contact information published
  - [ ] Basic system capabilities documented
  - [ ] Known limitations disclosed

### High Risk Systems

#### Provider Obligations

- [ ] **Risk Management (Article 9)**
  - [ ] Continuous iterative process established
  - [ ] Known/foreseeable risks identified
  - [ ] Risk estimation and evaluation documented
  - [ ] Post-market monitoring integrated

- [ ] **Data Governance (Article 10)**
  - [ ] Training, validation, testing data documented
  - [ ] Data quality standards met
  - [ ] Bias detection measures implemented
  - [ ] Data gaps identified and addressed

- [ ] **Technical Documentation (Article 11)**
  - [ ] Complete documentation per Annex IV
  - [ ] Documentation updated with changes
  - [ ] Simplified form used if SME

- [ ] **Record-Keeping (Article 12)**
  - [ ] Automatic logging capability implemented
  - [ ] Event traceability ensured
  - [ ] Minimum 6-month retention configured
  - [ ] Input/output/match recording implemented

- [ ] **Transparency (Article 13)**
  - [ ] Instructions for use provided
  - [ ] Identity and contact details included
  - [ ] Accuracy metrics declared
  - [ ] Known risks documented
  - [ ] Human oversight measures described

- [ ] **Human Oversight (Article 14)**
  - [ ] System designed for effective oversight
  - [ ] Human-machine interface tools included
  - [ ] Override capabilities implemented
  - [ ] Emergency stop mechanism included

- [ ] **Accuracy, Robustness, Cybersecurity (Article 15)**
  - [ ] Appropriate levels declared
  - [ ] Resilience to errors implemented
  - [ ] Cybersecurity protections in place

- [ ] **Quality Management (Article 17)**
  - [ ] Documented policies and procedures
  - [ ] Quality control measures
  - [ ] Management review process

- [ ] **Conformity Assessment (Article 43)**
  - [ ] Internal control (Annex VI) OR
  - [ ] Notified body assessment (Annex VII)

- [ ] **EU Declaration of Conformity (Article 47)**
  - [ ] Drawn up per Annex V
  - [ ] Kept up-to-date

- [ ] **CE Marking (Article 48)**
  - [ ] Affixed to system/packaging/documentation

- [ ] **Registration (Article 49)**
  - [ ] Registered in EU database
  - [ ] Annex VIII information submitted

#### Deployer Obligations

- [ ] Use system per instructions (Art. 26.1)
- [ ] Assign competent human oversight (Art. 26.2)
- [ ] Ensure relevant input data (Art. 26.4)
- [ ] Monitor and report risks (Art. 26.5)
- [ ] Keep logs 6+ months (Art. 26.6)
- [ ] Inform workers before deployment (Art. 26.7)
- [ ] Conduct DPIA (Art. 26.9)
- [ ] Inform natural persons of AI use (Art. 26.11)

## Timeline

| Deadline             | Requirement                                    |
| -------------------- | ---------------------------------------------- |
| **February 2, 2025** | Prohibited AI systems ban effective            |
| **August 2, 2025**   | GPAI model obligations apply                   |
| **August 2, 2026**   | High-risk AI systems obligations (Chapter III) |
| **August 2, 2027**   | Annex I high-risk systems obligations          |

## References

- **Official Regulation:** [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)
- **AI Act Explorer:** https://artificialintelligenceact.eu/
- **EU AI Office:** https://digital-strategy.ec.europa.eu/en/policies/ai-office
- **Annex III High-Risk Use Cases:** Recruitment, credit scoring, etc.
- **Technical Documentation (Annex IV):** Required elements for high-risk systems

## Integration

### With structured-logging

```typescript
import { Logger } from "../structured-logging";
import { AIActLogger } from "./eu-ai-act-compliance";

// Combine both loggers
const baseLogger = new Logger({ service: "deal-processor" });
const complianceLogger = new AIActLogger({
  systemId: "do-deal-relay",
  riskClassification: "limited_risk",
  baseLogger, // Integrate with existing logger
});
```

### With Cloudflare Workers

```typescript
export default {
  async fetch(req, env) {
    const logger = new AIActLogger({
      systemId: "do-deal-relay",
      providerName: env.PROVIDER_NAME,
      retentionStorage: env.AI_ACT_LOGS, // KV or D1 binding
    });

    // Log AI operation
    await logger.logOperation({
      operation: "deal_discovery",
      inputData: { source: "api_request", hash: "..." },
      outputData: { result: "success" },
    });

    return new Response("OK");
  },
};
```

## Best Practices

1. **Log Everything** - If in doubt, log it. Authority access may be required.
2. **Immutable Logs** - Never modify logs; append corrections separately.
3. **Privacy by Design** - Hash/hash personal data; log descriptions not values.
4. **6-Month Minimum** - Configure retention policies to meet minimums.
5. **Secure Storage** - Encrypt at rest and in transit.
6. **Authority Access** - Ensure logs can be provided to regulators.
7. **Human Oversight** - Design systems where humans can always intervene.
8. **Transparency First** - Always disclose AI interaction clearly.

See [references/eu-ai-act-articles.md](references/eu-ai-act-articles.md) for detailed article analysis and [templates/compliance-logger.ts](templates/compliance-logger.ts) for implementation template.
