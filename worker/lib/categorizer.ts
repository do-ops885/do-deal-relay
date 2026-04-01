import { Deal } from "../types";

// ============================================================================
// Deal Categorization System
// ============================================================================

export interface DealCategory {
  primary: "finance" | "crypto" | "shopping" | "travel" | "gaming" | "other";
  subcategories: string[];
  tags: string[];
  confidence: number; // 0-1
}

// Primary categories
const PRIMARY_CATEGORIES = [
  "finance",
  "crypto",
  "shopping",
  "travel",
  "gaming",
  "other",
] as const;

// Domain to category mapping
const DOMAIN_CATEGORY_MAP: Record<string, string> = {
  // Finance
  "trading212.com": "finance",
  "freetrade.io": "finance",
  "revolut.com": "finance",
  "n26.com": "finance",
  "monzo.com": "finance",
  "starlingbank.com": "finance",
  "chase.com": "finance",
  bank: "finance",
  credit: "finance",
  invest: "finance",
  broker: "finance",
  trading: "finance",
  stock: "finance",

  // Crypto
  "coinbase.com": "crypto",
  "binance.com": "crypto",
  "kraken.com": "crypto",
  "crypto.com": "crypto",
  "ledger.com": "crypto",
  bitcoin: "crypto",
  ethereum: "crypto",
  blockchain: "crypto",
  nft: "crypto",
  defi: "crypto",

  // Shopping
  "amazon.com": "shopping",
  "ebay.com": "shopping",
  "walmart.com": "shopping",
  "target.com": "shopping",
  "bestbuy.com": "shopping",
  coupon: "shopping",
  discount: "shopping",
  cashback: "shopping",
  voucher: "shopping",
  promo: "shopping",
  sale: "shopping",
  store: "shopping",
  retail: "shopping",

  // Travel
  "airbnb.com": "travel",
  "booking.com": "travel",
  "expedia.com": "travel",
  "hotels.com": "travel",
  "skyscanner.com": "travel",
  hotel: "travel",
  flight: "travel",
  airline: "travel",
  vacation: "travel",
  miles: "travel",
  points: "travel",
  loyalty: "travel",

  // Gaming
  steam: "gaming",
  xbox: "gaming",
  playstation: "gaming",
  nintendo: "gaming",
  fortnite: "gaming",
  roblox: "gaming",
  minecraft: "gaming",
  game: "gaming",
  esports: "gaming",
  twitch: "gaming",
  discord: "gaming",
};

// Keywords mapping for text analysis
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  finance: [
    "stock",
    "invest",
    "trading",
    "broker",
    "bank",
    "card",
    "credit",
    "debit",
    "savings",
    "account",
    "portfolio",
    "dividend",
    "etf",
    "fund",
    "share",
    "equity",
    "bond",
    "interest",
    "mortgage",
    "loan",
    "wire",
    "transfer",
    "payment",
    "fintech",
    "wealth",
  ],
  crypto: [
    "bitcoin",
    "crypto",
    "btc",
    "eth",
    "ethereum",
    "blockchain",
    "nft",
    "token",
    "wallet",
    "mining",
    "defi",
    "decentralized",
    "altcoin",
    "exchange",
    "staking",
    "yield",
    "airdrop",
    "ico",
    "web3",
    "metaverse",
  ],
  shopping: [
    "coupon",
    "discount",
    "cashback",
    "save",
    "store",
    "voucher",
    "promo",
    "sale",
    "deal",
    "bargain",
    "retail",
    "purchase",
    "buy",
    "shop",
    "marketplace",
    "ecommerce",
    "online store",
    "price drop",
    "clearance",
    "outlet",
  ],
  travel: [
    "hotel",
    "flight",
    "airbnb",
    "booking",
    "miles",
    "points",
    "vacation",
    "trip",
    "travel",
    "accommodation",
    "airline",
    "resort",
    "cruise",
    "rental",
    "car hire",
    "loyalty",
    "frequent flyer",
    "upgrade",
    "lounge",
    "destination",
  ],
  gaming: [
    "game",
    "steam",
    "xbox",
    "playstation",
    "fortnite",
    "roblox",
    "minecraft",
    "esports",
    "twitch",
    "discord",
    "gamer",
    "gaming",
    "console",
    "controller",
    "mmo",
    "rpg",
    "fps",
    "battle royale",
    "skins",
    "dlc",
    "dlc pack",
  ],
};

// Subcategory detection patterns
const SUBCATEGORY_PATTERNS: Record<string, string[]> = {
  "finance-banking": ["bank account", "savings", "checking", "debit card"],
  "finance-investing": ["stock", "broker", "trading", "portfolio", "invest"],
  "finance-credit": ["credit card", "credit limit", "credit score"],
  "crypto-exchange": ["exchange", "trading", "buy crypto", "sell crypto"],
  "crypto-wallet": ["wallet", "cold storage", "ledger", "trezor"],
  "crypto-staking": ["staking", "yield", "earn crypto"],
  "shopping-fashion": ["clothing", "fashion", "apparel", "shoes"],
  "shopping-electronics": ["electronics", "gadget", "tech", "device"],
  "shopping-grocery": ["grocery", "food", "supermarket"],
  "travel-hotel": ["hotel", "resort", "accommodation"],
  "travel-flight": ["flight", "airline", "airport"],
  "travel-car": ["car rental", "rental car", "car hire"],
  "gaming-pc": ["pc game", "steam", "epic games"],
  "gaming-console": ["xbox", "playstation", "nintendo", "switch"],
  "gaming-mobile": ["mobile game", "app store", "play store"],
};

// Reward type to category hints
const REWARD_TYPE_CATEGORIES: Record<string, string> = {
  stock: "finance",
  crypto: "crypto",
  nft: "crypto",
  token: "crypto",
  btc: "crypto",
  eth: "crypto",
  bitcoin: "crypto",
};

/**
 * Categorize a deal based on source, content, and reward type
 */
export function categorizeDeal(deal: Deal): DealCategory {
  const scores: Record<string, number> = {};
  const matchedTags: string[] = [];

  // Initialize scores
  for (const cat of PRIMARY_CATEGORIES) {
    scores[cat] = 0;
  }

  // 1. Domain-based scoring
  const domainScore = scoreByDomain(deal.source.domain);
  for (const [cat, score] of Object.entries(domainScore)) {
    scores[cat] += score * 0.4; // Domain is strong signal (40% weight)
    if (score > 0) {
      matchedTags.push(`domain:${cat}`);
    }
  }

  // 2. Text-based scoring (title + description)
  const textContent = `${deal.title} ${deal.description}`.toLowerCase();
  const textScore = scoreByKeywords(textContent);
  for (const [cat, score] of Object.entries(textScore)) {
    scores[cat] += score * 0.35; // Text is strong signal (35% weight)
    if (score > 0) {
      matchedTags.push(`text:${cat}`);
    }
  }

  // 3. Reward type scoring
  const rewardScore = scoreByRewardType(
    deal.reward.type,
    deal.reward.description,
  );
  for (const [cat, score] of Object.entries(rewardScore)) {
    scores[cat] += score * 0.15; // Reward type is moderate signal (15% weight)
    if (score > 0) {
      matchedTags.push(`reward:${cat}`);
    }
  }

  // 4. URL pattern scoring
  const urlScore = scoreByUrlPatterns(deal.url);
  for (const [cat, score] of Object.entries(urlScore)) {
    scores[cat] += score * 0.1; // URL is weaker signal (10% weight)
    if (score > 0) {
      matchedTags.push(`url:${cat}`);
    }
  }

  // Find primary category
  let primaryCategory = "other" as DealCategory["primary"];
  let maxScore = 0;

  for (const cat of PRIMARY_CATEGORIES) {
    if (scores[cat] > maxScore) {
      maxScore = scores[cat];
      primaryCategory = cat as DealCategory["primary"];
    }
  }

  // If no strong signal, default to other
  if (maxScore < 0.1) {
    primaryCategory = "other";
  }

  // Detect subcategories
  const subcategories = detectSubcategories(primaryCategory, textContent);

  // Generate tags
  const tags = generateTags(deal, primaryCategory, matchedTags, textContent);

  // Calculate confidence based on score distribution
  const confidence = calculateConfidence(scores, maxScore);

  return {
    primary: primaryCategory,
    subcategories,
    tags,
    confidence,
  };
}

/**
 * Score by domain/URL pattern
 */
function scoreByDomain(domain: string): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const cat of PRIMARY_CATEGORIES) {
    scores[cat] = 0;
  }

  const domainLower = domain.toLowerCase();

  // Check exact domain matches
  for (const [pattern, category] of Object.entries(DOMAIN_CATEGORY_MAP)) {
    if (domainLower === pattern || domainLower.endsWith(`.${pattern}`)) {
      scores[category] = 1.0;
      return scores; // Exact match is definitive
    }
  }

  // Check partial domain matches
  for (const [pattern, category] of Object.entries(DOMAIN_CATEGORY_MAP)) {
    if (domainLower.includes(pattern.toLowerCase())) {
      scores[category] = Math.max(scores[category], 0.7);
    }
  }

  return scores;
}

/**
 * Score by keyword analysis in text
 */
function scoreByKeywords(text: string): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const cat of PRIMARY_CATEGORIES) {
    scores[cat] = 0;
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let matchCount = 0;
    let totalWeight = 0;

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      const matches = text.match(regex);
      if (matches) {
        matchCount += matches.length;
        // Longer keywords get higher weight (more specific)
        totalWeight += keyword.length * matches.length;
      }
    }

    if (matchCount > 0) {
      // Normalize by text length and keyword specificity
      scores[category] = Math.min(
        1.0,
        (totalWeight * matchCount) / (text.length * 0.1),
      );
    }
  }

  return scores;
}

/**
 * Score by reward type and description
 */
function scoreByRewardType(
  type: string,
  description?: string,
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const cat of PRIMARY_CATEGORIES) {
    scores[cat] = 0;
  }

  // Check reward type hints
  const typeLower = type.toLowerCase();
  for (const [hint, category] of Object.entries(REWARD_TYPE_CATEGORIES)) {
    if (typeLower.includes(hint)) {
      scores[category] = 0.8;
    }
  }

  // Check reward description if available
  if (description) {
    const descLower = description.toLowerCase();
    for (const [hint, category] of Object.entries(REWARD_TYPE_CATEGORIES)) {
      if (descLower.includes(hint)) {
        scores[category] = Math.max(scores[category], 0.6);
      }
    }
  }

  return scores;
}

/**
 * Score by URL path patterns
 */
function scoreByUrlPatterns(url: string): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const cat of PRIMARY_CATEGORIES) {
    scores[cat] = 0;
  }

  const urlLower = url.toLowerCase();
  const pathPatterns: Record<string, string[]> = {
    finance: ["/invest", "/trade", "/broker", "/bank", "/card"],
    crypto: ["/crypto", "/bitcoin", "/nft", "/defi", "/wallet"],
    shopping: ["/coupon", "/discount", "/sale", "/promo"],
    travel: ["/hotel", "/flight", "/booking", "/vacation"],
    gaming: ["/game", "/steam", "/xbox", "/playstation"],
  };

  for (const [category, patterns] of Object.entries(pathPatterns)) {
    for (const pattern of patterns) {
      if (urlLower.includes(pattern)) {
        scores[category] = Math.max(scores[category], 0.5);
      }
    }
  }

  return scores;
}

/**
 * Detect subcategories based on primary category and text
 */
function detectSubcategories(primary: string, text: string): string[] {
  const subcategories: string[] = [];
  const prefix = `${primary}-`;

  for (const [subcat, patterns] of Object.entries(SUBCATEGORY_PATTERNS)) {
    if (subcat.startsWith(prefix)) {
      for (const pattern of patterns) {
        const regex = new RegExp(`\\b${pattern}\\b`, "gi");
        if (regex.test(text)) {
          subcategories.push(subcat.replace(prefix, ""));
          break;
        }
      }
    }
  }

  return [...new Set(subcategories)]; // Remove duplicates
}

/**
 * Generate relevant tags for the deal
 */
function generateTags(
  deal: Deal,
  primary: string,
  matchedTags: string[],
  text: string,
): string[] {
  const tags: string[] = [];

  // Add primary category as tag
  tags.push(primary);

  // Add signal source tags
  tags.push(...matchedTags);

  // Add specific keyword tags
  const allKeywords = Object.values(CATEGORY_KEYWORDS).flat();
  for (const keyword of allKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    if (regex.test(text) && !tags.includes(keyword)) {
      tags.push(keyword);
    }
  }

  // Add reward type tag
  tags.push(`reward:${deal.reward.type}`);

  // Add high-value tag if applicable
  if (typeof deal.reward.value === "number" && deal.reward.value >= 50) {
    tags.push("high-value");
  }

  // Add expiry confidence tag
  tags.push(`expiry:${deal.expiry.type}`);

  return [...new Set(tags)].slice(0, 20); // Limit to 20 tags, remove duplicates
}

/**
 * Calculate confidence score based on score distribution
 */
function calculateConfidence(
  scores: Record<string, number>,
  maxScore: number,
): number {
  if (maxScore === 0) return 0;

  // Calculate how much the max score dominates
  const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
  const dominance = maxScore / totalScore;

  // Calculate gap to second best
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const gap = sortedScores[0] - sortedScores[1];

  // Confidence is based on dominance and gap
  return Math.min(1.0, dominance * 0.5 + gap * 0.5 + maxScore * 0.3);
}

/**
 * Get all available primary categories
 */
export function getCategories(): string[] {
  return [...PRIMARY_CATEGORIES];
}

/**
 * Check if a string is a valid primary category
 */
export function isValidCategory(category: string): boolean {
  return PRIMARY_CATEGORIES.includes(
    category as (typeof PRIMARY_CATEGORIES)[number],
  );
}
