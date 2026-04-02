import type { ParsedEmail, ExtractionResult } from "./types";
import {
  SERVICE_PATTERNS,
  GENERIC_PATTERNS,
  DOMAIN_TO_SERVICE,
} from "./patterns";

// ============================================================================
// URL Extraction - CRITICAL: Always preserve complete URLs
// ============================================================================

/**
 * Extract all URLs from email content
 * CRITICAL: Must return complete, unmodified URLs
 */
export function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\^`\[\]]+/gi;
  const matches = text.match(urlPattern) || [];

  // Clean and validate URLs
  return matches
    .map((url) => {
      // Remove trailing punctuation that might have been captured
      let cleanUrl = url.replace(/[.,;:!?"'\)\]\}]+$/, "");
      // Remove HTML entities
      cleanUrl = cleanUrl.replace(/&amp;/g, "&");
      return cleanUrl;
    })
    .filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
}

/**
 * Extract referral URL and code from email using service-specific patterns
 * CRITICAL: Returns complete URL from email, never reconstructed
 */
export function extractReferralUrl(
  email: ParsedEmail,
  servicePattern?: (typeof SERVICE_PATTERNS)["uber"],
): { url: string | null; code: string | null } {
  const text = (email.text || "") + " " + (email.html || "");
  const urls = extractUrls(text);

  // If service pattern provided, try to match its URL patterns first
  if (servicePattern?.urlPatterns) {
    for (const url of urls) {
      for (const pattern of servicePattern.urlPatterns) {
        if (pattern.test(url)) {
          // Extract code from URL if pattern has inUrl code extraction
          let code: string | null = null;
          if (servicePattern.code.inUrl) {
            const match = url.match(servicePattern.code.inUrl);
            if (match) {
              code = match[1];
            }
          }
          // Return complete URL exactly as found in email
          return { url, code };
        }
      }
    }
  }

  // Try generic referral URL patterns
  for (const url of urls) {
    for (const pattern of GENERIC_PATTERNS.referralUrlPatterns) {
      const match = url.match(pattern);
      if (match) {
        // For query parameter patterns, extract the code
        const code = match[1] || null;
        return { url, code };
      }
    }
  }

  return { url: null, code: null };
}

// ============================================================================
// Service Detection
// ============================================================================

/**
 * Detect service from email sender, subject, and content
 */
export function detectService(email: ParsedEmail): string {
  const sender = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();
  const text = (email.text || "").toLowerCase();

  // Check sender domain against known services
  for (const [domain, service] of Object.entries(DOMAIN_TO_SERVICE)) {
    if (sender.includes(domain)) {
      return service;
    }
  }

  // Check subject line for service names
  const serviceNames = [
    "picnic",
    "uber",
    "lyft",
    "airbnb",
    "dropbox",
    "robinhood",
    "trading212",
    "crypto.com",
    "coinbase",
    "revolut",
    "rakuten",
    "doordash",
    "ubereats",
    "grubhub",
    "booking",
    "expedia",
    "spotify",
    "netflix",
    "discord",
    "telegram",
    "headspace",
  ];

  for (const name of serviceNames) {
    if (subject.includes(name) || text.includes(name)) {
      // Map common names to service keys
      if (name === "crypto.com") return "crypto_com";
      if (name === "trading212") return "trading212";
      return name;
    }
  }

  return "unknown";
}

/**
 * Get service pattern by service name
 */
export function getServicePattern(
  serviceName: string,
): (typeof SERVICE_PATTERNS)["uber"] | undefined {
  return SERVICE_PATTERNS[serviceName];
}

// ============================================================================
// Code Extraction
// ============================================================================

/**
 * Extract referral code from email content
 */
export function extractCode(
  email: ParsedEmail,
  servicePattern?: (typeof SERVICE_PATTERNS)["uber"],
): string | null {
  const text = email.text || "";
  const html = email.html || "";
  const combined = text + " " + html;

  // Try service-specific body pattern first
  if (servicePattern?.code.inBody) {
    const match = combined.match(servicePattern.code.inBody);
    if (match) {
      return match[1];
    }
  }

  // Try generic patterns
  for (const pattern of GENERIC_PATTERNS.codePatterns) {
    const match = combined.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// ============================================================================
// Reward Extraction
// ============================================================================

/**
 * Extract reward description from email content
 */
export function extractReward(
  email: ParsedEmail,
  servicePattern?: (typeof SERVICE_PATTERNS)["uber"],
): string | null {
  const text = email.text || "";
  const html = email.html || "";
  const combined = text + " " + html;

  // Try service-specific pattern
  if (servicePattern?.reward) {
    const match = combined.match(servicePattern.reward);
    if (match) {
      return match[1].trim();
    }
  }

  // Try generic patterns
  for (const pattern of GENERIC_PATTERNS.rewardPatterns) {
    const match = combined.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

// ============================================================================
// Expiry Extraction
// ============================================================================

/**
 * Extract expiry date from email content
 */
export function extractExpiry(
  email: ParsedEmail,
  servicePattern?: (typeof SERVICE_PATTERNS)["uber"],
): string | null {
  const text = email.text || "";
  const html = email.html || "";
  const combined = text + " " + html;

  // Try service-specific pattern
  if (servicePattern?.expiry) {
    const match = combined.match(servicePattern.expiry);
    if (match) {
      const parsed = parseDate(match[1]);
      if (parsed) return parsed;
    }
  }

  // Try generic patterns
  for (const pattern of GENERIC_PATTERNS.expiryPatterns) {
    const match = combined.match(pattern);
    if (match) {
      const parsed = parseDate(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Parse various date formats into ISO string
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const cleanStr = dateStr.trim();

  // Try common formats
  const formats = [
    // MM/DD/YYYY
    {
      regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      parser: (m: RegExpMatchArray) =>
        `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
    },
    // DD.MM.YYYY (German/European)
    {
      regex: /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
      parser: (m: RegExpMatchArray) =>
        `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`,
    },
    // Month DD, YYYY
    {
      regex: /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/,
      parser: (m: RegExpMatchArray) => {
        const monthNames = [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ];
        const month =
          monthNames.findIndex((n) => m[1].toLowerCase().includes(n)) + 1;
        return month > 0
          ? `${m[3]}-${month.toString().padStart(2, "0")}-${m[2].padStart(2, "0")}`
          : null;
      },
    },
    // YYYY-MM-DD
    { regex: /(\d{4})-(\d{2})-(\d{2})/, parser: (m: RegExpMatchArray) => m[0] },
  ];

  for (const format of formats) {
    const match = cleanStr.match(format.regex);
    if (match) {
      const result = format.parser(match);
      if (result) {
        // Validate it's a real date
        const date = new Date(result);
        if (!isNaN(date.getTime())) {
          return result;
        }
      }
    }
  }

  // Try native date parsing as fallback
  const nativeDate = new Date(cleanStr);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString().split("T")[0];
  }

  return null;
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract referral information from an email
 * Uses service-specific patterns for high confidence,
 * falls back to generic patterns
 */
export function extractReferralFromEmail(email: ParsedEmail): ExtractionResult {
  // Detect service
  const serviceName = detectService(email);
  const servicePattern = getServicePattern(serviceName);

  // Try service-specific extraction first
  if (servicePattern) {
    const { url, code: urlCode } = extractReferralUrl(email, servicePattern);
    const bodyCode = extractCode(email, servicePattern);
    const reward = extractReward(email, servicePattern);
    const expiry = extractExpiry(email, servicePattern);

    // Use URL code if available, otherwise body code
    const code = urlCode || bodyCode || null;

    // If we found a referral URL or code with service pattern
    if (url || code) {
      return {
        service: servicePattern.serviceName,
        code,
        referralUrl: url,
        reward,
        expiry,
        confidence: url ? 0.9 : 0.7,
        method: "service-specific",
      };
    }
  }

  // Fall back to generic extraction
  const { url, code } = extractReferralUrl(email);
  const reward = extractReward(email);
  const expiry = extractExpiry(email);

  if (url || code) {
    return {
      service: serviceName !== "unknown" ? serviceName : "Generic",
      code,
      referralUrl: url,
      reward,
      expiry,
      confidence: 0.6,
      method: "generic",
    };
  }

  // Last resort - return unknown for manual review
  return {
    service: serviceName,
    code: null,
    referralUrl: null,
    reward: null,
    expiry: null,
    confidence: 0,
    method: "manual",
  };
}

// ============================================================================
// Command Parsing
// ============================================================================

import type { ParsedCommand, EmailCommandType } from "./types";

/**
 * Determine if email is a command email or forwarded referral
 */
export function detectEmailType(email: ParsedEmail): EmailCommandType {
  const to = email.to[0]?.toLowerCase() || "";
  const subject = email.subject.toLowerCase();
  const text = (email.text || "").toLowerCase();

  // Check recipient address for command prefix
  if (to.startsWith("add@")) return "ADD";
  if (to.startsWith("deactivate@")) return "DEACTIVATE";
  if (to.startsWith("search@")) return "SEARCH";
  if (to.startsWith("digest@")) return "DIGEST";
  if (to.startsWith("help@")) return "HELP";

  // Check subject line for command prefix
  if (subject.startsWith("add:")) return "ADD";
  if (subject.startsWith("deactivate:")) return "DEACTIVATE";
  if (subject.startsWith("search:")) return "SEARCH";
  if (subject.startsWith("digest:")) return "DIGEST";
  if (subject.startsWith("help")) return "HELP";

  // Check for forwarded email patterns
  const forwardedPatterns = [
    /^fw[:\s]/i,
    /^fwd[:\s]/i,
    /^forwarded/i,
    /^weitergeleitet/i, // German
  ];

  for (const pattern of forwardedPatterns) {
    if (pattern.test(subject)) {
      return "FORWARDED";
    }
  }

  // Check body for referral content
  if (GENERIC_PATTERNS.subjectKeywords.test(subject + " " + text)) {
    return "FORWARDED";
  }

  return "UNKNOWN";
}
