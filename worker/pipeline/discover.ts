import { Deal, SourceConfig, PipelineError, PipelineContext } from '../types';
import type { Env } from '../types';
import { CONFIG } from '../config';
import { getSourceRegistry, recordSourceValidation } from '../lib/storage';
import { generateDealId, calculateStringSimilarity } from '../lib/crypto';

// ============================================================================
// Discovery Engine
// ============================================================================

interface DiscoveryResult {
  deals: Deal[];
  errors: Array<{ url: string; error: string }>;
}

interface ExtractedDeal {
  code: string;
  url: string;
  title: string;
  description: string;
  reward_type: string;
  reward_value: string | number;
  reward_currency?: string;
  expiry_date?: string;
}

/**
 * Run discovery across all configured sources
 */
export async function discover(
  env: Env,
  ctx: PipelineContext
): Promise<DiscoveryResult> {
  const sources = await getSourceRegistry(env);
  const activeSources = sources.filter((s) => s.active);

  if (activeSources.length === 0) {
    console.warn('No active sources configured');
    return { deals: [], errors: [] };
  }

  const deals: Deal[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (const source of activeSources) {
    if (source.classification === 'blocked') {
      continue;
    }

    try {
      const result = await discoverFromSource(env, source);
      deals.push(...result.deals);
      errors.push(...result.errors);

      // Update source discovery count
      source.discovery_count = (source.discovery_count || 0) + 1;
      source.last_discovery = new Date().toISOString();
    } catch (error) {
      errors.push({
        url: source.domain,
        error: (error as Error).message,
      });
    }
  }

  return { deals, errors };
}

/**
 * Discover deals from a single source
 */
async function discoverFromSource(
  env: Env,
  source: SourceConfig
): Promise<DiscoveryResult> {
  const deals: Deal[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (const pattern of source.url_patterns) {
    try {
      const url = `https://${source.domain}${pattern}`;

      // Respect payload limits
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)',
          Accept: 'text/html,application/json',
        },
        signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const content = await response.text();

      // Check payload size
      if (content.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
        throw new Error('Payload exceeds size limit');
      }

      let extracted: ExtractedDeal[];

      if (contentType.includes('application/json')) {
        extracted = parseJSONContent(content, source);
      } else {
        extracted = parseHTMLContent(content, source);
      }

      for (const item of extracted) {
        try {
          const deal = await buildDeal(item, source);
          deals.push(deal);
        } catch (error) {
          errors.push({
            url: item.url,
            error: `Build failed: ${(error as Error).message}`,
          });
        }
      }

      // Record success
      await recordSourceValidation(env, source.domain, true);
    } catch (error) {
      errors.push({
        url: `${source.domain}${pattern}`,
        error: (error as Error).message,
      });
      await recordSourceValidation(env, source.domain, false);
    }
  }

  return { deals, errors };
}

/**
 * Parse HTML content using selectors
 */
function parseHTMLContent(content: string, source: SourceConfig): ExtractedDeal[] {
  const deals: ExtractedDeal[] = [];
  const selectors = source.selectors || {};

  // Use regex-based extraction as we don't have DOM parser in Workers
  // Look for referral code patterns
  const codePattern = /(?:referral|invite|promo)[_-]?(?:code)?["']?\s*[:=]\s*["']?([A-Z0-9]{6,20})/gi;
  const urlPattern = /https?:\/\/[^\s"<>]+/gi;
  const rewardPattern = /(?:reward|bonus|get|earn)\s+\$?([0-9,]+(?:\.[0-9]+)?)\s*(USD|EUR|GBP|%)?/gi;

  // Extract codes
  let match;
  while ((match = codePattern.exec(content)) !== null) {
    const code = match[1];

    // Find associated URL
    const urlMatch = content.slice(Math.max(0, match.index - 500), match.index + 500)
      .match(urlPattern);

    // Find reward info
    const rewardMatch = content.slice(Math.max(0, match.index - 500), match.index + 500)
      .match(rewardPattern);

    deals.push({
      code,
      url: urlMatch ? urlMatch[0] : `https://${source.domain}/invite/${code}`,
      title: extractTitle(content, code),
      description: extractDescription(content, code),
      reward_type: rewardMatch ? (rewardMatch[3] === '%' ? 'percent' : 'cash') : 'credit',
      reward_value: rewardMatch ? parseFloat(rewardMatch[1].replace(',', '')) : 0,
      reward_currency: rewardMatch?.[3] && rewardMatch[3] !== '%' ? rewardMatch[3] : undefined,
    });
  }

  // Deduplicate by code
  const seen = new Set<string>();
  return deals.filter((d) => {
    if (seen.has(d.code)) return false;
    seen.add(d.code);
    return true;
  });
}

/**
 * Parse JSON content
 */
function parseJSONContent(content: string, source: SourceConfig): ExtractedDeal[] {
  try {
    const data = JSON.parse(content);
    const deals: ExtractedDeal[] = [];

    // Handle different JSON structures
    const items = Array.isArray(data) ? data : data.deals || data.items || [data];

    for (const item of items) {
      if (item.code || item.referral_code || item.invite_code) {
        deals.push({
          code: item.code || item.referral_code || item.invite_code,
          url: item.url || item.link || `https://${source.domain}/invite/${item.code}`,
          title: item.title || item.name || `${source.domain} Referral`,
          description: item.description || `Referral code for ${source.domain}`,
          reward_type: item.reward_type || (item.percent ? 'percent' : 'cash'),
          reward_value: item.reward_value || item.amount || item.bonus || 0,
          reward_currency: item.currency || item.reward_currency,
          expiry_date: item.expiry || item.expires_at,
        });
      }
    }

    return deals;
  } catch {
    return [];
  }
}

/**
 * Build a complete Deal from extracted data
 */
async function buildDeal(
  extracted: ExtractedDeal,
  source: SourceConfig
): Promise<Deal> {
  const domain = source.domain;
  const now = new Date().toISOString();

  const id = await generateDealId(domain, extracted.code, extracted.reward_type);

  return {
    id,
    source: {
      url: extracted.url,
      domain,
      discovered_at: now,
      trust_score: source.trust_initial,
    },
    title: extracted.title,
    description: extracted.description,
    code: extracted.code,
    url: extracted.url,
    reward: {
      type: extracted.reward_type as 'cash' | 'credit' | 'percent' | 'item',
      value: extracted.reward_value,
      currency: extracted.reward_currency,
    },
    expiry: {
      date: extracted.expiry_date,
      confidence: extracted.expiry_date ? 0.8 : 0.3,
      type: extracted.expiry_date ? 'hard' : 'unknown',
    },
    metadata: {
      category: ['referral', 'signup'],
      tags: [domain, extracted.reward_type],
      normalized_at: now,
      confidence_score: source.trust_initial,
      status: 'active',
    },
  };
}

/**
 * Extract title from content context
 */
function extractContent(content: string, code: string, window: number = 500): string {
  const index = content.indexOf(code);
  if (index === -1) return '';
  return content.slice(Math.max(0, index - window), index + window);
}

function extractTitle(content: string, code: string): string {
  const context = extractContent(content, code);
  const titleMatch = context.match(/<title>([^<]+)/i);
  if (titleMatch) return titleMatch[1].trim();

  const h1Match = context.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match) return h1Match[1].trim();

  return 'Referral Deal';
}

function extractDescription(content: string, code: string): string {
  const context = extractContent(content, code, 300);
  const metaMatch = context.match(/<meta[^>]*description[^>]*content="([^"]+)"/i);
  if (metaMatch) return metaMatch[1].trim();

  const pMatch = context.match(/<p[^>]*>([^<]+)/i);
  if (pMatch) return pMatch[1].trim();

  return `Use referral code ${code}`;
}
