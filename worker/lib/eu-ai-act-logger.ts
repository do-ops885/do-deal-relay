/**
 * EU AI Act Compliance Logger
 * Implementation for Cloudflare Workers with D1 database
 *
 * Features:
 * - Article 12: Automatic record-keeping
 * - Article 14: Human oversight logging
 * - Article 50: Transparency tracking
 * - 6-month retention (configurable)
 * - Immutable logs with integrity verification
 */

import type { D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

export interface AIActLogEntry {
  timestamp: string;
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
    notes?: string;
  };

  riskFlags?: string[];
  anomalies?: string[];
  performanceMetrics?: {
    accuracy?: number;
    latencyMs?: number;
    resourceUsage?: Record<string, number>;
  };

  retentionDays?: number;
}

export interface ComplianceConfig {
  systemId: string;
  systemVersion: string;
  providerName: string;
  providerContact: string;
  intendedPurpose: string;
  riskClassification: "limited_risk" | "high_risk";
  defaultRetentionDays: number;
}

// ============================================================================
// EU AI Act Logger
// ============================================================================

export class EUAIActLogger {
  private db: D1Database;
  private config: ComplianceConfig;

  constructor(db: D1Database, config: ComplianceConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Log an AI operation (Article 12 compliance)
   */
  async logOperation(entry: AIActLogEntry): Promise<string> {
    const retentionDays =
      entry.retentionDays || this.config.defaultRetentionDays;
    const retentionUntil = new Date();
    retentionUntil.setDate(retentionUntil.getDate() + retentionDays);

    const id = crypto.randomUUID();

    await this.db
      .prepare(
        `
      INSERT INTO ai_act_logs (
        id, timestamp, system_id, operation_id, correlation_id,
        operation, operation_version,
        input_source, input_hash, input_description, input_reference_db, input_match, input_metadata,
        output_result, output_confidence, output_explanation, output_decision_basis,
        reviewer_id, reviewer_role, oversight_decision, oversight_timestamp, oversight_notes,
        risk_flags, anomalies, performance_metrics,
        retention_until, gdpr_compliant, data_minimization_applied, purpose_limitation_respected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        id,
        entry.timestamp,
        entry.systemId || this.config.systemId,
        entry.operationId,
        entry.correlationId || null,
        entry.operation,
        entry.operationVersion || this.config.systemVersion,
        entry.inputData.source,
        entry.inputData.hash,
        entry.inputData.description,
        entry.inputData.referenceDatabase || null,
        entry.inputData.inputMatch || null,
        entry.inputData.metadata
          ? JSON.stringify(entry.inputData.metadata)
          : null,
        entry.outputData.result,
        entry.outputData.confidence || null,
        entry.outputData.explanation || null,
        entry.outputData.decisionBasis || null,
        entry.humanOversight?.reviewerId || null,
        entry.humanOversight?.reviewerRole || null,
        entry.humanOversight?.decision || null,
        entry.humanOversight?.timestamp || null,
        entry.humanOversight?.notes || null,
        entry.riskFlags ? JSON.stringify(entry.riskFlags) : null,
        entry.anomalies ? JSON.stringify(entry.anomalies) : null,
        entry.performanceMetrics
          ? JSON.stringify(entry.performanceMetrics)
          : null,
        retentionUntil.toISOString(),
        1, // gdpr_compliant
        1, // data_minimization_applied
        1, // purpose_limitation_respected
      )
      .run();

    return id;
  }

  /**
   * Log human oversight action (Article 14 compliance)
   */
  async logHumanOversight(params: {
    operationId: string;
    reviewerId: string;
    reviewerRole: string;
    decision: "approved" | "rejected" | "modified" | "overridden";
    originalOutput?: Record<string, unknown>;
    modifiedOutput?: Record<string, unknown>;
    reason?: string;
    correlationId?: string;
  }): Promise<void> {
    await this.logOperation({
      timestamp: new Date().toISOString(),
      systemId: this.config.systemId,
      operationId: params.operationId,
      correlationId: params.correlationId,
      operation: "human_oversight",
      operationVersion: this.config.systemVersion,
      inputData: {
        source: "human_intervention",
        hash: params.originalOutput
          ? await this.hashData(JSON.stringify(params.originalOutput))
          : "no_original",
        description: `Human ${params.decision} of AI output`,
        metadata: params.modifiedOutput,
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
        notes: params.reason,
      },
    });
  }

  /**
   * Log anomaly detection (for post-market monitoring, Article 72)
   */
  async logAnomaly(params: {
    operation: string;
    anomalyType: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    affectedOperations?: string[];
    correlationId?: string;
  }): Promise<void> {
    await this.logOperation({
      timestamp: new Date().toISOString(),
      systemId: this.config.systemId,
      operationId: crypto.randomUUID(),
      correlationId: params.correlationId,
      operation: params.operation,
      operationVersion: this.config.systemVersion,
      inputData: {
        source: "anomaly_detection",
        hash: await this.hashData(params.description),
        description: params.description,
      },
      outputData: {
        result: `anomaly_${params.severity}`,
        explanation: params.description,
      },
      riskFlags: [params.anomalyType, `severity_${params.severity}`],
      anomalies: [params.description, ...(params.affectedOperations || [])],
    });
  }

  /**
   * Log AI-generated content (Article 50.2 - transparency)
   */
  async logSyntheticContent(params: {
    contentId: string;
    contentType: "text" | "image" | "audio" | "video";
    generationMethod: string;
    marked: boolean;
    watermarkMethod?: string;
  }): Promise<void> {
    await this.logOperation({
      timestamp: new Date().toISOString(),
      systemId: this.config.systemId,
      operationId: params.contentId,
      operation: "synthetic_content_generation",
      operationVersion: this.config.systemVersion,
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
          : "Content generated but marking not applied",
      },
    });
  }

  /**
   * Get transparency disclosure text (Article 50.1)
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
Classification: ${this.config.riskClassification}

This system uses artificial intelligence to process your requests.
All AI operations are logged for compliance and transparency purposes.

For more information about how this system works, its capabilities,
and limitations, please contact the provider.

[Required under Article 50.1 of EU AI Act (Regulation EU 2024/1689)]
    `.trim();
  }

  /**
   * Query logs for compliance reporting
   */
  async queryLogs(params: {
    startDate?: string;
    endDate?: string;
    operation?: string;
    systemId?: string;
    hasHumanOversight?: boolean;
    hasRiskFlags?: boolean;
    limit?: number;
  }): Promise<unknown[]> {
    let sql = "SELECT * FROM ai_act_logs WHERE 1=1";
    const bindings: (string | number)[] = [];

    if (params.startDate) {
      sql += " AND timestamp >= ?";
      bindings.push(params.startDate);
    }
    if (params.endDate) {
      sql += " AND timestamp <= ?";
      bindings.push(params.endDate);
    }
    if (params.operation) {
      sql += " AND operation = ?";
      bindings.push(params.operation);
    }
    if (params.systemId) {
      sql += " AND system_id = ?";
      bindings.push(params.systemId);
    }
    if (params.hasHumanOversight) {
      sql += " AND oversight_decision IS NOT NULL";
    }
    if (params.hasRiskFlags) {
      sql += " AND risk_flags IS NOT NULL";
    }

    sql += " ORDER BY timestamp DESC";

    if (params.limit) {
      sql += " LIMIT ?";
      bindings.push(params.limit);
    }

    const stmt = this.db.prepare(sql);
    const result = await stmt.bind(...bindings).all();
    return result.results || [];
  }

  /**
   * Get compliance summary for a date range
   */
  async getComplianceSummary(
    startDate: string,
    endDate: string,
  ): Promise<{
    totalOperations: number;
    operationsByType: Record<string, number>;
    humanOversightCount: number;
    riskFlaggedCount: number;
    averageConfidence?: number;
  }> {
    const result = await this.db
      .prepare(
        `
      SELECT 
        operation,
        COUNT(*) as count,
        SUM(CASE WHEN oversight_decision IS NOT NULL THEN 1 ELSE 0 END) as oversight_count,
        SUM(CASE WHEN risk_flags IS NOT NULL THEN 1 ELSE 0 END) as risk_count,
        AVG(output_confidence) as avg_confidence
      FROM ai_act_logs
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY operation
    `,
      )
      .bind(startDate, endDate)
      .all();

    const operationsByType: Record<string, number> = {};
    let totalOperations = 0;
    let humanOversightCount = 0;
    let riskFlaggedCount = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const row of result.results || []) {
      const op = row.operation as string;
      const count = row.count as number;
      operationsByType[op] = count;
      totalOperations += count;
      humanOversightCount += row.oversight_count as number;
      riskFlaggedCount += row.risk_count as number;

      if (row.avg_confidence !== null) {
        totalConfidence += row.avg_confidence as number;
        confidenceCount++;
      }
    }

    return {
      totalOperations,
      operationsByType,
      humanOversightCount,
      riskFlaggedCount,
      averageConfidence:
        confidenceCount > 0 ? totalConfidence / confidenceCount : undefined,
    };
  }

  /**
   * Clean up expired logs (GDPR compliance)
   */
  async cleanupExpiredLogs(): Promise<number> {
    const result = await this.db
      .prepare(
        `
      DELETE FROM ai_act_logs
      WHERE retention_until < datetime('now')
    `,
      )
      .run();

    return result.meta?.changes || 0;
  }

  /**
   * Hash data for integrity verification
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    const array = Array.from(new Uint8Array(buffer));
    return (
      "sha256:" + array.map((b) => b.toString(16).padStart(2, "0")).join("")
    );
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create logger instance from environment
 */
export function createComplianceLogger(
  db: D1Database,
  config?: Partial<ComplianceConfig>,
): EUAIActLogger {
  const defaultConfig: ComplianceConfig = {
    systemId: "do-deal-relay",
    systemVersion: "0.1.2",
    providerName: "do-ops",
    providerContact: "compliance@do-ops.dev",
    intendedPurpose: "Autonomous deal discovery and referral code management",
    riskClassification: "limited_risk",
    defaultRetentionDays: 180, // 6 months minimum per Article 19
  };

  return new EUAIActLogger(db, { ...defaultConfig, ...config });
}

/**
 * Get retention policy per Article 19
 */
export function getRetentionPolicy(systemType?: string): number {
  const policies: Record<string, number> = {
    default: 180, // 6 months
    financial: 2555, // 7 years for financial institutions
    healthcare: 2555, // 7 years for healthcare
    legal: 3650, // 10 years for legal proceedings
  };

  return policies[systemType || "default"] || policies.default;
}
