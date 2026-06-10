import { ReferralResearchResult } from "../../types";

export interface ResearchSource {
  name: string;
  baseUrl: string;
  searchPattern: string;
  extractionPatterns: {
    code: RegExp[];
    reward: RegExp[];
    url: RegExp[];
  };
  selectors?: {
    container: string;
    code: string;
    reward?: string;
    url?: string;
  };
  priority: number;
  apiConfig?: SourceApiConfig;
}

export interface SourceApiConfig {
  type: "graphql" | "rest" | "oauth" | "algolia" | "direct";
  endpoint: string;
  authType: "bearer" | "token" | "oauth2" | "none";
  authHeaderName?: string;
  rateLimitPerMinute: number;
  timeoutMs: number;
  responseTransformer: string;
  headers?: { [key: string]: string };
}

export interface RateLimitStatus {
  remaining: number;
  resetAt: number;
  used: number;
  limit: number;
}

export interface ResearchCacheEntry {
  query: string;
  source: string;
  results: ReferralResearchResult["discovered_codes"];
  timestamp: number;
  expiresAt: number;
}

export interface ProductHuntPost {
  id: string;
  name: string;
  tagline: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnail?: { url: string };
  topics?: { edges: Array<{ node: { name: string } }> };
  description?: string;
  website?: string;
}

export interface ProductHuntResponse {
  data?: {
    posts?: {
      edges: Array<{ node: ProductHuntPost }>;
    };
  };
  errors?: Array<{ message: string }>;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
  homepage: string | null;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}

export interface HackerNewsHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text: string | null;
  comment_text: string | null;
  _tags: string[];
}

export interface HackerNewsSearchResponse {
  hits: HackerNewsHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
  query: string;
  params: string;
}

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  is_self: boolean;
}

export interface RedditListingChild {
  kind: string;
  data: RedditPost;
}

export interface RedditListingResponse {
  kind: string;
  data: {
    after: string | null;
    before: string | null;
    children: RedditListingChild[];
    dist: number;
  };
}

export interface MetaTags {
  [key: string]: string;
}

export interface PageContentResult {
  url: string;
  title: string;
  description: string;
  textContent: string;
  links: Array<{ text: string; href: string }>;
  metaTags: MetaTags;
}

export interface ResearchConfig {
  productHuntToken?: string;
  githubToken?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  redditUsername?: string;
  redditPassword?: string;
  maxRequestsPerMinute: number;
  requestWindowMs: number;
  maxRetries: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  circuitBreakerEnabled: boolean;
  failureThreshold: number;
  recoveryTimeoutMs: number;
  sourceWeights: { [key: string]: number };
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: "closed" | "open" | "half-open";
  successCount: number;
}

export interface FetchResult {
  success: boolean;
  content: string;
  contentType: string;
  statusCode: number;
  error?: string;
  fetchDurationMs: number;
}

export interface ExtractedReferral {
  code: string;
  url: string;
  source: string;
  discoveredAt: string;
  rewardSummary?: string;
  confidence: number;
  context?: string;
}
