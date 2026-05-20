import { CONFIG } from "../../config";
import { validateFetchUrl } from "../security";
import { logger } from "../global-logger";

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  cf?: Record<string, unknown>;
}

interface FetchResponse {
  success: boolean;
  content: string;
  contentType: string;
  statusCode: number;
  error?: string;
  fetchDurationMs: number;
  cached: boolean;
}

interface RateLimitEntry {
  timestamps: number[];
}

interface CacheEntry {
  content: string;
  contentType: string;
  statusCode: number;
  createdAt: number;
  expiresAt: number;
}

interface InflightEntry {
  promise: Promise<FetchResponse>;
  createdAt: number;
}

const CACHE_KEY_PREFIX = "rm:cache:";
const RATE_LIMIT_KEY_PREFIX = "rm:ratelimit:";
const INFLIGHT_CLEANUP_INTERVAL_MS = 60000;
const INFLIGHT_MAX_AGE_MS = 30000;

export class RequestManager {
  private readonly kv: KVNamespace;
  private readonly inflightRequests: Map<string, InflightEntry>;
  private cleanupTimer: ReturnType<typeof setInterval> | null;
  private readonly inflightTtlMs: number;

  constructor(kv: KVNamespace, inflightTtlMs: number = INFLIGHT_MAX_AGE_MS) {
    this.kv = kv;
    this.inflightRequests = new Map();
    this.cleanupTimer = null;
    this.inflightTtlMs = inflightTtlMs;
  }

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResponse> {
    const startTime = Date.now();
    const domain = this.extractDomain(url);
    const cacheKey = this.buildCacheKey(url, options);
    const inflightKey = `${cacheKey}:${domain}`;

    const cached = await this.getCached(cacheKey);
    if (cached) {
      return {
        success: true,
        content: cached.content,
        contentType: cached.contentType,
        statusCode: cached.statusCode,
        error: undefined,
        fetchDurationMs: Date.now() - startTime,
        cached: true,
      };
    }

    const inflight = this.getInflight(inflightKey);
    if (inflight) {
      return inflight;
    }

    const fetchPromise = this.executeWithRetry(
      url,
      options,
      startTime,
      domain,
      cacheKey,
    );
    this.setInflight(inflightKey, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.inflightRequests.delete(inflightKey);
    }
  }

  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupInflight();
    }, INFLIGHT_CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private async executeWithRetry(
    url: string,
    options: FetchOptions,
    startTime: number,
    domain: string,
    cacheKey: string,
  ): Promise<FetchResponse> {
    let lastError: string | undefined;
    let attempt = 0;
    const maxRetries = CONFIG.RESEARCH_MAX_RETRIES;

    while (attempt <= maxRetries) {
      attempt++;

      if (!(await this.checkRateLimit(domain))) {
        const waitTime = await this.getRateLimitResetTime(domain);
        lastError = `Rate limited for ${domain}, retry in ${Math.ceil(waitTime / 1000)}s`;
        if (attempt <= maxRetries) {
          await this.delay(
            Math.min(waitTime, CONFIG.RESEARCH_RETRY_MAX_DELAY_MS),
          );
        }
        continue;
      }

      const result = await this.executeSingleFetch(url, options, startTime);
      await this.recordRateLimitHit(domain);

      if (result.success) {
        const cacheTtl = CONFIG.RESEARCH_CACHE_TTL_SECONDS;
        await this.setCache(cacheKey, {
          content: result.content,
          contentType: result.contentType,
          statusCode: result.statusCode,
          createdAt: Date.now(),
          expiresAt: Date.now() + cacheTtl * 1000,
        });
        return result;
      }

      lastError = result.error;
      if (attempt <= maxRetries && this.shouldRetry(result.statusCode)) {
        const delayMs = this.calculateBackoff(attempt);
        await this.delay(delayMs);
      }
    }

    const totalDuration = Date.now() - startTime;
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: lastError || `Failed after ${maxRetries} retries`,
      fetchDurationMs: totalDuration,
      cached: false,
    };
  }

  private async executeSingleFetch(
    url: string,
    options: FetchOptions,
    startTime: number,
  ): Promise<FetchResponse> {
    if (!(await validateFetchUrl(url))) {
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 403,
        error: "Blocked by SSRF protection",
        fetchDurationMs: Date.now() - startTime,
        cached: false,
      };
    }

    try {
      const timeoutMs = options.timeoutMs ?? CONFIG.RESEARCH_FETCH_TIMEOUT_MS;

      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...options.headers,
        },
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs),
        cf: options.cf as Record<string, unknown> | undefined,
      });

      const fetchDurationMs = Date.now() - startTime;
      const contentType = response.headers.get("content-type") || "text/html";
      const content = await response.text();

      if (content.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
        return {
          success: false,
          content: "",
          contentType,
          statusCode: response.status,
          error: "Content exceeds size limit",
          fetchDurationMs,
          cached: false,
        };
      }

      return {
        success: response.ok,
        content,
        contentType,
        statusCode: response.status,
        error: response.ok
          ? undefined
          : `HTTP ${response.status}: ${response.statusText}`,
        fetchDurationMs,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 0,
        error: `Fetch error: ${(error as Error).message}`,
        fetchDurationMs: Date.now() - startTime,
        cached: false,
      };
    }
  }

  private async checkRateLimit(domain: string): Promise<boolean> {
    try {
      const key = `${RATE_LIMIT_KEY_PREFIX}${domain}`;
      const stored = await this.kv.get(key);
      if (!stored) return true;

      const entry: RateLimitEntry = JSON.parse(stored);
      const windowStart = Date.now() - CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      const recentTimestamps = entry.timestamps.filter((t) => t > windowStart);

      const limit = this.getDomainRateLimit(domain);
      return recentTimestamps.length < limit;
    } catch {
      return true;
    }
  }

  private async recordRateLimitHit(domain: string): Promise<void> {
    try {
      const key = `${RATE_LIMIT_KEY_PREFIX}${domain}`;
      const stored = await this.kv.get(key);
      const entry: RateLimitEntry = stored
        ? JSON.parse(stored)
        : { timestamps: [] };

      const windowStart = Date.now() - CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      entry.timestamps = [
        ...entry.timestamps.filter((t) => t > windowStart),
        Date.now(),
      ];

      await this.kv.put(key, JSON.stringify(entry), {
        expirationTtl:
          Math.ceil(CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS / 1000) + 60,
      });
    } catch {
      // Non-critical, allow request to proceed
    }
  }

  private async getRateLimitResetTime(domain: string): Promise<number> {
    try {
      const key = `${RATE_LIMIT_KEY_PREFIX}${domain}`;
      const stored = await this.kv.get(key);
      if (!stored) return 0;

      const entry: RateLimitEntry = JSON.parse(stored);
      const windowStart = Date.now() - CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      const sorted = [...entry.timestamps].sort((a, b) => a - b);
      const oldestInWindow = sorted.find((t) => t > windowStart);

      if (oldestInWindow === undefined) return 0;

      const resetTime = oldestInWindow + CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      return Math.max(0, resetTime - Date.now());
    } catch {
      return 0;
    }
  }

  private getDomainRateLimit(domain: string): number {
    const knownLimits: Record<string, number> = {
      "producthunt.com": 30,
      "api.producthunt.com": 30,
      "github.com": 30,
      "api.github.com": 30,
      "reddit.com": 60,
      "oauth.reddit.com": 60,
      "www.reddit.com": 60,
      "hn.algolia.com": 100,
      "news.ycombinator.com": 100,
      "trading212.com": 10,
      "revolut.com": 10,
      "wise.com": 10,
    };

    return knownLimits[domain] || 30;
  }

  private async getCached(key: string): Promise<CacheEntry | null> {
    try {
      const stored = await this.kv.get(key);
      if (!stored) return null;

      const entry: CacheEntry = JSON.parse(stored);
      if (entry.expiresAt > Date.now()) {
        return entry;
      }

      await this.kv.delete(key);
      return null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, entry: CacheEntry): Promise<void> {
    try {
      const ttlSeconds = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      if (ttlSeconds <= 0) return;

      await this.kv.put(key, JSON.stringify(entry), {
        expirationTtl: ttlSeconds,
      });
    } catch {
      // Non-critical
    }
  }

  private buildCacheKey(url: string, options: FetchOptions): string {
    const sortedHeaders = options.headers
      ? Object.entries(options.headers)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${v}`)
          .join("|")
      : "";
    const bodyHash = options.body
      ? Array.from(new TextEncoder().encode(options.body))
          .reduce((acc, b) => acc + b, 0)
          .toString(16)
      : "";
    return `${CACHE_KEY_PREFIX}${Buffer.from(`${url}|${options.method || "GET"}|${sortedHeaders}|${bodyHash}`).toString("base64url")}`;
  }

  private getInflight(key: string): Promise<FetchResponse> | null {
    const entry = this.inflightRequests.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.inflightTtlMs) {
      this.inflightRequests.delete(key);
      return null;
    }
    return entry.promise;
  }

  private setInflight(key: string, promise: Promise<FetchResponse>): void {
    this.inflightRequests.set(key, {
      promise,
      createdAt: Date.now(),
    });
  }

  private cleanupInflight(): void {
    const now = Date.now();
    for (const [key, entry] of this.inflightRequests.entries()) {
      if (now - entry.createdAt > this.inflightTtlMs) {
        this.inflightRequests.delete(key);
      }
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  }

  private shouldRetry(statusCode: number): boolean {
    if (statusCode >= 500 && statusCode <= 599) return true;
    if (statusCode === 429) return true;
    if (statusCode === 408) return true;
    return false;
  }

  private calculateBackoff(attempt: number): number {
    const base = CONFIG.RESEARCH_RETRY_BASE_DELAY_MS;
    const delay = base * Math.pow(2, attempt - 1);
    const jitter = Math.random() * base;
    return Math.min(delay + jitter, CONFIG.RESEARCH_RETRY_MAX_DELAY_MS);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
