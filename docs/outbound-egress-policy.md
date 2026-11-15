# Outbound Egress Policy

## Threat model

URL validation and a later outbound connection are separate operations. A DNS
answer can change after validation, so a public answer observed by the Worker
does not pin the address selected by the native `fetch()` connection. Redirects
create the same risk for every new destination.

Cloudflare Workers' native `fetch()` does not expose a caller-controlled,
validated-IP pin. Its `cf.resolveOverride` option is limited to hosts in the
same Cloudflare zone and is not a general way to pin arbitrary Internet
destinations. Workers TCP sockets are not a supported replacement for HTTP
requests on ports 80 or 443.

## Enforcement boundary

Outbound requests through `validatedFetch()` require an exact hostname in the
operator-managed `OUTBOUND_EGRESS_ALLOWED_HOSTS` comma-separated setting. The
setting accepts DNS hostnames only: wildcards, IP literals, and malformed
entries are rejected. An unset or empty setting denies every outbound
destination. New webhook subscriptions are rejected unless the host is on the
configured list. Redirect destinations must independently pass the same
allowlist and existing blocked-address checks.

Only add hosts controlled by a trusted operator or partner. Do not add a
user-controlled hostname or a wildcard. This allowlist is an explicit trust
boundary, not connection pinning: if an approved hostname's DNS is attacker
controlled or can be rebound, do not allow it. Such destinations require an
approved egress proxy that enforces address policy at connection time.

Before enabling an outbound integration, add its exact host to
`OUTBOUND_EGRESS_ALLOWED_HOSTS` for every Wrangler environment that uses it.
Keep the list narrow and review changes as security-sensitive configuration.

## Validation coverage

`validateFetchUrl()` continues to reject blocked IPv4, IPv6, IPv4-mapped IPv6,
metadata hosts, and redirects that resolve to blocked address ranges. The
trusted-host boundary is separately tested for exact matching, fail-closed
defaults, and redirect destinations.
