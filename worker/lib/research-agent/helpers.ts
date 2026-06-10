import type { ReferralResearchResult, WebResearchRequest } from "../../types";
import type { ResearchSource } from "./types";
import { KNOWN_REFERRAL_PROGRAMS } from "./constants";

export function normalizeResearchQuery(query: string, domain?: string): string {
  let normalized = query.toLowerCase().trim();

  if (domain && !normalized.includes(domain.toLowerCase())) {
    normalized = `${domain} ${normalized}`;
  }

  normalized = normalized
    .replace(/\binvite\b/g, "referral")
    .replace(/\bpromo\b/g, "referral")
    .replace(/\bpromotion\b/g, "referral program");

  return normalized;
}

export function generateSearchQueries(
  normalizedQuery: string,
  source: string,
): string[] {
  const queries: string[] = [];

  switch (source) {
    case "producthunt":
      queries.push(
        `${normalizedQuery} referral`,
        `${normalizedQuery} invite`,
        `${normalizedQuery} promo code`,
      );
      break;
    case "reddit":
      queries.push(
        `${normalizedQuery} referral code`,
        `${normalizedQuery} invite code`,
        `site:reddit.com ${normalizedQuery} referral`,
      );
      break;
    case "hackernews":
      queries.push(
        `${normalizedQuery} referral`,
        `${normalizedQuery} affiliate`,
        `${normalizedQuery} invite`,
      );
      break;
    case "github":
      queries.push(
        `${normalizedQuery} referral program`,
        `${normalizedQuery} referral readme`,
        `${normalizedQuery} invite`,
      );
      break;
    default:
      queries.push(normalizedQuery);
  }

  return queries;
}

export function generatePotentialCodes(
  domain: string,
  depth: WebResearchRequest["depth"],
): Array<{ code: string; url: string; typicalReward: string }> {
  const knownProgram = KNOWN_REFERRAL_PROGRAMS[domain];
  if (!knownProgram) return [];

  const codes: Array<{ code: string; url: string; typicalReward: string }> = [];
  const count = depth === "quick" ? 3 : depth === "thorough" ? 5 : 10;

  for (let i = 0; i < count; i++) {
    const sampleCode = generateSampleCode(domain, i);
    const urlFormat =
      knownProgram.urlFormats[0] ?? `https://${domain}/invite/{code}`;

    codes.push({
      code: sampleCode,
      url: urlFormat.replace("{code}", sampleCode),
      typicalReward:
        knownProgram.typicalRewards[i % knownProgram.typicalRewards.length] ??
        "Unknown reward",
    });
  }

  return codes;
}

export function generateSampleCode(domain: string, index: number): string {
  const prefixes = ["REF", "INV", domain.slice(0, 3).toUpperCase()];
  const prefix = prefixes[index % prefixes.length];
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const suffix = Array.from(array, (b) => (b % 36).toString(36))
    .join("")
    .toUpperCase();
  return `${prefix}${suffix}`;
}

export function simulateDiscovery(
  query: string,
  source: ResearchSource,
  depth: WebResearchRequest["depth"],
): ReferralResearchResult["discovered_codes"] {
  const codes: ReferralResearchResult["discovered_codes"] = [];
  const count = depth === "quick" ? 2 : depth === "thorough" ? 5 : 8;

  for (let i = 0; i < count; i++) {
    const code = generateSimulatedCode(source.name, i);
    const confidence = Math.max(0.3, 0.9 - i * 0.1);

    codes.push({
      code,
      url: `https://example.com/referral/${code.toLowerCase()}`,
      source: source.name,
      discovered_at: new Date().toISOString(),
      reward_summary: generateSimulatedReward(source.name),
      confidence,
    });
  }

  return codes;
}

export function generateSimulatedCode(source: string, index: number): string {
  const prefixes: Record<string, string[]> = {
    producthunt: ["PH", "HUNT"],
    reddit: ["REDDIT", "R"],
    hackernews: ["HN", "YC"],
    github: ["GH", "GIT"],
    company_site: ["REF", "INV"],
    twitter: ["TW", "X"],
  };

  const prefix = prefixes[source]?.[index % 2] || "REF";
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  const suffix = Array.from(array, (b) => (b % 36).toString(36))
    .join("")
    .toUpperCase();
  return `${prefix}${suffix}${index}`;
}

export function generateSimulatedReward(source: string): string {
  const rewards: Record<string, string[]> = {
    producthunt: ["20% off", "$50 credit", "Free month"],
    reddit: ["$25 bonus", "10% discount", "Free shipping"],
    hackernews: ["$100 credit", "Lifetime deal", "50% off first year"],
    github: ["$50 in credits", "Pro features", "Team upgrade"],
    company_site: ["Referral bonus", "Cash reward", "Credit bonus"],
    twitter: ["Early access", "Beta invite", "Discount code"],
  };

  const sourceRewards = rewards[source] ?? ["Unknown reward"];
  const array = new Uint8Array(1);
  crypto.getRandomValues(array);
  const firstByte = array[0];
  if (firstByte === undefined) return "Unknown reward";
  return sourceRewards[firstByte % sourceRewards.length] ?? "Unknown reward";
}

export function deduplicateCodes(
  codes: ReferralResearchResult["discovered_codes"],
): ReferralResearchResult["discovered_codes"] {
  const seen = new Set<string>();
  return codes.filter((code) => {
    const key = code.code.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractRewardValue(rewardSummary?: string): number | undefined {
  if (!rewardSummary) return undefined;

  const matches = rewardSummary.match(/\$?([\d,]+(?:\.\d{2})?)/);
  if (matches && matches[1] !== undefined) {
    return parseFloat(matches[1].replace(/,/g, ""));
  }

  const percentMatch = rewardSummary.match(/(\d+)%/);
  if (percentMatch && percentMatch[1] !== undefined) {
    return parseInt(percentMatch[1], 10);
  }

  return undefined;
}

export function getDefaultResearchConfig() {
  return {
    maxRequestsPerMinute: 60,
    requestWindowMs: 60000,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxRetryDelayMs: 30000,
    cacheEnabled: true,
    cacheTtlMs: 3600000,
    circuitBreakerEnabled: true,
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    sourceWeights: {
      producthunt: 0.85,
      github: 0.8,
      reddit: 0.75,
      hackernews: 0.8,
      company_site: 0.7,
    },
  };
}
