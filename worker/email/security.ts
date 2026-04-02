import type { Env } from "../types";
import type { ParsedEmail, SecurityResult, RateLimitStatus } from "./types";

// ============================================================================
// Security Validation
// DKIM, SPF, Rate Limiting, Spam Detection
// ============================================================================

const SECURITY_CONFIG = {
  // Rate limits per sender per day
  MAX_EMAILS_PER_DAY: 50,
  RATE_LIMIT_WINDOW_HOURS: 24,

  // Spam score threshold (0-1, higher = more spam)
  SPAM_THRESHOLD: 0.7,

  // Whitelisted domains (bypass some checks)
  WHITELISTED_DOMAINS: [
    "gmail.com",
    "outlook.com",
    "yahoo.com",
    "icloud.com",
    "protonmail.com",
  ],

  // Blacklisted patterns (auto-reject)
  BLACKLISTED_PATTERNS: [
    /spam/i,
    /viagra/i,
    /lottery/i,
    /winner/i,
    / prince /i,
    /nigerian/i,
  ],
};

// ============================================================================
// Main Security Validator
// ============================================================================

/**
 * Validate email security (DKIM, SPF, rate limits, spam)
 */
export async function validateSecurity(
  email: ParsedEmail,
  env: Env,
): Promise<SecurityResult> {
  // 1. DKIM validation (if headers available)
  const dkimResult = validateDKIM(email);
  if (!dkimResult.valid) {
    return {
      valid: false,
      reason: `DKIM validation failed: ${dkimResult.reason}`,
      dkimValid: false,
    };
  }

  // 2. SPF validation (simplified)
  const spfResult = validateSPF(email);
  if (!spfResult.valid) {
    return {
      valid: false,
      reason: `SPF validation failed: ${spfResult.reason}`,
      spfValid: false,
    };
  }

  // 3. Rate limiting
  const rateLimitResult = await checkRateLimit(email.from, env);
  if (!rateLimitResult.allowed) {
    return {
      valid: false,
      reason: `Rate limit exceeded. Try again after ${rateLimitResult.resetAt.toISOString()}`,
    };
  }

  // 4. Spam detection
  const spamResult = detectSpam(email);
  if (spamResult.isSpam) {
    return {
      valid: false,
      reason: `Email flagged as spam: ${spamResult.reason}`,
      spamScore: spamResult.score,
    };
  }

  // 5. Content validation
  const contentResult = validateContent(email);
  if (!contentResult.valid) {
    return {
      valid: false,
      reason: contentResult.reason,
    };
  }

  return {
    valid: true,
    dkimValid: dkimResult.valid,
    spfValid: spfResult.valid,
    spamScore: spamResult.score,
  };
}

// ============================================================================
// DKIM Validation
// ============================================================================

interface DKIMResult {
  valid: boolean;
  reason?: string;
}

function validateDKIM(email: ParsedEmail): DKIMResult {
  // In Cloudflare Email Workers, DKIM is typically pre-validated
  // Here we check for DKIM-Signature header indicators

  if (email.dkimValid !== undefined) {
    return {
      valid: email.dkimValid,
      reason: email.dkimValid ? undefined : "DKIM signature invalid",
    };
  }

  // If we have headers, check for DKIM-Signature
  if (email.headers) {
    const dkimHeader =
      email.headers["dkim-signature"] || email.headers["DKIM-Signature"];
    if (dkimHeader) {
      // DKIM signature present - in production, verify cryptographically
      // For now, accept if present (Cloudflare handles verification)
      return { valid: true };
    }
  }

  // No DKIM header - accept but mark as less trusted
  // Many legitimate emails don't have DKIM
  return { valid: true };
}

// ============================================================================
// SPF Validation
// ============================================================================

interface SPFResult {
  valid: boolean;
  reason?: string;
}

function validateSPF(email: ParsedEmail): SPFResult {
  // In Cloudflare Email Workers, SPF is typically pre-validated
  // Check for SPF indicators in headers

  if (email.spfValid !== undefined) {
    return {
      valid: email.spfValid,
      reason: email.spfValid ? undefined : "SPF check failed",
    };
  }

  // If we have headers, check for SPF result
  if (email.headers) {
    const receivedSpf =
      email.headers["received-spf"] || email.headers["Received-SPF"];
    if (receivedSpf) {
      // SPF result present
      if (receivedSpf.toLowerCase().includes("pass")) {
        return { valid: true };
      }
      if (receivedSpf.toLowerCase().includes("fail")) {
        return { valid: false, reason: "SPF check failed" };
      }
    }
  }

  // No SPF info - accept but with lower trust
  return { valid: true };
}

// ============================================================================
// Rate Limiting
// ============================================================================

const RATE_LIMIT_PREFIX = "email_ratelimit:";

async function checkRateLimit(
  sender: string,
  env: Env,
): Promise<RateLimitStatus> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(
    windowStart.getHours() - SECURITY_CONFIG.RATE_LIMIT_WINDOW_HOURS,
  );

  const key = `${RATE_LIMIT_PREFIX}${sender}:${now.toISOString().split("T")[0]}`;

  // Get current count
  const currentCount = await env.DEALS_SOURCES.get(key);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  // Calculate reset time
  const resetAt = new Date(now);
  resetAt.setDate(resetAt.getDate() + 1);
  resetAt.setHours(0, 0, 0, 0);

  if (count >= SECURITY_CONFIG.MAX_EMAILS_PER_DAY) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Increment counter
  const newCount = count + 1;
  const ttlSeconds = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);

  await env.DEALS_SOURCES.put(key, newCount.toString(), {
    expirationTtl: ttlSeconds,
  });

  return {
    allowed: true,
    remaining: SECURITY_CONFIG.MAX_EMAILS_PER_DAY - newCount,
    resetAt,
  };
}

// ============================================================================
// Spam Detection
// ============================================================================

interface SpamResult {
  isSpam: boolean;
  score: number;
  reason?: string;
}

function detectSpam(email: ParsedEmail): SpamResult {
  let score = 0;
  const reasons: string[] = [];

  const subject = email.subject.toLowerCase();
  const text = (email.text || "").toLowerCase();
  const combined = subject + " " + text;

  // Check blacklisted patterns
  for (const pattern of SECURITY_CONFIG.BLACKLISTED_PATTERNS) {
    if (pattern.test(combined)) {
      score += 0.3;
      reasons.push(`Blacklisted pattern: ${pattern.source}`);
    }
  }

  // Check for excessive caps in subject
  const capsRatio =
    (email.subject.match(/[A-Z]/g) || []).length / email.subject.length;
  if (capsRatio > 0.7 && email.subject.length > 10) {
    score += 0.2;
    reasons.push("Excessive caps in subject");
  }

  // Check for excessive exclamation marks
  const exclamationCount = (combined.match(/!/g) || []).length;
  if (exclamationCount > 5) {
    score += 0.15;
    reasons.push("Excessive exclamation marks");
  }

  // Check for suspicious URLs
  const suspiciousUrlPatterns = [
    /bit\.ly/i,
    /tinyurl/i,
    /t\.co\/[^\/]+$/i, // Short t.co without path
  ];
  for (const pattern of suspiciousUrlPatterns) {
    if (pattern.test(combined)) {
      score += 0.1;
      reasons.push("Suspicious URL shortener detected");
    }
  }

  // Check for HTML-only (no text)
  if (email.html && !email.text) {
    score += 0.1;
    reasons.push("HTML-only email");
  }

  // Check sender domain reputation
  const senderDomain = email.from.split("@")[1]?.toLowerCase();
  if (senderDomain) {
    // Check for suspicious sender patterns
    if (/\d{5,}/.test(senderDomain)) {
      score += 0.2;
      reasons.push("Suspicious sender domain");
    }
  }

  const isSpam = score >= SECURITY_CONFIG.SPAM_THRESHOLD;

  return {
    isSpam,
    score: Math.min(score, 1),
    reason: isSpam ? reasons.join("; ") : undefined,
  };
}

// ============================================================================
// Content Validation
// ============================================================================

interface ContentResult {
  valid: boolean;
  reason?: string;
}

function validateContent(email: ParsedEmail): ContentResult {
  // Check for empty content
  if (!email.text && !email.html) {
    return {
      valid: false,
      reason: "Email has no content",
    };
  }

  // Check for minimum content length
  const contentLength = (email.text || "").length + (email.html || "").length;
  if (contentLength < 50) {
    return {
      valid: false,
      reason: "Email content too short",
    };
  }

  // Check for maximum content length (prevent abuse)
  if (contentLength > 10 * 1024 * 1024) {
    // 10MB
    return {
      valid: false,
      reason: "Email content too large",
    };
  }

  // Validate sender email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.from)) {
    return {
      valid: false,
      reason: "Invalid sender email format",
    };
  }

  return { valid: true };
}

// ============================================================================
// Sender Whitelist/Blacklist
// ============================================================================

/**
 * Check if sender is in whitelist
 */
export function isWhitelisted(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;

  return SECURITY_CONFIG.WHITELISTED_DOMAINS.some(
    (whitelisted) =>
      domain === whitelisted || domain.endsWith(`.${whitelisted}`),
  );
}

/**
 * Check if sender is blacklisted
 */
export async function isBlacklisted(
  email: string,
  env: Env,
): Promise<{ blacklisted: boolean; reason?: string }> {
  // Check KV for blacklisted senders
  const blacklistKey = `email_blacklist:${email.toLowerCase()}`;
  const entry = await env.DEALS_SOURCES.get(blacklistKey);

  if (entry) {
    return { blacklisted: true, reason: entry };
  }

  // Check domain blacklist
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain) {
    const domainBlacklistKey = `email_blacklist_domain:${domain}`;
    const domainEntry = await env.DEALS_SOURCES.get(domainBlacklistKey);
    if (domainEntry) {
      return {
        blacklisted: true,
        reason: `Domain blacklisted: ${domainEntry}`,
      };
    }
  }

  return { blacklisted: false };
}

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Sanitize email content to prevent XSS
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Extract sender domain
 */
export function getSenderDomain(email: string): string | null {
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check for suspicious patterns in email
 */
export function checkSuspiciousPatterns(email: ParsedEmail): string[] {
  const warnings: string[] = [];
  const combined = (email.subject + " " + (email.text || "")).toLowerCase();

  // Check for urgency tactics
  if (/urgent|act now|limited time|expires? today/i.test(combined)) {
    warnings.push("Urgency language detected");
  }

  // Check for phishing indicators
  if (/verify your account|confirm your|update payment/i.test(combined)) {
    warnings.push("Potential phishing indicators");
  }

  // Check for excessive links
  const urlCount = (combined.match(/https?:\/\//g) || []).length;
  if (urlCount > 10) {
    warnings.push("Excessive number of links");
  }

  return warnings;
}
