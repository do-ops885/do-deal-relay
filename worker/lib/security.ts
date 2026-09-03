/* eslint-disable */
/**
 * Security Utilities
 *
 * Provides protection against SSRF, XSS, and other common attack vectors.
 * Implements URL validation, IP filtering, and logging of security events.
 */

import { logger } from "./global-logger";
import { createTimeoutSignal } from "./utils";
import { toError } from "./sanitize-error";
import { SECURITY_CONSTANTS, isIpAddress, isPrivateIP } from "./security-ip";

export { isIpInCidr } from "./security-ip";

/**
 * TTL and size cap for the per-isolate DoH hostname cache. Successful
 * resolutions are cached so repeat validatedFetch calls to the same host do
 * not spend subrequests on duplicate DNS-over-HTTPS lookups.
 */
const SECURITY_DNS_CACHE_TTL_MS = 300_000;
const SECURITY_DNS_CACHE_MAX_ENTRIES = 500;

export function validateUrl(
  url: string,
  allowedDomains?: readonly string[],
): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (allowedDomains && allowedDomains.length > 0) {
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const allowed = allowedDomains.some(
        (d) => hostname === d.toLowerCase().replace(/^www\./, ""),
      );
      if (!allowed) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function validateFetchUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      logger.warn(`SSRF Blocked: Non-HTTPS protocol detected: ${url}`, {
        component: "security",
        protocol: parsed.protocol,
        url,
      });
      return false;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      (SECURITY_CONSTANTS.BLOCKED_HOSTS as readonly string[]).includes(hostname)
    ) {
      logger.warn(`SSRF Blocked: Prohibited host detected: ${hostname}`, {
        component: "security",
        hostname,
        url,
      });
      return false;
    }
    if (isIpAddress(hostname)) {
      if (isPrivateIP(hostname)) {
        logger.warn(`SSRF Blocked: Private IP address detected: ${hostname}`, {
          component: "security",
          ip: hostname,
          url,
        });
        return false;
      }
    } else {
      const resolvedIps = await resolveHostname(hostname);
      if (resolvedIps.length === 0) return false;
      for (const ip of resolvedIps) {
        if (isPrivateIP(ip)) {
          logger.warn(
            `SSRF Blocked: Host ${hostname} resolved to private IP ${ip}`,
            { component: "security", hostname, ip, url },
          );
          return false;
        }
      }
    }
    return true;
  } catch (error) {
    const err = toError(error);
    logger.error(`SSRF Validation error for URL ${url}: ${err.message}`, {
      component: "security",
      url,
    });
    return false;
  }
}

export async function validatedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!validateUrl(url)) {
    throw new Error("Invalid or disallowed URL");
  }

  if (!(await validateFetchUrl(url))) {
    throw new Error("SSRF Blocked: URL failed security validation");
  }

  // Merge redirect: manual to prevent unchecked redirect-follow SSRF bypass;
  // callers that need redirects should handle Location manually with re-validation.
  const safeInit: RequestInit = {
    ...init,
    redirect: "manual" as RequestRedirect,
  };
  // eslint-disable-next-line security/detect-object-injection
  const response = await fetch(url, safeInit);

  // If manual redirect, validate Location header before exposing it
  const location = response.headers?.get?.("Location") ?? null;
  if (location && response.status >= 300 && response.status < 400) {
    let redirectUrl: string;
    try {
      redirectUrl = new URL(location, url).toString();
    } catch {
      throw new Error("SSRF Blocked: invalid redirect Location");
    }
    if (!(await validateFetchUrl(redirectUrl))) {
      throw new Error(
        "SSRF Blocked: redirect target failed security validation",
      );
    }
  }

  return response;
}

interface DnsCacheEntry {
  ips: string[];
  expires: number;
}

const dnsCache = new Map<string, DnsCacheEntry>();

function evictDnsCacheOnInsert(): void {
  // Purge expired entries first, then evict oldest insertion until one slot
  // is free. Map preserves insertion order, so the first key is the oldest.
  if (dnsCache.size < SECURITY_DNS_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of dnsCache) {
    if (entry.expires <= now) {
      dnsCache.delete(key);
    }
  }
  while (dnsCache.size >= SECURITY_DNS_CACHE_MAX_ENTRIES) {
    const oldestKey = dnsCache.keys().next().value;
    if (oldestKey === undefined) return;
    dnsCache.delete(oldestKey);
  }
}

function getCachedDnsEntry(hostname: string): DnsCacheEntry | undefined {
  const entry = dnsCache.get(hostname);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    dnsCache.delete(hostname);
    return undefined;
  }
  // Delete+set refreshes recency, keeping hot hosts alive under eviction.
  dnsCache.delete(hostname);
  dnsCache.set(hostname, entry);
  return entry;
}

/**
 * Resolves a hostname to a list of IP addresses (IPv4 and IPv6).
 * Uses DNS-over-HTTPS (DoH) for secure resolution. Fully successful,
 * non-empty resolutions are cached for SECURITY_DNS_CACHE_TTL_MS; failures
 * and empty results stay uncached so they re-resolve on the next call.
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  const cached = getCachedDnsEntry(hostname);
  if (cached) return cached.ips;

  try {
    const [ipv4Result, ipv6Result] = await Promise.all([
      fetchDns(hostname, "A"),
      fetchDns(hostname, "AAAA"),
    ]);

    // Failed legs contribute no IPs, matching prior merge behavior.
    const ips = [...(ipv4Result ?? []), ...(ipv6Result ?? [])];

    // Only fully successful, non-empty resolutions are cacheable.
    if (ipv4Result && ipv6Result && ips.length > 0) {
      evictDnsCacheOnInsert();
      dnsCache.set(hostname, {
        ips,
        expires: Date.now() + SECURITY_DNS_CACHE_TTL_MS,
      });
    }

    return ips;
  } catch (error) {
    const err = toError(error);
    logger.error(`DNS resolution failed for ${hostname}: ${err.message}`, {
      component: "security",
      hostname,
    });
    return [];
  }
}

/**
 * Helper to fetch DNS records of a specific type via DoH. Returns null when
 * resolution fails (invalid name, HTTP error, network or timeout); an empty
 * array means the host legitimately has no records of that type.
 */
async function fetchDns(
  hostname: string,
  type: "A" | "AAAA",
): Promise<string[] | null> {
  try {
    // Strict hostname validation to prevent parameter injection and satisfy security scans.
    // Hostnames must only contain alphanumeric characters, dots, and hyphens.
    // Also enforcing a maximum length of 253 characters (DNS standard).
    const hostnameRegex =
      /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
    if (!hostnameRegex.test(hostname)) {
      return null;
    }

    const params = new URLSearchParams({
      name: hostname,
      type: type,
    });

    const { signal, cleanup } = createTimeoutSignal(
      SECURITY_CONSTANTS.DNS_TIMEOUT_MS,
    );

    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?${params.toString()}`,
      {
        headers: { accept: "application/dns-json" },
        signal,
      },
    );

    if (!response.ok) {
      cleanup();
      return null;
    }

    const data = (await response.json()) as {
      Answer?: Array<{ data: string }>;
    };

    cleanup();
    return data.Answer?.map((a) => a.data) || [];
  } catch {
    return null;
  }
}

// Matches C0 control characters (\x00-\x1f), DEL (\x7f), and common
// encoded variants (%00-%1f, %7f) that bypass naive string checks.
const DANGEROUS_CHARS_RE = /[\x00-\x1f\x7f]/;
const ENCODED_CONTROL_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7[fF])/i;
// %5c = backslash, %25 = double-encoding prefix
const ENCODED_BACKSLASH_RE = /%5[cC]/i;
const DOUBLE_ENCODING_RE = /%25(?:0[0-9a-f]|1[0-9a-f]|5[cC]|7[fF])/i;

function hasDangerousChars(url: string): boolean {
  return (
    DANGEROUS_CHARS_RE.test(url) ||
    ENCODED_CONTROL_RE.test(url) ||
    ENCODED_BACKSLASH_RE.test(url) ||
    DOUBLE_ENCODING_RE.test(url) ||
    url.includes("\\")
  );
}

/**
 * Validates a referral URL to prevent open redirects.
 * Ensures the URL uses HTTPS and its hostname matches the intended domain.
 * Rejects control characters, encoded bypasses, and UNC paths.
 */
export function validateReferralUrl(url: string, domain: string): boolean {
  try {
    if (hasDangerousChars(url)) {
      logger.warn("Referral URL rejected: dangerous characters detected", {
        component: "security",
        url,
        domain,
      });
      return false;
    }

    const parsed = new URL(url);

    // 1. Enforce HTTPS
    if (parsed.protocol !== "https:") {
      logger.warn("Referral URL rejected: non-HTTPS protocol", {
        component: "security",
        protocol: parsed.protocol,
        url,
        domain,
      });
      return false;
    }

    // 2. Domain matching (normalized)
    const urlHostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const targetDomain = domain.toLowerCase().replace(/^www\./, "");

    if (urlHostname !== targetDomain) {
      logger.warn("Referral URL rejected: domain mismatch", {
        component: "security",
        urlHostname,
        targetDomain,
        url,
      });
      return false;
    }

    // 3. Block common redirect bypasses in search params
    const suspiciousParams = ["redirect", "url", "next", "return", "callback"];
    for (const param of suspiciousParams) {
      if (parsed.searchParams.has(param)) {
        const val = parsed.searchParams.get(param);
        if (
          val &&
          (val.includes("://") || val.startsWith("//") || val.includes("\\"))
        ) {
          // If it looks like a full URL, ensure it's on the same domain
          try {
            const nestedUrl = new URL(val);
            const nestedHostname = nestedUrl.hostname
              .toLowerCase()
              .replace(/^www\./, "");
            if (nestedHostname !== targetDomain) {
              logger.warn(
                "Referral URL rejected: suspicious param points to external domain",
                {
                  component: "security",
                  param,
                  nestedHostname,
                  targetDomain,
                  url,
                },
              );
              return false;
            }
          } catch {
            // If it's not a valid URL but contains protocol markers, block it
            logger.warn(
              "Referral URL rejected: suspicious param contains unparseable URL",
              { component: "security", param, url },
            );
            return false;
          }
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}
