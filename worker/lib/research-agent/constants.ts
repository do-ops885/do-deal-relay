import type { ResearchSource } from "./types";

export const KNOWN_REFERRAL_PROGRAMS: {
  [key: string]: {
    patterns: string[];
    urlFormats: string[];
    typicalRewards: string[];
  };
} = {
  "trading212.com": {
    patterns: ["/invite/", "/referral/"],
    urlFormats: ["https://www.trading212.com/invite/{code}"],
    typicalRewards: [
      "Free share worth up to £100",
      "Free share worth up to €100",
    ],
  },
  "crypto.com": {
    patterns: ["/app/"],
    urlFormats: ["https://crypto.com/app/{code}"],
    typicalRewards: ["$25 USD bonus", "$50 USD bonus"],
  },
  "binance.com": {
    patterns: ["/referral/"],
    urlFormats: ["https://www.binance.com/referral/{code}"],
    typicalRewards: ["Trading fee discount", "Commission kickback"],
  },
  "coinbase.com": {
    patterns: ["/join/"],
    urlFormats: ["https://www.coinbase.com/join/{code}"],
    typicalRewards: ["$10 BTC bonus", "$5 BTC bonus"],
  },
  "robinhood.com": {
    patterns: ["/join/"],
    urlFormats: ["https://join.robinhood.com/{code}"],
    typicalRewards: ["Free stock", "Fractional shares"],
  },
  "webull.com": {
    patterns: ["/activity/"],
    urlFormats: ["https://a.webull.com/{code}"],
    typicalRewards: ["Free stocks", "Commission-free trading"],
  },
  "etoro.com": {
    patterns: ["/invite/"],
    urlFormats: ["https://etoro.tw/{code}"],
    typicalRewards: ["$50 bonus", "$100 bonus"],
  },
  "airbnb.com": {
    patterns: ["/c/", "/refer/"],
    urlFormats: ["https://www.airbnb.com/c/{code}"],
    typicalRewards: ["$25-65 travel credit", "$40 off first stay"],
  },
  "uber.com": {
    patterns: ["/invite/"],
    urlFormats: ["https://www.uber.com/invite/{code}"],
    typicalRewards: ["Free ride credit", "$20 off first ride"],
  },
  "doordash.com": {
    patterns: ["/consumer/referral/"],
    urlFormats: ["https://drd.sh/{code}/"],
    typicalRewards: ["$30 off", "$15 off first order"],
  },
};

export const RESEARCH_SOURCES: ResearchSource[] = [
  {
    name: "producthunt",
    baseUrl: "https://www.producthunt.com",
    searchPattern: "/search?q={query}",
    extractionPatterns: {
      code: [
        /referral[:\s]+([A-Z0-9]{4,})/gi,
        /invite[:\s]+([A-Z0-9]{4,})/gi,
        /code[:\s]+([A-Z0-9]{4,})/gi,
      ],
      reward: [
        /\$?\d+[\d,]*\s*(USD|EUR|GBP)?/gi,
        /(\d+%\s*(off|discount|bonus))/gi,
      ],
      url: [/https?:\/\/[^\s"]+/gi],
    },
    selectors: {
      container: "article",
      code: ".referral-code",
      reward: ".reward-info",
      url: "a.referral-link",
    },
    priority: 1,
    apiConfig: {
      type: "graphql",
      endpoint: "https://api.producthunt.com/v2/api/graphql",
      authType: "bearer",
      rateLimitPerMinute: 30,
      timeoutMs: 10000,
      responseTransformer: "transformProductHuntResponse",
      headers: {
        "Content-Type": "application/json",
      },
    },
  },
  {
    name: "company_site",
    baseUrl: "",
    searchPattern: "",
    extractionPatterns: {
      code: [
        /refer(?:ral)?[:\s]+([A-Z0-9_-]{4,})/gi,
        /invite[:\s]+([A-Z0-9_-]{4,})/gi,
      ],
      reward: [
        /(?:get|earn|receive)\s+([^<\.]{10,100})/gi,
        /\$[\d,]+(?:\.\d{2})?/g,
      ],
      url: [/\/invite\/([A-Z0-9_-]+)/gi, /\/refer\/([A-Z0-9_-]+)/gi],
    },
    selectors: {
      container: ".referral-section, .invite-box",
      code: ".code, [data-testid='referral-code']",
      reward: ".reward, .bonus-desc",
    },
    priority: 1,
    apiConfig: {
      type: "direct",
      endpoint: "",
      authType: "none",
      rateLimitPerMinute: 60,
      timeoutMs: 15000,
      responseTransformer: "transformPageContent",
    },
  },
  {
    name: "reddit",
    baseUrl: "https://www.reddit.com",
    searchPattern: "/search/?q={query}%20referral",
    extractionPatterns: {
      code: [/code[:\s]+([A-Z0-9]{4,})/gi, /(?:use|my)\s+([A-Z0-9]{6,})/gi],
      reward: [/(\$?\d+[^<\.]{5,50}bonus)/gi, /(free[^<\.]{5,30})/gi],
      url: [/https?:\/\/[^\s"]+refer[^\s"]*/gi],
    },
    priority: 2,
    apiConfig: {
      type: "oauth",
      endpoint: "https://oauth.reddit.com",
      authType: "oauth2",
      rateLimitPerMinute: 60,
      timeoutMs: 10000,
      responseTransformer: "transformRedditResponse",
      headers: {
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
    },
  },
  {
    name: "hackernews",
    baseUrl: "https://hn.algolia.com",
    searchPattern: "/?q={query}%20referral",
    extractionPatterns: {
      code: [/invite[:\s]+([A-Z0-9]{4,})/gi, /ref[:\s]+([A-Z0-9]{4,})/gi],
      reward: [/(\d+%\s*off)/gi, /(\$\d+[^<\.]{5,30})/gi],
      url: [/https?:\/\/[^\s"]+/gi],
    },
    priority: 2,
    apiConfig: {
      type: "algolia",
      endpoint: "https://hn.algolia.com/api/v1/search",
      authType: "none",
      rateLimitPerMinute: 100,
      timeoutMs: 8000,
      responseTransformer: "transformHackerNewsResponse",
    },
  },
  {
    name: "github",
    baseUrl: "https://github.com",
    searchPattern: "/search?q={query}+referral",
    extractionPatterns: {
      code: [/code[:\s`]+([A-Z0-9]{4,})/gi, /`([A-Z0-9_-]{6,})`/g],
      reward: [/(\$[\d,]+(?:\.\d{2})?)/g, /(\d+\s*(credits|tokens))/gi],
      url: [/https?:\/\/[^\s"]+/gi],
    },
    priority: 3,
    apiConfig: {
      type: "rest",
      endpoint: "https://api.github.com/search/repositories",
      authType: "token",
      authHeaderName: "Authorization",
      rateLimitPerMinute: 30,
      timeoutMs: 10000,
      responseTransformer: "transformGitHubResponse",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  },
];
