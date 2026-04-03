// ============================================================================
// Deal Categorization - Auto-categorize deals based on content analysis
// ============================================================================

import type { Deal, DealMetadata } from "../types";

// Category definitions with keywords for classification
export const CATEGORY_DEFINITIONS: Record<
  string,
  {
    keywords: string[];
    domains: string[];
    description: string;
  }
> = {
  finance: {
    keywords: [
      "bank",
      "investing",
      "brokerage",
      "trading",
      "stock",
      "crypto",
      "credit card",
      "debit card",
      "loan",
      "mortgage",
      "savings",
      "checking",
      "account",
      "cashback",
      "dividend",
      "portfolio",
      "trade",
      "deposit",
      "withdrawal",
      "transfer",
      "dividend",
    ],
    domains: [
      "trading212.com",
      "robinhood.com",
      "webull.com",
      "public.com",
      "moomoo.com",
      "fidelity.com",
      "schwab.com",
      "etrade.com",
      "coinbase.com",
      "binance.com",
      "kraken.com",
      "gemini.com",
      "chase.com",
      "bankofamerica.com",
      "wellsfargo.com",
      "citi.com",
      "americanexpress.com",
      "capitalone.com",
      "discover.com",
    ],
    description:
      "Financial services, banking, investing, and trading platforms",
  },

  food_delivery: {
    keywords: [
      "food",
      "delivery",
      "meal",
      "restaurant",
      "dining",
      "grocery",
      "doordash",
      "ubereats",
      "grubhub",
      "postmates",
      "delivery",
      "takeout",
      "cuisine",
      "pizza",
      "sushi",
      "burger",
    ],
    domains: [
      "doordash.com",
      "ubereats.com",
      "grubhub.com",
      "postmates.com",
      "instacart.com",
      "gopuff.com",
      "delivery.com",
      "seamless.com",
    ],
    description: "Food delivery and meal services",
  },

  transportation: {
    keywords: [
      "ride",
      "taxi",
      "uber",
      "lyft",
      "transport",
      "travel",
      "commute",
      "scooter",
      "bike",
      "rental",
      "car",
      "vehicle",
      "mile",
      "trip",
    ],
    domains: [
      "uber.com",
      "lyft.com",
      "lime.bike",
      "bird.co",
      "spin.app",
      "zipcar.com",
      "turo.com",
      "getaround.com",
    ],
    description: "Transportation, ride-sharing, and mobility services",
  },

  travel: {
    keywords: [
      "hotel",
      "flight",
      "airbnb",
      "booking",
      "vacation",
      "trip",
      "travel",
      "stay",
      "accommodation",
      "airline",
      "resort",
      "expedia",
      "booking.com",
      "hostel",
      "motel",
    ],
    domains: [
      "airbnb.com",
      "booking.com",
      "expedia.com",
      "hotels.com",
      "kayak.com",
      "priceline.com",
      "trip.com",
      "agoda.com",
      "vrbo.com",
      "hostelworld.com",
      "skyscanner.com",
    ],
    description: "Travel, accommodation, and booking platforms",
  },

  shopping: {
    keywords: [
      "shop",
      "store",
      "discount",
      "coupon",
      "cashback",
      "save",
      "amazon",
      "ebay",
      "retail",
      "purchase",
      "buy",
      "sale",
      "deal",
      "offer",
      "promo",
      "voucher",
    ],
    domains: [
      "amazon.com",
      "ebay.com",
      "walmart.com",
      "target.com",
      "bestbuy.com",
      "costco.com",
      "rakuten.com",
      "retailmenot.com",
      "honey.com",
      "ibotta.com",
      "fetchrewards.com",
    ],
    description: "Shopping, retail, and cashback platforms",
  },

  cloud_storage: {
    keywords: [
      "cloud",
      "storage",
      "backup",
      "sync",
      "file",
      "data",
      "google drive",
      "dropbox",
      "onedrive",
      "icloud",
      "server",
      "hosting",
      "vps",
      "database",
      "cdn",
    ],
    domains: [
      "dropbox.com",
      "drive.google.com",
      "icloud.com",
      "onedrive.live.com",
      "box.com",
      "pcloud.com",
      "sync.com",
      "mega.nz",
      "aws.amazon.com",
      "cloud.google.com",
      "azure.microsoft.com",
      "digitalocean.com",
      "linode.com",
      "vultr.com",
    ],
    description: "Cloud storage, hosting, and infrastructure services",
  },

  communication: {
    keywords: [
      "phone",
      "mobile",
      "cell",
      "internet",
      "wifi",
      "broadband",
      "verizon",
      "at&t",
      "t-mobile",
      "sprint",
      "mint",
      "visible",
      "call",
      "text",
      "message",
      "chat",
      "voip",
    ],
    domains: [
      "verizon.com",
      "att.com",
      "t-mobile.com",
      "mintmobile.com",
      "visible.com",
      "cricketwireless.com",
      "metrobyt-mobile.com",
      "uscellular.com",
      "xfinity.com",
      "spectrum.com",
    ],
    description:
      "Mobile carriers, internet providers, and communication services",
  },

  entertainment: {
    keywords: [
      "streaming",
      "movie",
      "music",
      "video",
      "game",
      "gaming",
      "netflix",
      "spotify",
      "hulu",
      "disney",
      "hbo",
      "prime",
      "subscription",
      "watch",
      "listen",
      "play",
      "console",
    ],
    domains: [
      "netflix.com",
      "spotify.com",
      "hulu.com",
      "disneyplus.com",
      "hbomax.com",
      "primevideo.com",
      "youtube.com",
      "twitch.tv",
      "steam.com",
      "xbox.com",
      "playstation.com",
      "epicgames.com",
    ],
    description: "Streaming, gaming, and entertainment subscriptions",
  },

  health: {
    keywords: [
      "health",
      "fitness",
      "gym",
      "workout",
      "exercise",
      "wellness",
      "medical",
      "doctor",
      "pharmacy",
      "insurance",
      "vitamin",
      "peloton",
      "nike",
      "adidas",
      "under armour",
    ],
    domains: [
      "peloton.com",
      "nike.com",
      "adidas.com",
      "underarmour.com",
      "myfitnesspal.com",
      "strava.com",
      "fitbit.com",
      "whoop.com",
      "headspace.com",
      "calm.com",
      "noom.com",
      "weightwatchers.com",
    ],
    description: "Health, fitness, and wellness services",
  },

  education: {
    keywords: [
      "learn",
      "course",
      "class",
      "education",
      "study",
      "student",
      "university",
      "college",
      "school",
      "degree",
      "certification",
      "udemy",
      "coursera",
      "skillshare",
      "masterclass",
    ],
    domains: [
      "coursera.org",
      "udemy.com",
      "skillshare.com",
      "masterclass.com",
      "edx.org",
      "khanacademy.org",
      "duolingo.com",
      "codecademy.com",
      "linkedin.com/learning",
    ],
    description: "Online learning and educational platforms",
  },

  software: {
    keywords: [
      "software",
      "app",
      "application",
      "tool",
      "saas",
      "license",
      "subscription",
      "download",
      "install",
      "program",
      "service",
    ],
    domains: [
      "github.com",
      "gitlab.com",
      "notion.so",
      "slack.com",
      "zoom.us",
      "figma.com",
      "canva.com",
      "adobe.com",
      "microsoft.com",
    ],
    description: "Software, applications, and SaaS products",
  },

  referral: {
    keywords: [
      "refer",
      "referral",
      "invite",
      "friend",
      "sign up",
      "join",
      "new user",
      "first time",
      "bonus",
      "reward",
      "credit",
    ],
    domains: [],
    description: "General referral programs",
  },
};

// Tag definitions for additional classification
export const TAG_DEFINITIONS: Record<
  string,
  {
    keywords: string[];
    relatedCategories: string[];
  }
> = {
  signup_bonus: {
    keywords: [
      "sign up",
      "new account",
      "first deposit",
      "welcome bonus",
      "new user",
    ],
    relatedCategories: ["finance", "referral", "shopping"],
  },
  cashback: {
    keywords: ["cashback", "cash back", "percent back", "% back", "reward"],
    relatedCategories: ["finance", "shopping"],
  },
  crypto: {
    keywords: [
      "bitcoin",
      "ethereum",
      "crypto",
      "cryptocurrency",
      "btc",
      "eth",
      "wallet",
    ],
    relatedCategories: ["finance"],
  },
  stock_trading: {
    keywords: ["stock", "share", "equity", "trade", "trade", "commission free"],
    relatedCategories: ["finance"],
  },
  high_value: {
    keywords: [],
    relatedCategories: [], // Determined by reward value
  },
  limited_time: {
    keywords: ["limited", "expires", "deadline", "ends soon", "while supplies"],
    relatedCategories: [],
  },
  recurring: {
    keywords: [
      "monthly",
      "annual",
      "subscription",
      "recurring",
      "per month",
      "per year",
    ],
    relatedCategories: [],
  },
};

/**
 * Calculate category scores for a deal based on content analysis
 */
export function calculateCategoryScores(deal: Deal): Map<string, number> {
  const scores = new Map<string, number>();
  const text =
    `${deal.title} ${deal.description} ${deal.source.domain}`.toLowerCase();
  const code = deal.code.toLowerCase();

  // Score each category
  for (const [category, definition] of Object.entries(CATEGORY_DEFINITIONS)) {
    let score = 0;

    // Check domain match (highest weight)
    if (
      definition.domains.some((d) =>
        deal.source.domain.toLowerCase().includes(d),
      )
    ) {
      score += 10;
    }

    // Check keyword matches
    for (const keyword of definition.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Bonus for code relevance
    if (code.includes(category.toLowerCase().replace("_", ""))) {
      score += 0.5;
    }

    if (score > 0) {
      scores.set(category, score);
    }
  }

  return scores;
}

/**
 * Calculate tag scores for a deal
 */
export function calculateTagScores(deal: Deal): Map<string, number> {
  const scores = new Map<string, number>();
  const text = `${deal.title} ${deal.description}`.toLowerCase();

  // Check keyword-based tags
  for (const [tag, definition] of Object.entries(TAG_DEFINITIONS)) {
    let score = 0;

    // Check keyword matches
    for (const keyword of definition.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (score > 0) {
      scores.set(tag, score);
    }
  }

  // High value tag based on reward
  const rewardValue =
    typeof deal.reward.value === "number" ? deal.reward.value : 0;
  if (rewardValue >= 50) {
    scores.set("high_value", rewardValue);
  }

  return scores;
}

/**
 * Auto-categorize a deal and return updated metadata
 */
export function autoCategorize(deal: Deal): DealMetadata {
  const categoryScores = calculateCategoryScores(deal);
  const tagScores = calculateTagScores(deal);

  // Get top categories (score >= 2)
  const categories: string[] = [];
  const sortedCategories = Array.from(categoryScores.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  // Always include top category if score >= 2
  if (sortedCategories.length > 0 && sortedCategories[0][1] >= 2) {
    categories.push(sortedCategories[0][0]);

    // Include second category if score is close (within 50%)
    if (sortedCategories.length > 1) {
      const topScore = sortedCategories[0][1];
      const secondScore = sortedCategories[1][1];
      if (secondScore >= topScore * 0.5 && secondScore >= 2) {
        categories.push(sortedCategories[1][0]);
      }
    }
  }

  // Default to "general" if no categories found
  if (categories.length === 0) {
    categories.push("general");
  }

  // Always add "referral" if it's a referral deal
  if (!categories.includes("referral")) {
    categories.push("referral");
  }

  // Get top tags (score >= 1, max 5 tags)
  const tags: string[] = [];
  const sortedTags = Array.from(tagScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Add domain as tag
  tags.push(deal.source.domain.replace(/\.[a-z]+$/, ""));

  // Add source type
  tags.push("auto-categorized");

  // Add high-scoring tags
  tags.push(...sortedTags);

  // Remove duplicates and limit
  const uniqueTags = [...new Set(tags)].slice(0, 8);

  return {
    ...deal.metadata,
    category: categories,
    tags: uniqueTags,
  };
}

/**
 * Batch auto-categorize multiple deals
 */
export function batchAutoCategorize(deals: Deal[]): Deal[] {
  return deals.map((deal) => ({
    ...deal,
    metadata: autoCategorize(deal),
  }));
}

/**
 * Get category statistics from a set of deals
 */
export function getCategoryStats(deals: Deal[]): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const deal of deals) {
    for (const category of deal.metadata.category) {
      stats[category] = (stats[category] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Get tag statistics from a set of deals
 */
export function getTagStats(deals: Deal[]): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const deal of deals) {
    for (const tag of deal.metadata.tags) {
      stats[tag] = (stats[tag] || 0) + 1;
    }
  }

  return stats;
}
