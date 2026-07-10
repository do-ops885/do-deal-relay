# Logging Requirements

## Article 12: Automatic Record-Keeping

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

## Article 19: Provider Log Retention

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


> Extracted from: ../SKILL.md
