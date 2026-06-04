/**
 * Security Utilities
 *
 * Provides protection against SSRF, XSS, and other common attack vectors.
 * Implements URL validation, IP filtering, and logging of security events.
 */

import { logger } from "./global-logger";

const SECURITY_CONSTANTS = {
  DNS_TIMEOUT_MS: 2000,
  IPV6_BITS: 128,
  IPV4_BITS: 32,
  IPV4_PARTS: 4,
  IPV4_PART_SHIFT: 8,
  IPV6_EXPANDED_PARTS: 8,
  BLOCKED_HOSTS: [
    "169.254.169.254",
    "metadata.google.internal",
    "169.254.170.2",
    "fd00:ec2::254",
    "metadata.openstack.local",
    "169.254.169.250",
    "100.100.100.200",
    "localhost",
    "127.0.0.1",
    "::1",
    "localhost.localdomain",
  ] as const,
  BLOCKED_IP_RANGES: [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "100.64.0.0/10",
    "192.0.0.0/24",
    "192.0.2.0/24",
    "198.18.0.0/15",
    "198.51.100.0/24",
    "203.0.113.0/24",
    "0.0.0.0/8",
    "224.0.0.0/4",
    "240.0.0.0/4",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
    "ff00::/8",
  ] as const,
} as const;

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
    logger.error(
      `SSRF Validation error for URL ${url}: ${(error as Error).message}`,
      { component: "security", url },
    );
    return false;
  }
}

function isIpAddress(hostname: string): boolean {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4Pattern.test(hostname) || hostname.includes(":");
}

function normalizeIp(ip: string): string {
  const normalized = ip.toLowerCase();
  const mappedMatch = normalized.match(/^(?:[0:]+:ffff:)(.+)$/);
  if (mappedMatch?.[1]) {
    const inner = mappedMatch[1];
    if (inner.includes(".")) return inner;
    if (inner.includes(":")) {
      const parts = inner.split(":");
      if (parts.length === 2) {
        const high = parseInt(parts[0]!, 16);
        const low = parseInt(parts[1]!, 16);
        return [
          (high >> 8) & 0xff,
          high & 0xff,
          (low >> 8) & 0xff,
          low & 0xff,
        ].join(".");
      }
    }
  }
  return normalized;
}

function isPrivateIP(ip: string): boolean {
  const normalizedIp = normalizeIp(ip);
  for (const range of SECURITY_CONSTANTS.BLOCKED_IP_RANGES) {
    if (isIpInCidr(normalizedIp, range)) return true;
  }
  return false;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const parts = cidr.split("/");
    const range = parts[0];
    const bitsStr = parts[1];
    if (!range) return false;
    const normalizedIp = normalizeIp(ip);
    const normalizedRange = normalizeIp(range);
    const ipIsV4 = !normalizedIp.includes(":");
    const rangeIsV4 = !normalizedRange.includes(":");
    if (ipIsV4 && rangeIsV4) {
      const ipNum = ipToLong(normalizedIp);
      const rangeNum = ipToLong(normalizedRange);
      const bitsNum = bitsStr ? Number(bitsStr) : 32;
      const mask = bitsNum === 0 ? 0 : ~(Math.pow(2, 32 - bitsNum) - 1) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    }
    if (!ipIsV4 && !rangeIsV4) {
      const ipBigInt = ipv6ToBigInt(normalizedIp);
      const rangeBigInt = ipv6ToBigInt(normalizedRange);
      const bitsNum = bitsStr ? Number(bitsStr) : 128;
      if (bitsNum === 0) return true;
      const mask =
        (BigInt(1) << BigInt(128)) - (BigInt(1) << BigInt(128 - bitsNum));
      return (ipBigInt & mask) === (rangeBigInt & mask);
    }
  } catch {
    return false;
  }
  return false;
}

function ipToLong(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== SECURITY_CONSTANTS.IPV4_PARTS) return 0;
  return (
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  );
}

function ipv6ToBigInt(ipv6: string): bigint {
  try {
    let parts: string[];
    if (ipv6.includes("::")) {
      const [leftStr, rightStr] = ipv6.split("::");
      const left = leftStr ? leftStr.split(":") : [];
      const right = rightStr ? rightStr.split(":") : [];
      const missing =
        SECURITY_CONSTANTS.IPV6_EXPANDED_PARTS - (left.length + right.length);
      parts = [...left, ...new Array(missing).fill("0"), ...right];
    } else {
      parts = ipv6.split(":");
    }
    if (parts.length !== SECURITY_CONSTANTS.IPV6_EXPANDED_PARTS) return 0n;
    const hex = parts.map((p) => (p || "0").padStart(4, "0")).join("");
    return BigInt("0x" + hex);
  } catch {
    return 0n;
  }
}

/**
 * Resolves a hostname to a list of IP addresses (IPv4 and IPv6).
 * Uses DNS-over-HTTPS (DoH) for secure resolution.
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    // Resolve both A and AAAA records in parallel
    const [ipv4, ipv6] = await Promise.all([
      fetchDns(hostname, "A"),
      fetchDns(hostname, "AAAA"),
    ]);

    return [...ipv4, ...ipv6];
  } catch (error) {
    logger.error(
      `DNS resolution failed for ${hostname}: ${(error as Error).message}`,
      { component: "security", hostname },
    );
    return [];
  }
}

/**
 * Helper to fetch DNS records of a specific type via DoH.
 */
async function fetchDns(
  hostname: string,
  type: "A" | "AAAA",
): Promise<string[]> {
  try {
    // Strict hostname validation to prevent parameter injection and satisfy security scans.
    // Hostnames must only contain alphanumeric characters, dots, and hyphens.
    // Also enforcing a maximum length of 253 characters (DNS standard).
    const hostnameRegex =
      /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
    if (!hostnameRegex.test(hostname)) {
      return [];
    }

    const params = new URLSearchParams({
      name: hostname,
      type: type,
    });

    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?${params.toString()}`,
      {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(SECURITY_CONSTANTS.DNS_TIMEOUT_MS),
      },
    );

    if (!response.ok) return [];

    const data = (await response.json()) as {
      Answer?: Array<{ data: string }>;
    };

    return data.Answer?.map((a) => a.data) || [];
  } catch {
    return [];
  }
}

/**
 * Validates a referral URL to prevent open redirects.
 * Ensures the URL uses HTTPS and its hostname matches the intended domain.
 */
export function validateReferralUrl(url: string, domain: string): boolean {
  try {
    const parsed = new URL(url);

    // 1. Enforce HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    // 2. Domain matching (normalized)
    const urlHostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const targetDomain = domain.toLowerCase().replace(/^www\./, "");

    if (urlHostname !== targetDomain) {
      return false;
    }

    // 3. Block common redirect bypasses in search params
    const suspiciousParams = ["redirect", "url", "next", "return", "callback"];
    for (const param of suspiciousParams) {
      if (parsed.searchParams.has(param)) {
        const val = parsed.searchParams.get(param);
        if (val && (val.includes("://") || val.startsWith("//"))) {
          // If it looks like a full URL, ensure it's on the same domain
          try {
            const nestedUrl = new URL(val);
            const nestedHostname = nestedUrl.hostname
              .toLowerCase()
              .replace(/^www\./, "");
            if (nestedHostname !== targetDomain) {
              return false;
            }
          } catch {
            // If it's not a valid URL but contains protocol markers, block it
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
