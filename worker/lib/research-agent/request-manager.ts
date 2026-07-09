import { CONFIG } from "../../config";
import { validatedFetch } from "../security";
import { logger } from "../global-logger";
import { createTimeoutSignal } from "../utils";

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
    const cacheKey = await this.buildCacheKey(url, options);
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
    try {
      const timeoutMs = options.timeoutMs ?? CONFIG.RESEARCH_FETCH_TIMEOUT_MS;
      const { signal, cleanup } = createTimeoutSignal(timeoutMs);
      try {
        const response = await validatedFetch(url, {
          method: options.method || "GET",
          headers: {
            "User-Agent": CONFIG.USER_AGENT,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            ...options.headers,
          },
          body: options.body,
          cf: options.cf,
          signal,
        });
        const contentType = response.headers.get("content-type") || "";
        const content = await response.text();
        return {
          success: true,
          content,
          contentType,
          statusCode: response.status,
          fetchDurationMs: Date.now() - startTime,
          cached: false,
        };
      } finally {
        cleanup();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 0,
        error: errorMessage,
        fetchDurationMs: Date.now() - startTime,
        cached: false,
      };
    }
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  private shouldRetry(statusCode: number): boolean {
    return [408, 429, 500, 502, 503, 504].includes(statusCode);
  }

  private calculateBackoff(attempt: number): number {
    const base = 100;
    const max = 5000;
    return Math.min(base * Math.pow(2, attempt - 1), max);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async checkRateLimit(domain: string): Promise<boolean> {
    try {
      const key = `${RATE_LIMIT_KEY_PREFIX}${domain}`;
      const raw = await this.kv.get(key);
      const entry: RateLimitEntry = raw ? JSON.parse(raw) : { timestamps: [] };
      const now = Date.now();
      const windowMs = CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      const recent = entry.timestamps.filter((t) => now - t < windowMs);
      return recent.length < CONFIG.RESEARCH_MAX_REQUESTS_PER_DOMAIN;
    } catch {
      return true;
    }
  }

  private async getRateLimitResetTime(domain: string): Promise<number> {
    try {
      const key = `${RATE_LIMIT_KEY_PREFIX}${domain}`;
      const raw = await this.kv.get(key);
      const entry: RateLimitEntry = raw ? JSON.parse(raw) : { timestamps: [] };
      const now = Date.now();
      const windowMs = CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      const oldest = Math.min(...entry.timestamps);
      return Math.max(0, oldest + windowMs - now);
    } catch {
      return 0;
    }
  }

  private async recordRateLimitHit(domain: string): Promise<void> {
    try {
      const key = `${RATE_LIMIT_KEY_PREFIX}${domain}`;
      const raw = await this.kv.get(key);
      const entry: RateLimitEntry = raw ? JSON.parse(raw) : { timestamps: [] };
      entry.timestamps.push(Date.now());
      const windowMs = CONFIG.RESEARCH_RATE_LIMIT_WINDOW_MS;
      await this.kv.put(key, JSON.stringify(entry), {
        expirationTtl: Math.ceil(windowMs / 1000),
      });
    } catch (err) {
      logger.warn("Research RequestManager: recordRateLimitHit failed", {
        component: "research-request-manager",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private cleanupInflight(): void {
    const now = Date.now();
    for (const [key, entry] of this.inflightRequests) {
      if (now - entry.createdAt > this.inflightTtlMs) {
        this.inflightRequests.delete(key);
      }
    }
  }

  private async buildCacheKey(
    url: string,
    options: FetchOptions,
  ): Promise<string> {
    const sortedHeaders = options.headers
      ? Object.entries(options.headers)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${v}`)
          .join("|")
      : "";
    let bodyHash = "";
    if (options.body) {
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(options.body),
      );
      bodyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
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
    this.inflightRequests.set(key, { promise, createdAt: Date.now() });
  }

  private async getCached(cacheKey: string): Promise<CacheEntry | null> {
    try {
      const raw = await this.kv.get(cacheKey);
      if (!raw) return null;
      const entry: CacheEntry = JSON.parse(raw);
      if (entry.expiresAt < Date.now()) {
        await this.kv.delete(cacheKey);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  private async setCache(cacheKey: string, entry: CacheEntry): Promise<void> {
    await this.kv.put(cacheKey, JSON.stringify(entry));
  }
}
