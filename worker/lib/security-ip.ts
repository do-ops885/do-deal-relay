/**
 * IP and CIDR Security Utilities
 *
 * Extracted from security.ts to keep file sizes under the 500-line limit.
 * Provides private-IP filtering, IP normalization, and CIDR matching
 * used by SSRF validation.
 *
 * @module worker/lib/security-ip
 */

export const SECURITY_CONSTANTS = {
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
    "::",
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
    "::/128",
    "fc00::/7",
    "fe80::/10",
    "ff00::/8",
  ] as const,
} as const;

export function isIpAddress(hostname: string): boolean {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4Pattern.test(hostname) || hostname.includes(":");
}

export function normalizeIp(ip: string): string {
  const normalized = ip.toLowerCase();
  const mappedMatch = normalized.match(
    /^(?:[0:]+(?:ffff:)?)((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/i,
  );
  if (mappedMatch?.[1]) {
    const inner = mappedMatch[1];
    if (inner.includes(".")) return inner;
    if (inner.includes(":")) {
      const parts = inner.split(":");
      const p0 = parts[0];
      const p1 = parts[1];
      if (parts.length === 2 && p0 !== undefined && p1 !== undefined) {
        const high = parseInt(p0, 16);
        const low = parseInt(p1, 16);
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

export function isPrivateIP(ip: string): boolean {
  const normalizedIp = normalizeIp(ip);
  for (const range of SECURITY_CONSTANTS.BLOCKED_IP_RANGES) {
    if (isIpInCidr(normalizedIp, range)) return true;
  }
  return false;
}

/** @internal */
export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const parts = cidr.split("/");
    const range = parts[0];
    const bitsStr = parts[1];
    if (!range) return false;
    if (!isIpAddress(ip)) return false;

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
  const p0 = parts[0] ?? 0;
  const p1 = parts[1] ?? 0;
  const p2 = parts[2] ?? 0;
  const p3 = parts[3] ?? 0;
  return ((p0 << 24) | (p1 << 16) | (p2 << 8) | p3) >>> 0;
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
