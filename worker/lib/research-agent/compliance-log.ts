/**
 * EU AI Act Compliance Wiring (fire-and-forget)
 *
 * Single chokepoint through which every AI-touching request path emits an
 * Article 12 record-keeping event into ai_act_logs via EUAIActLogger:
 *   - NLQ route classification/lookup (routes/nlq)
 *   - Semantic search embedding/vector query (routes/semantic-search)
 *   - Research agent LLM extraction (research-agent orchestrator)
 *
 * Contract: compliance logging MUST NEVER fail a user request. Every
 * failure (missing D1 binding, insert error, hashing error) is swallowed
 * and reported through the global logger.
 *
 * Data minimization: raw inputs are SHA-256 hashed for integrity and are
 * never persisted verbatim; only query shape metadata is recorded.
 */

import type { Env, ReferralResearchResult } from "../../types";
import { CONFIG } from "../../config";
import { logger } from "../global-logger";
import { toError } from "../sanitize-error";
import { createComplianceLogger, hashInputData } from "../eu-ai-act-logger";
import type { ScraperEnv } from "./scrapers";
import { createAIExtractor } from "./scrapers/ai-extractor";

// ============================================================================
// Operation names persisted to ai_act_logs.operation
// ============================================================================

/** NLQ natural-language query classified and executed. */
export const NLQ_COMPLIANCE_OPERATION = "nlq_query_processing";

/** Workers AI embedding queried against the Vectorize index. */
export const SEMANTIC_SEARCH_COMPLIANCE_OPERATION = "semantic_vector_search";

/** LLM extraction of referral codes over fetched source content. */
export const RESEARCH_EXTRACTION_COMPLIANCE_OPERATION =
  "research_ai_extraction";

/** Component tag used on compliance wiring warnings. */
const COMPLIANCE_LOG_COMPONENT = "eu-ai-act-compliance";

// ============================================================================
// Generic fire-and-forget event emitter
// ============================================================================

/** Minimal, content-free description of one AI interaction. */
export interface AIInteractionRecord {
  /** Operation name persisted to ai_act_logs.operation. */
  operation: string;
  /** Route or subsystem that performed the AI interaction. */
  inputSource: string;
  /** Raw input is hashed for integrity; it is never stored verbatim. */
  rawInput?: string;
  /** Query shape / interaction summary (no raw content). */
  inputDescription: string;
  inputMetadata?: Record<string, unknown>;
  result: string;
  confidence?: number;
  explanation?: string;
  correlationId?: string;
  latencyMs?: number;
}

/**
 * Emit one compliance event for an AI interaction. Fire-and-forget:
 * resolves even when D1 is unavailable or the insert fails, so request
 * paths can safely await it without risking user-facing errors.
 */
export async function logAIInteraction(
  db: Env["DEALS_DB"] | undefined,
  record: AIInteractionRecord,
): Promise<void> {
  if (!db) {
    return;
  }
  try {
    const hash = await hashInputData(
      record.rawInput ?? record.inputDescription,
    );
    await createComplianceLogger(db).logOperation({
      timestamp: new Date().toISOString(),
      operationId: record.correlationId ?? crypto.randomUUID(),
      correlationId: record.correlationId,
      operation: record.operation,
      inputData: {
        source: record.inputSource,
        hash,
        description: record.inputDescription,
        metadata: record.inputMetadata,
      },
      outputData: {
        result: record.result,
        confidence: record.confidence,
        explanation: record.explanation,
      },
      performanceMetrics:
        record.latencyMs === undefined
          ? undefined
          : { latencyMs: record.latencyMs },
    });
  } catch (error) {
    reportComplianceFailure(record.operation, error);
  }
}

function reportComplianceFailure(operation: string, error: unknown): void {
  try {
    logger.warn("EU AI Act compliance logging failed", {
      component: COMPLIANCE_LOG_COMPONENT,
      operation,
      error: toError(error).message,
    });
  } catch {
    // The warning path must never propagate into request handling.
  }
}

// ============================================================================
// Research agent LLM extraction (relocated from orchestrator/index.ts)
// ============================================================================

/**
 * Apply per-source confidence weighting to a discovered referral code.
 * Relocated alongside extractWithAI so both extraction paths share it.
 */
export function applySourceConfidence(
  baseConfidence: number,
  sourceName: string,
): number {
  const sourceWeights: { [key: string]: number } = {
    producthunt: 0.85,
    github: 0.8,
    reddit: 0.75,
    hackernews: 0.8,
    company_site: 0.7,
  };

  const weight = sourceWeights[sourceName] || 0.7;
  return Math.min(0.95, baseConfidence * weight);
}

/**
 * Run the AI extractor over raw fetched content to surface referral codes
 * that regex extraction would miss, then emit the Article 12 compliance
 * event for the LLM interaction.
 */
export async function extractWithAI(
  env: Env,
  content: string,
  query: string,
): Promise<ReferralResearchResult["discovered_codes"]> {
  if (!env.AI || !content.trim()) {
    return [];
  }
  try {
    const extractor = createAIExtractor(undefined, 8000);
    const result = await extractor.scrape(
      env as unknown as ScraperEnv,
      content,
    );
    if (!result.success) {
      return [];
    }

    const items = JSON.parse(result.content) as Array<{
      code?: string;
      url?: string;
      reward?: string;
      confidence?: number;
    }>;

    const codes: ReferralResearchResult["discovered_codes"] = [];
    for (const item of items) {
      if (!item.code || !item.url) continue;
      const confidence = Math.max(0, Math.min(1, item.confidence ?? 0.5));
      if (confidence < CONFIG.RESEARCH_MIN_CONFIDENCE) continue;

      codes.push({
        code: item.code,
        url: item.url,
        source: "ai_extractor",
        discovered_at: new Date().toISOString(),
        reward_summary: item.reward,
        confidence: applySourceConfidence(confidence, "company_site"),
      });
    }

    await logAIInteraction(env.DEALS_DB, {
      operation: RESEARCH_EXTRACTION_COMPLIANCE_OPERATION,
      inputSource: "research_agent",
      rawInput: content,
      inputDescription: `llm_referral_extraction;codes=${codes.length}`,
      inputMetadata: {
        extracted_count: codes.length,
        content_chars: content.length,
      },
      result: `codes:${codes.length}`,
      explanation: "Workers AI LLM extraction over fetched source content",
    });

    return codes;
  } catch (error) {
    const err = toError(error);
    logger.debug("AI extraction failed", {
      component: "research-orchestrator",
      query,
      error: err.message,
    });
    return [];
  }
}
