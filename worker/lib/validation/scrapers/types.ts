import type { Deal, Reward } from "../../../types";

export interface RewardScrapeResult {
  url: string;
  success: boolean;
  currentReward?: Reward;
  rewardChanged: boolean;
  previousReward?: Reward;
  changeDetails?: {
    typeChanged: boolean;
    valueChanged: boolean;
    oldValue?: number | string;
    newValue?: number | string;
  };
  scrapedAt: string;
  error?: string;
  rawData?: string;
}

export interface RewardChange {
  deal: Deal;
  previousReward: Reward;
  currentReward: Reward;
  changeType: "increased" | "decreased" | "type_changed" | "expired" | "new";
  severity: "info" | "warning" | "critical";
  detectedAt: string;
}

export interface ExtractedReward {
  type?: "cash" | "credit" | "percent" | "item";
  value?: number | string;
  currency?: string;
  description?: string;
  confidence: number;
}

export const SCRAPE_TIMEOUT_MS = 15000;
export const MAX_REWARD_CHANGE_THRESHOLD = 1000;

export const REWARD_PATTERNS = {
  cash: [
    /\$?([0-9,]+(?:\.[0-9]{2})?)\s*(?:cash|bonus|reward)/i,
    /(?:get|earn|receive)\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i,
    /\$?([0-9,]+(?:\.[0-9]{2})?)\s*(?:free|bonus)/i,
  ],
  percent: [
    /([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:off|discount|bonus)/i,
    /(?:save|get)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /([0-9]+)\s*percent/i,
  ],
  credit: [
    /\$?([0-9,]+)\s*(?:credit|credits)/i,
    /([0-9,]+)\s*(?:points|tokens|credits)/i,
  ],
  item: [
    /(?:free|bonus)\s+(.{3,50}?)(?:\s|$|[,.])/i,
    /get\s+(.{3,50}?)(?:\s+free|as\s+a\s+bonus)/i,
  ],
};

export const CURRENCY_PATTERNS = [
  { pattern: /\$|USD?/i, code: "USD" },
  { pattern: /€|EUR?/i, code: "EUR" },
  { pattern: /£|GBP?/i, code: "GBP" },
  { pattern: /CA\$|CAD/i, code: "CAD" },
  { pattern: /AU\$|AUD/i, code: "AUD" },
];
