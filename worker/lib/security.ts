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
    "localhost",
    "127.0.0.1",
    "::1",
  ] as const,
  BLOCKED_IP_RANGES: [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
  ] as const,
} as const;

/**
 * Validates a URL for safe fetching, preventing SSRF attacks.
 * Checks for:
 * - HTTPS protocol only
 * - Blocked hostnames (metadata endpoints, localhost)
 * - Private/reserved IP addresses (including DNS resolution check)
 *
 * @param url - The URL to validate
 * @returns boolean indicating if the URL is safe to fetch
 */
export async function validateFetchUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);

    // Block non-HTTPS
    if (parsed.protocol !== "https:") {
      logger.warn(`SSRF Blocked: Non-HTTPS protocol detected: ${url}`, {
        component: "security",
        protocol: parsed.protocol,
        url,
      });
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block explicitly blocked hosts
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

    // Strip brackets from IPv6 hostnames for validation
    const cleanHostname =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    // Check if hostname is an IP literal
    if (isIpAddress(cleanHostname)) {
      if (isPrivateIP(cleanHostname)) {
        logger.warn(`SSRF Blocked: Private IP address detected: ${hostname}`, {
          component: "security",
          ip: hostname,
          url,
        });
        return false;
      }
    } else {
      // Perform DNS resolution check to prevent DNS rebinding
      const resolvedIps = await resolveHostname(hostname);
      if (resolvedIps.length === 0) return false;
      for (const ip of resolvedIps) {
        if (isPrivateIP(ip)) {
          logger.warn(
            `SSRF Blocked: Host ${hostname} resolved to private IP ${ip}`,
            {
              component: "security",
              hostname,
              ip,
              url,
            },
          );
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    logger.error(
      `SSRF Validation error for URL ${url}: ${(error as Error).message}`,
      {
        component: "security",
        url,
      },
    );
    return false;
  }
}

/**
 * Checks if a string is a valid IPv4 or IPv6 address.
 */
function isIpAddress(hostname: string): boolean {
  // Simple IPv4 regex
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // For IPv6, we check if it contains a colon as it's a hostname from a URL object
  return ipv4Pattern.test(hostname) || hostname.includes(":");
}

/**
 * Checks if an IP address belongs to a private or reserved range.
 */
function isPrivateIP(ip: string): boolean {
  for (const range of SECURITY_CONSTANTS.BLOCKED_IP_RANGES) {
    if (isIpInCidr(ip, range)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an IP address is within a CIDR range.
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const parts = cidr.split("/");
    const range = parts[0];
    const bitsStr = parts[1];

    if (!range) return false;

    const bits = bitsStr
      ? parseInt(bitsStr, 10)
      : range.includes(":")
        ? SECURITY_CONSTANTS.IPV6_BITS
        : SECURITY_CONSTANTS.IPV4_BITS;

    if (range.includes(":") && ip.includes(":")) {
      // IPv6 validation using BigInt
      const ipBigInt = ipv6ToBigInt(ip);
      const rangeBigInt = ipv6ToBigInt(range);

      const mask =
        bits === 0
          ? 0n
          : ((1n << BigInt(bits)) - 1n) <<
            BigInt(SECURITY_CONSTANTS.IPV6_BITS - bits);
      return (ipBigInt & mask) === (rangeBigInt & mask);
    } else if (!range.includes(":") && !ip.includes(":")) {
      const ipNum = ipToLong(ip);
      const rangeNum = ipToLong(range);
      const mask =
        bits === 0 ? 0 : (~0 << (SECURITY_CONSTANTS.IPV4_BITS - bits)) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Converts IPv4 address to long integer.
 */
function ipToLong(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== SECURITY_CONSTANTS.IPV4_PARTS) return 0;
  return (
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  );
}

/**
 * Converts IPv6 address to BigInt.
 */
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
 * Resolves a hostname to its IP addresses using Cloudflare DNS-over-HTTPS.
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/query?name=${hostname}&type=A`,
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
  } catch (error) {
    logger.error(
      `DNS resolution failed for ${hostname}: ${(error as Error).message}`,
      {
        component: "security",
        hostname,
      },
    );
    return [];
  }
}
