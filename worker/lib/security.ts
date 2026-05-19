import { CONFIG } from "../config";
import { logger } from "./global-logger";

export async function validateFetchUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      logger.warn(`SSRF Blocked: Non-HTTPS protocol: ${url}`);
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    const config = CONFIG as any;
    const blockedHosts = config.BLOCKED_HOSTS || [
      "169.254.169.254",
      "metadata.google.internal",
      "localhost",
      "127.0.0.1",
      "::1",
    ];
    if (blockedHosts.includes(hostname)) {
      logger.warn(`SSRF Blocked: Prohibited host: ${hostname}`);
      return false;
    }
    const cleanHostname =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
    if (isIpAddress(cleanHostname)) {
      if (isPrivateIP(cleanHostname)) return false;
    } else {
      const resolvedIps = await resolveHostname(hostname);
      if (resolvedIps.length === 0) return true;
      for (const ip of resolvedIps) {
        if (isPrivateIP(ip)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function isIpAddress(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function isPrivateIP(ip: string): boolean {
  const config = CONFIG as any;
  const blockedRanges = config.BLOCKED_IP_RANGES || [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
  ];
  for (const range of blockedRanges) {
    if (isIpInCidr(ip, range)) return true;
  }
  return false;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bitsStr] = cidr.split("/");
    if (!range || !ip) return false;
    const isIpV6 = ip.includes(":");
    const isRangeV6 = range.includes(":");
    if (isIpV6 !== isRangeV6) return false;
    if (isIpV6) {
      const ipLower = ip.toLowerCase();
      if (cidr === "::1/128")
        return ipLower === "::1" || ipLower === "0:0:0:0:0:0:0:1";
      if (cidr === "fc00::/7")
        return ipLower.startsWith("fc") || ipLower.startsWith("fd");
      if (cidr === "fe80::/10")
        return ipLower.startsWith("fe8") || ipLower.startsWith("fe9");
      return ipLower.startsWith(range.toLowerCase());
    } else {
      const bits = bitsStr ? parseInt(bitsStr, 10) : 32;
      const ipNum = ipToLong(ip);
      const rangeNum = ipToLong(range);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    }
  } catch {
    return false;
  }
}

function ipToLong(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  return (
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  );
}

async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    // URL-encode the hostname to prevent SSRF via injected query parameters
    const encodedHostname = encodeURIComponent(hostname);
    const response = await fetch(
      `https://cloudflare-dns.com/query?name=${encodedHostname}&type=A`,
      {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as any;
    return data.Answer?.map((a: any) => a.data) || [];
  } catch {
    return [];
  }
}
