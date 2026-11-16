/**
 * Discovery AI Extraction
 *
 * When static selectors/regex find nothing on a fetched page, the AI extractor
 * from the research-agent scraper stack can still surface referral codes from
 * marketing copy. This module keeps that wiring out of `discover.ts` (source
 * size limit) and constrains everything the model returns:
 *
 * - extraction is fail-closed behind the `ai_extractor_scraper` flag (the
 *   flag check lives in `extractWithAI`, ADR-032);
 * - AI-suggested URLs must pass `validateReferralUrl` for the source domain,
 *   otherwise the canonical `https://<domain>/invite/<code>` URL is used;
 * - codes must be 4-50 chars of A-Z/0-9/underscore/dash;
 * - confidence must clear CONFIG.RESEARCH_MIN_CONFIDENCE.
 */

import type { Env, SourceConfig } from "../types";
import { CONFIG } from "../config";
import { extractWithAI } from "../lib/research-agent/compliance-log";
import { extractRewardValue } from "../lib/research-agent/helpers";
import { validateReferralUrl } from "../lib/security";
import { logger } from "../lib/global-logger";

export interface AIExtractedDeal {
  code: string;
  url: string;
  title: string;
  description: string;
  reward_type: string;
  reward_value: string | number;
  reward_currency?: string | undefined;
}

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{3,49}$/i;

/**
 * Run LLM extraction over fetched content and map results to the discovery
 * `ExtractedDeal` shape. Returns [] when the flag is off, the model fails, or
 * nothing usable comes back.
 */
export async function extractDealsWithAI(
  env: Env,
  content: string,
  source: SourceConfig,
): Promise<AIExtractedDeal[]> {
  if (!content.trim()) return [];

  const codes = await extractWithAI(
    env,
    content,
    `${source.domain} referral code invite`,
  );
  if (codes.length === 0) return [];

  const deals: AIExtractedDeal[] = [];
  const seen = new Set<string>();

  for (const item of codes) {
    const code = item.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code) || seen.has(code)) continue;
    if (item.confidence < CONFIG.RESEARCH_MIN_CONFIDENCE) continue;

    const suggestedUrl = item.url.trim();
    const url = validateReferralUrl(suggestedUrl, source.domain)
      ? suggestedUrl
      : `https://${source.domain}/invite/${code}`;

    const rewardValue = extractRewardValue(item.reward_summary);
    seen.add(code);
    deals.push({
      code,
      url,
      title: `${source.domain} referral code ${code}`,
      description:
        item.reward_summary ??
        `AI-extracted referral code for ${source.domain}`,
      reward_type: rewardValue !== undefined ? "cash" : "credit",
      reward_value: rewardValue ?? 0,
    });
  }

  if (deals.length > 0) {
    logger.info("discovery: AI extractor found codes", {
      component: "discovery",
      domain: source.domain,
      count: deals.length,
    });
  }
  return deals;
}
