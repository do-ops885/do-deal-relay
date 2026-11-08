import { isIpAddress } from "./security-ip";

const TRUSTED_EGRESS_HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export class OutboundEgressPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundEgressPolicyError";
  }
}

/**
 * Parses the operator-managed, exact-host egress allowlist.
 * Wildcards, IP literals, and malformed entries are rejected.
 */
export function parseTrustedEgressHosts(
  configuredHosts: string | undefined,
): ReadonlySet<string> {
  if (configuredHosts === undefined || configuredHosts.trim() === "") {
    return new Set();
  }

  const hosts = configuredHosts
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ""));
  if (
    hosts.some(
      (host) =>
        !TRUSTED_EGRESS_HOSTNAME_RE.test(host) ||
        host.includes("*") ||
        isIpAddress(host),
    )
  ) {
    throw new OutboundEgressPolicyError(
      "Outbound egress host configuration must contain exact DNS hostnames",
    );
  }

  return new Set(hosts);
}

export function isTrustedEgressUrl(
  url: string,
  trustedHosts: ReadonlySet<string>,
): boolean {
  try {
    const hostname = new URL(url).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    return trustedHosts.has(hostname);
  } catch {
    return false;
  }
}
