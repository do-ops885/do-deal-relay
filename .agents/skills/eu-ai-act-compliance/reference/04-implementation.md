# Implementation

### Basic Setup

```typescript
// Initialize compliance logger
const logger = new AIActLogger({
  systemId: "do-deal-relay",
   systemVersion: "0.1.3",
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


> Extracted from: ../SKILL.md
