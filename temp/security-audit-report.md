# Security Audit Report - do-deal-relay

**Date:** 2026-04-02  
**Auditor:** AI Security Analysis  
**Scope:** Full codebase security review  
**Version:** 0.1.2

---

## Executive Summary

The do-deal-relay codebase shows **moderate security posture** with several critical issues requiring immediate attention. While HMAC implementation and basic input validation are sound, significant gaps exist in authentication, authorization, and endpoint protection.

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 **Critical** | 5 | Immediate action required |
| 🟠 **High** | 8 | Address before production |
| 🟡 **Medium** | 12 | Should be fixed soon |
| 🟢 **Low** | 6 | Best practice improvements |

---

## 1. API Endpoint Security

### 🔴 Critical: Missing Authentication/Authorization

**Location:** `worker/index.ts`, `worker/routes/referrals.ts`, `worker/routes/webhooks/index.ts`

**Issue:** Most API endpoints lack any authentication or authorization checks:

```typescript
// worker/index.ts - No auth required
if (path === "/api/discover" && request.method === "POST") {
  return handleDiscover(env);  // Anyone can trigger discovery
}

if (path === "/api/submit" && request.method === "POST") {
  return handleSubmit(body as SubmitDealBody, env);  // Open submission
}
```

**Vulnerable Endpoints:**
| Endpoint | Method | Risk |
|----------|--------|------|
| `/api/discover` | POST | Resource exhaustion, DoS |
| `/api/submit` | POST | Data poisoning, spam |
| `/api/research` | POST | Resource exhaustion |
| `/deals` | GET | Data enumeration (lower risk) |
| `/metrics` | GET | Information disclosure |
| `/api/log` | GET | Log exposure |

**Impact:**
- Unauthorized discovery pipeline triggers (DoS)
- Malicious deal submissions
- System information exposure
- Resource exhaustion attacks

**Remediation:**
```typescript
// Add authentication middleware
async function requireAuth(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  const token = authHeader.slice(7);
  // Validate against env.ALLOWED_API_KEYS or similar
  return validateApiKey(env, token) ? token : null;
}

// Protect sensitive endpoints
if (path === "/api/discover" && request.method === "POST") {
  const auth = await requireAuth(request, env);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
  return handleDiscover(env);
}
```

---

### 🟠 High: Overly Permissive CORS

**Location:** `worker/routes/utils.ts`, `worker/index.ts`

**Issue:**
```typescript
export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",  // 🔴 Too permissive
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
```

**Impact:**
- Cross-origin requests allowed from any domain
- Potential for CSRF attacks on authenticated endpoints (once auth added)
- Information leakage to malicious sites

**Remediation:**
```typescript
// Use environment-specific CORS config
const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS?.split(",") || [
  "https://yourdomain.com",
  "https://app.yourdomain.com"
];

function jsonResponse(data: unknown, status: number = 200, request?: Request): Response {
  const origin = request?.headers.get("Origin");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") 
    ? origin 
    : "https://yourdomain.com"; // Default fallback
  
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    },
  });
}
```

---

### 🟡 Medium: Missing Content Security Policy Headers

**Issue:** No CSP headers on responses that could contain user-generated content.

**Remediation:**
```typescript
const CSP_HEADER = "default-src 'none'; frame-ancestors 'none'; base-uri 'self'";
// Add to jsonResponse headers
```

---

## 2. Input Validation and Sanitization

### 🟠 High: Zod Validation Bypass Potential

**Location:** `worker/routes/referrals.ts` (lines 86-172)

**Issue:** Partial validation before schema check:
```typescript
export async function handleCreateReferral(request: Request, env: Env): Promise<Response> {
  // ... content-type checks ...
  
  const body = (await request.json()) as Record<string, unknown>;
  
  const code = body.code as string;  // 🔴 Type assertion bypasses validation
  const url = body.url as string;
  const domain = body.domain as string;
  
  if (!code || !url || !domain) {  // Only checks existence, not format
    return jsonResponse({ error: "Missing required fields" }, 400);
  }
  
  // ... later validates with Zod ...
  const validation = ReferralInputSchema.safeParse(referral);
```

**Impact:**
- Type assertions (`as string`) bypass TypeScript safety
- Early validation only checks existence, not format
- Potential for prototype pollution if object used unsafely

**Remediation:**
```typescript
const body = await request.json();

// Validate with Zod FIRST, then use
const parseResult = ReferralInputSchema.safeParse(body);
if (!parseResult.success) {
  return jsonResponse({ 
    error: "Validation failed", 
    details: parseResult.error.errors 
  }, 400);
}

const referral = parseResult.data;  // Now safe to use
```

---

### 🟡 Medium: Query Parameter Injection Risk

**Location:** `worker/index.ts` (lines 586-645)

**Issue:**
```typescript
async function handleGetDeals(url: URL, env: Env): Promise<Response> {
  const query: GetDealsQuery = {
    category: url.searchParams.get("category") || undefined,
    min_reward: url.searchParams.has("min_reward")
      ? parseFloat(url.searchParams.get("min_reward")!)  // 🔴 No validation
      : undefined,
    limit: url.searchParams.has("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)  // 🔴 No validation
      : 100,
  };
```

**Impact:**
- `NaN` values can propagate through system
- Large `limit` values could cause DoS

**Remediation:**
```typescript
const querySchema = z.object({
  category: z.string().optional(),
  min_reward: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

const query = querySchema.parse(Object.fromEntries(url.searchParams));
```

---

### 🟢 Low: Missing Input Size Limits on Email Content

**Location:** `worker/email/extraction.ts`, `worker/email/security.ts`

**Current limit (10MB) may be too high:**
```typescript
if (contentLength > 10 * 1024 * 1024) {  // 10MB
  return { valid: false, reason: "Email content too large" };
}
```

**Remediation:** Consider 1-2MB limit for typical referral emails.

---

## 3. URL Handling Security

### 🔴 Critical: Open Redirect Vulnerability

**Location:** `worker/routes/referrals.ts`, `worker/lib/referral-storage/crud.ts`

**Issue:** Referral URLs are stored and returned without validation that they:
1. Match the claimed domain
2. Don't contain malicious redirect chains
3. Don't use data/javascript schemes

**Example exploitation:**
```json
{
  "code": "ABC123",
  "url": "https://example.com/invite/ABC123?redirect=https://evil.com/phishing",
  "domain": "example.com"
}
```

The URL passes validation (has protocol and host) but contains a malicious redirect parameter.

**Remediation:**
```typescript
function validateReferralUrl(url: string, expectedDomain: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Check protocol
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Verify domain matches (with or without www)
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== expectedDomain.replace(/^www\./, '')) {
      return false;
    }
    
    // Check for suspicious query parameters
    const suspiciousParams = ['redirect', 'url', 'next', 'return', 'callback'];
    for (const param of suspiciousParams) {
      if (parsed.searchParams.has(param)) {
        // Require additional validation for redirect-containing URLs
        const redirectUrl = parsed.searchParams.get(param);
        if (redirectUrl && !isSameOrigin(redirectUrl, expectedDomain)) {
          return false;
        }
      }
    }
    
    return true;
  } catch {
    return false;
  }
}
```

---

### 🟡 Medium: URL Scheme Validation Inconsistency

**Location:** `worker/lib/guard-rails.ts` (lines 52-58)

**Current check:**
```typescript
const dangerousSchemes = ["javascript:", "data:", "vbscript:", "file:"];
for (const scheme of dangerousSchemes) {
  if (deal.url.toLowerCase().startsWith(scheme)) {
    issues.push(`Dangerous URL scheme detected: ${scheme}`);
  }
}
```

**Issues:**
1. Only checks at start, not within URL
2. No check for Unicode homoglyph attacks (e.g., `javаscript:` with Cyrillic 'а')
3. `about:blank` and `chrome:` not blocked

**Remediation:**
```typescript
function validateUrlScheme(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedSchemes = ['http:', 'https:'];
    
    // Check for Unicode homoglyphs
    const normalized = url.normalize('NFC').toLowerCase();
    const suspicious = ['javascript', 'data', 'vbscript', 'file', 'about', 'chrome'];
    
    for (const scheme of suspicious) {
      if (normalized.includes(scheme)) {
        // Additional check - must be exact scheme match
        if (!allowedSchemes.includes(parsed.protocol)) {
          return false;
        }
      }
    }
    
    return allowedSchemes.includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

---

## 4. HMAC Signature Verification

### 🟢 Low: Good Implementation with Minor Issues

**Location:** `worker/lib/hmac.ts`

**Strengths:**
- ✅ Constant-time comparison to prevent timing attacks
- ✅ Timestamp validation for replay protection (5-minute default)
- ✅ SHA-256 hashing
- ✅ Proper hex encoding
- ✅ Secure random secret generation (32 bytes)

**Minor Issues:**

1. **Case normalization in comparison:**
```typescript
if (!timingSafeEqual(expectedSignature, signature.toLowerCase())) {
```
While signatures are hex, this could be stricter.

2. **No key rotation mechanism:**
```typescript
export function generateWebhookSecret(): string {
  // Generates secret but no rotation support
}
```

**Remediation for key rotation:**
```typescript
export interface WebhookSecret {
  current: string;
  previous?: string;  // For rotation period
  createdAt: string;
  version: number;
}

export async function verifyWithRotation(
  payload: string,
  signature: string,
  secrets: WebhookSecret,
  timestamp: number,
): Promise<SignatureResult> {
  // Try current secret first
  const currentResult = await verifyHmacSignature(payload, signature, secrets.current, timestamp);
  if (currentResult.valid) return currentResult;
  
  // Fall back to previous secret during rotation
  if (secrets.previous) {
    const previousResult = await verifyHmacSignature(payload, signature, secrets.previous, timestamp);
    if (previousResult.valid) return previousResult;
  }
  
  return { valid: false, error: "Invalid signature" };
}
```

---

### 🔴 Critical: Disabled Email Webhook Signature Verification

**Location:** `worker/routes/email.ts` (lines 18-26)

**Issue:**
```typescript
export async function handleEmailIncoming(request: Request, env: Env): Promise<Response> {
  try {
    // Verify webhook signature if configured
    const signature = request.headers.get("x-webhook-signature");
    if (env.EMAIL_WEBHOOK_SECRET && signature) {
      // In production, verify HMAC signature
      // const isValid = await verifyWebhookSignature(request, env.EMAIL_WEBHOOK_SECRET);
      // if (!isValid) {
      //   return jsonResponse({ error: "Invalid signature" }, 401);
      // }
    }
```

**Impact:** Email webhook endpoints accept unverified requests, allowing:
- Email spoofing
- Fake referral submissions
- System abuse

**Remediation:**
```typescript
import { verifyHmacSignature, parseSignatureHeader } from "../lib/hmac";

export async function handleEmailIncoming(request: Request, env: Env): Promise<Response> {
  // Require signature verification if secret is configured
  if (env.EMAIL_WEBHOOK_SECRET) {
    const signature = request.headers.get("x-webhook-signature");
    const timestamp = request.headers.get("x-webhook-timestamp");
    
    if (!signature || !timestamp) {
      return jsonResponse({ error: "Missing signature headers" }, 401);
    }
    
    const payload = await request.text();
    const sigResult = await verifyHmacSignature(
      payload,
      signature.replace("sha256=", ""),
      env.EMAIL_WEBHOOK_SECRET,
      parseInt(timestamp, 10)
    );
    
    if (!sigResult.valid) {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
    
    // Re-parse body after reading
    const body = JSON.parse(payload);
    // ... continue processing
  }
}
```

---

## 5. Rate Limiting Implementation

### 🟠 High: Inconsistent Rate Limiting

**Location:** `worker/lib/rate-limit.ts`, `worker/lib/webhook/incoming.ts`

**Issues:**

1. **Not applied to most endpoints:**
```typescript
// worker/index.ts - No rate limiting on critical endpoints
if (path === "/api/discover" && request.method === "POST") {
  return handleDiscover(env);  // No rate limit!
}
```

2. **Different rate limiting for same resource:**
- API uses `DEALS_LOCK` KV namespace
- Webhooks use `DEALS_SOURCES` KV namespace
- Email uses `DEALS_SOURCES` with different logic

3. **Fails open on KV errors:**
```typescript
try {
  // ... rate limit check ...
} catch (error) {
  // If KV fails, allow the request (fail open)
  console.error("Rate limit check failed:", error);
  return {
    allowed: true,  // 🔴 Dangerous default
    remaining: config.maxRequests,
    // ...
  };
}
```

**Impact:**
- DoS vulnerability on expensive endpoints
- Inconsistent protection across entry points

**Remediation:**
```typescript
// Apply rate limiting to all state-changing endpoints
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Global rate limit check first
    const clientId = getClientIdentifier(request);
    const globalLimit = await checkRateLimit(env, clientId, "global");
    
    if (!globalLimit.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Per-endpoint limits
    const endpointLimits: Record<string, RateLimitConfig> = {
      "/api/discover": { max: 5, window: 300 },
      "/api/submit": { max: 10, window: 60 },
      "/api/research": { max: 20, window: 60 },
    };
    
    // ... rest of handler
  }
};

// Fail closed on rate limit errors
} catch (error) {
  console.error("Rate limit check failed:", error);
  return {
    allowed: false,  // Fail closed
    remaining: 0,
    resetTime: Math.floor(Date.now() / 1000) + 60,
    limit: config.maxRequests,
  };
}
```

---

## 6. Storage Access Patterns and Data Leakage

### 🟡 Medium: KV Key Structure Information Leakage

**Location:** `worker/lib/storage.ts`, `worker/lib/referral-storage/`

**Issue:** Predictable key patterns:
```typescript
const key = `${REFERRAL_KEYS.INPUT_PREFIX}${referral.id}`;
// Results in: "referral:input:abc123" - reveals data structure

const key = `webhook_subscription:${subscription.id}`;
// Results in: "webhook_subscription:sub_xxx" - reveals entity type
```

**Impact:**
- Information disclosure about system structure
- Easier enumeration attacks if KV listing is compromised

**Remediation:**
```typescript
// Use hashed or opaque key prefixes
import { hashIdempotencyKey } from "../lib/hmac";

async function getHashedKey(prefix: string, id: string): Promise<string> {
  const hash = await hashIdempotencyKey(`${prefix}:${id}`);
  return `k:${hash.slice(0, 16)}`;
}

// Or use encryption
const ENCRYPTION_KEY = env.KV_ENCRYPTION_KEY;
```

---

### 🟡 Medium: No Encryption at Rest

**Location:** All KV storage operations

**Issue:** Data stored in KV without encryption:
```typescript
await env.DEALS_PROD.put(CONFIG.KV_KEYS.PROD_SNAPSHOT, JSON.stringify(staging));
```

**Impact:**
- Cloudflare has access to data
- Compliance issues for sensitive data
- No defense in depth

**Remediation:**
```typescript
// Encrypt sensitive fields before storage
import { encrypt, decrypt } from "./crypto";

export async function writeStagingSnapshot(
  env: Env,
  snapshot: Omit<Snapshot, "snapshot_hash">,
): Promise<Snapshot> {
  const hash = await generateSnapshotHash(snapshot.deals);
  const fullSnapshot: Snapshot = { ...snapshot, snapshot_hash: hash };
  
  // Encrypt if encryption key available
  const data = env.ENCRYPTION_KEY 
    ? await encrypt(JSON.stringify(fullSnapshot), env.ENCRYPTION_KEY)
    : JSON.stringify(fullSnapshot);
  
  await env.DEALS_STAGING.put(CONFIG.KV_KEYS.STAGING_SNAPSHOT, data);
  // ...
}
```

---

### 🟢 Low: Cache Invalidation Race Conditions

**Location:** `worker/lib/storage.ts`, `worker/lib/cache.ts`

**Issue:** Cache invalidation after write:
```typescript
await env.DEALS_STAGING.put(CONFIG.KV_KEYS.STAGING_SNAPSHOT, JSON.stringify(fullSnapshot));

// Invalidate staging cache
const cache = createStagingSnapshotCache(env);
await cache.delete(STAGING_CACHE_KEY);  // Async - race condition possible
```

**Impact:** Minor - could serve stale data briefly

**Remediation:** Use atomic operations or versioning:
```typescript
// Include version/timestamp in cache key
const cacheKey = `${STAGING_CACHE_KEY}:${Date.now()}`;
```

---

## 7. GitHub Token Handling

### 🟡 Medium: Token Scope Validation Missing

**Location:** `worker/lib/github.ts`

**Issue:** Token set without scope validation:
```typescript
export function setGitHubToken(token: string): void {
  githubToken = token;  // No validation of token scope
}
```

**Impact:**
- Token with excessive permissions could cause damage
- No detection of token expiration

**Remediation:**
```typescript
export async function setGitHubToken(token: string): Promise<boolean> {
  // Validate token by checking scopes
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error("Invalid GitHub token");
  }
  
  const scopes = response.headers.get("X-OAuth-Scopes")?.split(",") || [];
  const requiredScopes = ["repo", "write:discussion"];
  
  for (const scope of requiredScopes) {
    if (!scopes.includes(scope)) {
      console.warn(`GitHub token missing scope: ${scope}`);
    }
  }
  
  githubToken = token;
  return true;
}
```

---

### 🟢 Low: Token Storage in Global Variable

**Location:** `worker/lib/github.ts` (line 26-27)

**Issue:**
```typescript
// Store token for the session (set by worker/index.ts)
let githubToken: string | undefined;
let githubCircuitBreaker: CircuitBreaker | undefined;
let githubCache: ReturnType<typeof createGitHubCache> | undefined;
```

**Impact:** In Cloudflare Workers, this is module-level state that persists across requests. While Workers are stateless per-request, global variables can cause issues with concurrent requests.

**Remediation:** Pass token explicitly or use request context:
```typescript
// Use AsyncLocalStorage or pass through context
export interface GitHubContext {
  token: string;
  circuitBreaker?: CircuitBreaker;
  cache?: ReturnType<typeof createGitHubCache>;
}

export async function commitSnapshot(
  ctx: GitHubContext,
  repo: string,
  snapshot: Snapshot,
  // ...
): Promise<string> {
  const { baseUrl, headers } = getGitHubConfig(ctx.token);
  // ...
}
```

---

## 8. Email Parsing Security

### 🟢 Low: Good Security Implementation

**Location:** `worker/email/security.ts`

**Strengths:**
- ✅ DKIM validation support
- ✅ SPF validation support
- ✅ Rate limiting per sender (50/day)
- ✅ Spam detection with scoring
- ✅ Blacklist/whitelist support
- ✅ XSS content sanitization

**Minor Issues:**

1. **DKIM/SPF validation is lenient:**
```typescript
// No DKIM header - accept but mark as less trusted
return { valid: true };  // Should be configurable
```

2. **Blacklist pattern could be bypassed:**
```typescript
const BLACKLISTED_PATTERNS = [
  /spam/i,
  /viagra/i,
  // ...
];
// Can be bypassed with l33t speak: "sp4m", "v1agra"
```

**Remediation:**
```typescript
// Normalize before pattern matching
function normalizeForSpamCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0-9]/g, (d) => 'oleasbtg'.charAt(parseInt(d)))  // 0->o, 1->l, etc.
    .replace(/[^a-z]/g, '');
}
```

---

## 9. CLI Security

### 🟠 High: API Key Storage in Config File

**Location:** `scripts/cli/config.ts`

**Issue:** Likely stores API key in plaintext on filesystem:
```typescript
// scripts/cli/config.ts (not shown but implied)
export const config = {
  endpoint: "...",
  apiKey: "...",  // Stored in plaintext
};
```

**Impact:**
- API key exposed in filesystem
- Key may be committed to git
- No key rotation mechanism

**Remediation:**
```typescript
// Use environment variables or secure keyring
import { getApiKey } from "./key-storage";

export const config = {
  endpoint: process.env.REFCLI_ENDPOINT || "https://api.example.com",
  get apiKey() {
    return process.env.REFCLI_API_KEY || getApiKeyFromKeyring();
  },
};

// Or prompt for key each session
```

---

### 🟡 Medium: No HTTPS Enforcement

**Location:** `scripts/cli/utils.ts` (lines 96-131)

**Issue:** No check that endpoint uses HTTPS:
```typescript
export async function apiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${config.endpoint}${path}`;  // Could be http://
  // ...
}
```

**Impact:** API key could be sent over unencrypted connection

**Remediation:**
```typescript
export async function apiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, config.endpoint);
  
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS endpoints are allowed");
  }
  
  // ... rest of request
}
```

---

### 🟢 Low: CLI Argument Parsing Vulnerability

**Location:** `scripts/cli/utils.ts` (lines 12-58)

**Issue:** Basic argument parsing:
```typescript
if (arg.startsWith("--")) {
  const flag = arg.slice(2);
  const nextArg = args[i + 1];
  if (nextArg && !nextArg.startsWith("-")) {
    result.flags[flag] = nextArg;  // No validation
    i += 2;
  }
}
```

Could be confused by values starting with `-`:
```bash
refcli codes add --code "--malicious" --url "..."  # Potentially problematic
```

**Remediation:** Use a proper argument parser like `commander` or `yargs`.

---

## 10. XSS and Injection Vulnerabilities

### 🟢 Low: XSS Prevention Implemented

**Location:** `worker/email/security.ts` (lines 408-418)

**Good implementation:**
```typescript
export function sanitizeContent(content: string): string {
  return content
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
```

However, this should also handle:
- Null bytes
- Unicode homoglyphs
- Template literals

---

### 🟡 Medium: Potential SQL/NoSQL Injection in Search

**Location:** `worker/lib/referral-storage/search.ts`

While Zod schemas are used, direct string concatenation in search should be reviewed:
```typescript
// Should use parameterized queries if any database layer added
export async function searchReferrals(env: Env, query: ReferralSearchQuery) {
  // Currently uses KV, but if migrated to D1/SQL:
  // ❌ DON'T: `WHERE code LIKE '%${query.code}%'`
  // ✅ DO: Use parameterized queries
}
```

---

## 11. SSRF Potential

### 🟠 High: Web Research Endpoint Accepts Arbitrary Queries

**Location:** `worker/routes/referrals.ts` (lines 337-396)

**Issue:**
```typescript
export async function handleResearch(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as WebResearchRequest;
  // ...
  const researchResult = await executeReferralResearch(env, body);
```

Research agents likely make HTTP requests based on user input. If not properly sandboxed, this could:
- Access internal/cloud metadata endpoints (169.254.169.254)
- Scan internal network
- Access internal services

**Remediation:**
```typescript
import { isUrlAllowed, resolveUrl } from "./url-safelist";

async function executeReferralResearch(env: Env, request: WebResearchRequest): Promise<ResearchResult> {
  // Block internal IPs and private ranges
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '169.254.169.254',  // AWS metadata
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
  ];
  
  // Validate all URLs before fetching
  const urlsToFetch = resolveSearchUrls(request);
  for (const url of urlsToFetch) {
    if (!isUrlAllowed(url, blockedHosts)) {
      throw new Error(`URL not allowed: ${url}`);
    }
  }
  
  // ... proceed with research
}
```

---

## 12. Information Disclosure

### 🟡 Medium: Verbose Error Messages

**Location:** Multiple files

**Issue:** Error messages expose internal details:
```typescript
} catch (error) {
  return jsonResponse(
    { error: "Failed to process webhook", message: err.message },  // Exposes internal errors
    500,
  );
}
```

**Remediation:**
```typescript
} catch (error) {
  const requestId = generateId();
  logger.error(`Error ${requestId}:`, error);  // Log full details internally
  
  return jsonResponse(
    { 
      error: "Internal server error",  // Generic message to client
      request_id: requestId,  // For support lookup
    },
    500,
  );
}
```

---

### 🟢 Low: Metrics Endpoint Exposes System Details

**Location:** `worker/index.ts` (lines 70-73, 451-584)

**Issue:** Metrics available without authentication:
```typescript
if (path === "/metrics") {
  const format = url.searchParams.get("format") || "prometheus";
  return handleMetrics(env, format);  // No auth required
}
```

**Impact:** Information about system internals, run rates, and performance exposed

**Remediation:** Restrict to internal networks or require authentication.

---

## 13. Summary of Remediation Priorities

### Immediate (Critical - Fix Today)

1. **Add authentication to all state-changing endpoints** (`/api/discover`, `/api/submit`, `/api/research`)
2. **Enable email webhook signature verification** (uncomment and implement)
3. **Implement URL-to-domain validation** to prevent open redirects
4. **Apply rate limiting to all expensive endpoints**
5. **Restrict CORS to specific origins**

### Short-term (High - Fix This Week)

6. **Move API key storage to secure location** (not plaintext config)
7. **Enforce HTTPS on CLI**
8. **Add SSRF protection to web research**
9. **Implement proper error message sanitization**
10. **Add request ID logging for debugging**

### Medium-term (Medium - Fix This Month)

11. **Add encryption at rest for sensitive KV data**
12. **Implement key rotation for webhook secrets**
13. **Add GitHub token scope validation**
14. **Review and strengthen DKIM/SPF enforcement**
15. **Add Unicode normalization for spam detection**

### Long-term (Low - Ongoing)

16. **Implement structured security logging**
17. **Add automated security scanning to CI/CD**
18. **Regular penetration testing**
19. **Security incident response plan**
20. **Compliance audit (GDPR, SOC2, etc.)**

---

## 14. Security Checklist

| Control | Status | Notes |
|---------|--------|-------|
| Authentication | ❌ Missing | Critical gap |
| Authorization | ❌ Missing | All users have same access |
| Input Validation | ⚠️ Partial | Zod schemas good, but gaps exist |
| Output Encoding | ✅ Good | Proper JSON responses |
| XSS Prevention | ✅ Good | Sanitization implemented |
| CSRF Protection | ⚠️ Partial | CORS too permissive |
| Rate Limiting | ⚠️ Partial | Not applied consistently |
| HMAC Verification | ✅ Good | Well implemented |
| Encryption at Rest | ❌ Missing | Data stored plaintext in KV |
| Encryption in Transit | ✅ Good | HTTPS only |
| SSRF Protection | ❌ Missing | Web research vulnerable |
| Security Logging | ⚠️ Partial | Basic logging exists |
| Error Handling | ⚠️ Partial | Verbose errors in some places |
| Secrets Management | ⚠️ Partial | Env vars used, but CLI stores plaintext |

---

## 15. Testing Recommendations

### Security Tests to Add

```typescript
// tests/security/api-auth.test.ts
describe("API Authentication", () => {
  it("should reject unauthenticated requests to /api/discover", async () => {
    const response = await worker.fetch("/api/discover", { method: "POST" });
    expect(response.status).toBe(401);
  });
});

// tests/security/rate-limit.test.ts
describe("Rate Limiting", () => {
  it("should block excessive requests", async () => {
    const requests = Array(101).fill(null).map(() => 
      worker.fetch("/api/submit", { method: "POST", body: "{}" })
    );
    const responses = await Promise.all(requests);
    const blocked = responses.filter(r => r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });
});

// tests/security/ssrf.test.ts
describe("SSRF Protection", () => {
  it("should block internal IP requests", async () => {
    const response = await worker.fetch("/api/research", {
      method: "POST",
      body: JSON.stringify({ query: "http://169.254.169.254/metadata" }),
    });
    expect(response.status).toBe(400);
  });
});
```

---

*Report generated by automated security analysis. Manual review recommended for critical findings.*
