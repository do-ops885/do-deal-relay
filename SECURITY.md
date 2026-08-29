# Security Policy

## Supported Versions

Security fixes are applied to the latest release on the `main` branch only.

| Version | Supported |
| ------- | --------- |
| latest (`main`) | ✅ |
| older releases  | ❌ |

## Reporting a Vulnerability

**Do not report security vulnerabilities through public issues, pull requests,
or discussions.**

Use [GitHub Private Security Advisories][advisory] to report vulnerabilities
privately to the maintainers.

[advisory]: ../../security/advisories/new

### What to include

- A clear description of the vulnerability and its potential impact
- Affected file(s), component(s), or configuration(s)
- Step-by-step reproduction instructions or a proof-of-concept
- Suggested mitigations or patches, if available

### Response process

1. **Acknowledgement** — as soon as possible
2. **Assessment** — severity and scope evaluation with progress updates
3. **Fix & disclosure** — coordinated release and public advisory upon resolution

## Security Architecture & Controls

### HMAC-SHA256 Webhook Verification
- **Constant-Time Comparison**: Webhook and email webhook signature verifications utilize constant-time string comparisons (`timingSafeEqual`) to prevent timing side-channel attacks.
- **Zero Signature Leakage**: Verification failure results explicitly omit expected/computed HMAC signatures from error responses to prevent signature leakage.
- **Replay Protection**: Enforces timestamp tolerance validation (default: 300 seconds) against request timestamps.

### SSRF Protection
- **Host Resolution Validation**: All outgoing URL fetches in the discovery and validation pipelines undergo SSRF checks (`validateFetchUrl`) resolving underlying host IPs to block access to private/internal network ranges.

### Pipeline Security Gate (PEV Loop)
Autonomous discovery runs pass through a dedicated security gate (`runSecurityGate`) executing five automated checks prior to publication:
- **SSRF Protection**: Verifies URLs against blocked host lists and resolves hostnames via DNS-over-HTTPS (DoH) to block private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, etc.). Localhost is permitted only in non-production environments (`test` or `development`).
- **Credential Leakage Detection**: Scans deal payloads for secret exposure (passwords, API keys, bearer tokens, private keys, OpenAI keys).
- **Injection Defense**: Scans deal fields for SQL, NoSQL, XSS script injection, javascript URIs, and path traversal patterns (`../`).
- **URL Validation**: Ensures deal URLs use HTTPS, do not exceed 2,048 characters, and restrict port ranges to standard bounds.
- **Content Safety**: Detects malicious patterns (phishing, malware), fraudulent claims (guaranteed returns), and pyramid scheme language.

Any findings categorized as **Critical** or **High** severity automatically block deal publication until resolved.

### Access Control & Input Hardening
- **Role-Based Access Control (RBAC)**: Strict separation between `public`, `user`, and `admin` API tiers.
- **Input Hardening**: Rejection of control characters, null bytes, tabs, and open-redirect path patterns across URL and referral submission handlers.

## Scope

This policy covers the source code, workflows, scripts, and configuration files
in this repository. It does not cover vulnerabilities in third-party
dependencies or external services — please report those upstream.
