/**
 * EU AI Act Compliance Logger Template
 *
 * Implementation of Article 12 (Record-Keeping) and related requirements
 * for AI systems under Regulation (EU) 2024/1689
 */

// Types for EU AI Act compliance
interface AIActLogEntry {
  timestamp: string;
  startTime?: string;
  endTime?: string;
  systemId: string;
  operationId: string;
  correlationId?: string;
  operation: string;
  operationVersion: string;
  inputData: {
    source: string;
    hash: string;
    description: string;
    referenceDatabase?: string;
    inputMatch?: string;
    metadata?: Record<string, unknown>;
  };
  outputData: {
    result: string;
    confidence?: number;
    explanation?: string;
    decisionBasis?: string;
  };
  humanOversight?: {
    reviewerId: string;
    reviewerRole: string;
    decision: "approved" | "rejected" | "modified" | "overridden";
    timestamp: string;
    modificationNotes?: string;
  };
  riskFlags?: string[];
  anomalies?: string[];
  performanceMetrics?: {
    accuracy?: number;
    latencyMs?: number;
    resourceUsage?: Record<string, number>;
  };
  retentionUntil: string;
  dataProtectionCompliance: {
    gdprCompliant: boolean;
    dataMinimizationApplied: boolean;
    purposeLimitationRespected: boolean;
  };
}

interface LogRetentionPolicy {
  minimumRetentionDays: number;
  extendedRetention: {
    financialInstitutions: string;
    legalProceedings: string;
    regulatoryInvestigation: string;
  };
  storage: {
    immutable: boolean;
    tamperEvidence: boolean;
    encrypted: boolean;
    accessibleToAuthorities: boolean;
  };
}

export interface LoggerConfig {
  systemId: string;
  systemVersion: string;
  providerName: string;
  providerContact: string;
  intendedPurpose: string;
  riskClassification: "limited_risk" | "high_risk";
  annexIIIReference?: string; // For high-risk systems
  retentionDays?: number; // Default: 180 (6 months minimum)
  storageBinding?: unknown; // KVNamespace or D1Database binding
}

export class AIActLogger {
  private config: LoggerConfig;
  private retentionDays: number;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.retentionDays = config.retentionDays || 180;
  }

  /**
   * Log an AI system operation (Article 12)
   *
   * Required for all AI systems to enable:
   * - Identifying situations that may result in risks
   * - Facilitating post-market monitoring
   * - Monitoring operation of high-risk AI systems
   */
  async logOperation(entry: Partial<AIActLogEntry>): Promise<void> {
    const fullEntry: AIActLogEntry = {
      // Temporal information
      timestamp: new Date().toISOString(),
      startTime: entry.startTime,
      endTime: entry.endTime || new Date().toISOString(),

      // System identification
      systemId: this.config.systemId,
      operationId: entry.operationId || crypto.randomUUID(),
      correlationId: entry.correlationId,

      // Operation details
      operation: entry.operation || "unknown",
      operationVersion: this.config.systemVersion,

      // Input data (Article 12.3 requirements)
      inputData: {
        source: entry.inputData?.source || "unknown",
        hash:
          entry.inputData?.hash ||
          (await this.hashData(JSON.stringify(entry.inputData))),
        description: entry.inputData?.description || "No description provided",
        referenceDatabase: entry.inputData?.referenceDatabase,
        inputMatch: entry.inputData?.inputMatch,
        metadata: entry.inputData?.metadata,
      },

      // Output data
      outputData: {
        result: entry.outputData?.result || "unknown",
        confidence: entry.outputData?.confidence,
        explanation: entry.outputData?.explanation,
        decisionBasis: entry.outputData?.decisionBasis,
      },

      // Human oversight (Article 14.4, Article 12.3 for biometric systems)
      humanOversight: entry.humanOversight,

      // Risk and monitoring
      riskFlags: entry.riskFlags,
      anomalies: entry.anomalies,
      performanceMetrics: entry.performanceMetrics,

      // Compliance metadata
      retentionUntil: this.calculateRetentionDate(),
      dataProtectionCompliance: {
        gdprCompliant: true,
        dataMinimizationApplied: true,
        purposeLimitationRespected: true,
      },
      ...entry,
    };

    // Store the log entry
    await this.storeLog(fullEntry);
  }

  /**
   * Log human oversight action (Article 14)
   * 
   * Required for high-risk systems to document:
   - Natural persons who verified results
   * - Their competence, training, authority
   * - Override/rejection decisions
   */
  async logHumanOversight(params: {
    operationId: string;
    reviewerId: string;
    reviewerRole: string;
    decision: "approved" | "rejected" | "modified" | "overridden";
    originalOutput?: unknown;
    modifiedOutput?: unknown;
    reason?: string;
  }): Promise<void> {
    await this.logOperation({
      operation: "human_oversight",
      operationId: params.operationId,
      inputData: {
        source: "human_intervention",
        hash: await this.hashData(JSON.stringify(params.originalOutput)),
        description: `Human ${params.decision} of AI output`,
      },
      outputData: {
        result: params.decision,
        explanation:
          params.reason || `Output ${params.decision} by human reviewer`,
      },
      humanOversight: {
        reviewerId: params.reviewerId,
        reviewerRole: params.reviewerRole,
        decision: params.decision,
        timestamp: new Date().toISOString(),
        modificationNotes: params.reason,
      },
    });
  }

  /**
   * Log system anomaly or risk (for post-market monitoring, Article 72)
   */
  async logAnomaly(params: {
    operation: string;
    anomalyType: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    affectedOperations?: string[];
  }): Promise<void> {
    await this.logOperation({
      operation: params.operation,
      inputData: {
        source: "system_monitoring",
        hash: "anomaly_detection",
        description: params.description,
      },
      outputData: {
        result: `anomaly_detected_${params.severity}`,
        explanation: params.description,
      },
      riskFlags: [params.anomalyType, `severity_${params.severity}`],
      anomalies: [params.description, ...(params.affectedOperations || [])],
    });
  }

  /**
   * Log AI-generated content for synthetic content marking (Article 50.2)
   */
  async logSyntheticContent(params: {
    contentId: string;
    contentType: "text" | "image" | "audio" | "video";
    generationMethod: string;
    marked: boolean;
    watermarkMethod?: string;
  }): Promise<void> {
    await this.logOperation({
      operation: "synthetic_content_generation",
      operationId: params.contentId,
      inputData: {
        source: "ai_generation",
        hash: params.contentId,
        description: `AI-generated ${params.contentType} via ${params.generationMethod}`,
        metadata: {
          contentType: params.contentType,
          marked: params.marked,
          watermarkMethod: params.watermarkMethod,
        },
      },
      outputData: {
        result: params.marked ? "content_marked" : "content_unmarked",
        explanation: params.marked
          ? `Content marked as AI-generated using ${params.watermarkMethod}`
          : "Content generated but marking failed or not applied",
      },
    });
  }

  /**
   * Generate transparency disclosure text (Article 50.1)
   */
  getTransparencyDisclosure(): string {
    return `
AI System Disclosure
====================
You are interacting with an AI-powered system.

System: ${this.config.systemId}
Provider: ${this.config.providerName}
Contact: ${this.config.providerContact}
Purpose: ${this.config.intendedPurpose}

This system uses artificial intelligence to process your requests.
For more information about how this system works, its capabilities,
and limitations, please contact the provider.

[Required under Article 50.1 of EU AI Act (Regulation EU 2024/1689)]
    `.trim();
  }

  /**
   * Get system information for deployers (Article 13)
   */
  getSystemInformation(): object {
    return {
      // Identity (Article 13.3(a))
      provider: {
        name: this.config.providerName,
        contact: this.config.providerContact,
      },

      // Characteristics (Article 13.3(b))
      system: {
        id: this.config.systemId,
        version: this.config.systemVersion,
        intendedPurpose: this.config.intendedPurpose,
        riskClassification: this.config.riskClassification,
        capabilities: this.getCapabilities(),
        limitations: this.getLimitations(),
      },

      // Log collection mechanisms (Article 13.3(f))
      logging: {
        automaticRecording: true,
        retentionPeriod: `${this.retentionDays} days (minimum 6 months per Article 19)`,
        logFormat: "structured_json",
        accessForDeployers: true,
      },

      // Human oversight measures (Article 13.3(d))
      humanOversight: {
        designedForOversight: true,
        overrideCapability: true,
        emergencyStop: true,
      },
    };
  }

  /**
   * Store log entry (implementation depends on storage backend)
   */
  private async storeLog(entry: AIActLogEntry): Promise<void> {
    if (this.config.storageBinding) {
      // Use Cloudflare KV or D1
      const key = `ai-act-log:${entry.timestamp}:${entry.operationId}`;
      const storage = this.config.storageBinding as {
        put: (
          key: string,
          value: string,
          options?: { expirationTtl?: number },
        ) => Promise<void>;
      };
      await storage.put(key, JSON.stringify(entry), {
        expirationTtl: this.retentionDays * 86400,
      });
    } else {
      // Fallback to console (for development)
      console.log("[AI-ACT-LOG]", JSON.stringify(entry));
    }
  }

  /**
   * Calculate retention date (minimum 6 months from today)
   */
  private calculateRetentionDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + this.retentionDays);
    return date.toISOString();
  }

  /**
   * Hash data for integrity verification
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return (
      "sha256:" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    );
  }

  /**
   * Get system capabilities (override in subclass)
   */
  protected getCapabilities(): string[] {
    return [
      "Autonomous operation with human oversight",
      "Multi-source data aggregation",
      "Confidence scoring for outputs",
      "Anomaly detection and reporting",
    ];
  }

  /**
   * Get system limitations (override in subclass)
   */
  protected getLimitations(): string[] {
    return [
      "May produce inaccurate results requiring human verification",
      "Performance depends on data quality and availability",
      "Not suitable for decisions with high stakes without human review",
      "Requires regular monitoring and maintenance",
    ];
  }
}

/**
 * Retention policy per Article 19 and Article 26(6)
 */
export const DefaultRetentionPolicy: LogRetentionPolicy = {
  minimumRetentionDays: 180, // 6 months minimum
  extendedRetention: {
    financialInstitutions: "as_required_by_internal_governance",
    legalProceedings: "until_concluded_plus_180_days",
    regulatoryInvestigation: "until_resolved_plus_180_days",
  },
  storage: {
    immutable: true,
    tamperEvidence: true,
    encrypted: true,
    accessibleToAuthorities: true,
  },
};

/**
 * Example usage
 */
export async function example(): Promise<void> {
  const logger = new AIActLogger({
    systemId: "do-deal-relay",
    systemVersion: "0.1.2",
    providerName: "do-ops",
    providerContact: "compliance@do-ops.dev",
    intendedPurpose: "Autonomous deal discovery and referral code management",
    riskClassification: "limited_risk",
  });

  // Log a deal discovery operation
  await logger.logOperation({
    operation: "referral_discovery",
    inputData: {
      source: "web_research",
      hash: "sha256:abc123...",
      description: "Web search for referral codes on scalable.capital domain",
      metadata: {
        query: "scalable capital invitation",
      },
    },
    outputData: {
      result: "code_found",
      confidence: 0.92,
      explanation:
        "Referral code b6zk2z discovered on official invitation page",
    },
  });

  // Log with human oversight
  await logger.logHumanOversight({
    operationId: "deal-validation-123",
    reviewerId: "admin_456",
    reviewerRole: "senior_validator",
    decision: "approved",
    reason: "Code verified on official domain",
  });
}
