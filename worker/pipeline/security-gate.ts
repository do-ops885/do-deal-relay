// worker/pipeline/security-gate.ts
// Security gate for the PEV loop.
// Runs security-specific checks that are independent of the author agent.
// Prevents SSRF, credential leakage, injection, and other security issues.

import type { Deal, PipelineContext, Env } from "../types";
import { CONFIG } from "../config";
import { logger } from "../lib/global-logger";

// ============================================================================
// Security Check Types
// ============================================================================

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  check: string;
  severity: Severity;
  passed: boolean;
  message: string;
  details?: string[];
  recommendation?: string;
  timestamp: string;
}

export interface SecurityReport {
  run_id: string;
  overall_pass: boolean;
  findings: SecurityFinding[];
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  timestamp: string;
}

// ============================================================================
// Security Validators
// ============================================================================

/**
 * SSRF protection: blocks requests to internal/private networks.
 */
const SSRF_CHECK = {
  name: "ssrf_protection",
  description: "No URLs pointing to internal/private networks",
  validate: (deal: Deal): SecurityFinding => {
    const blockedHosts = CONFIG.BLOCKED_HOSTS;
    const blockedRanges = CONFIG.BLOCKED_IP_RANGES;
    const issues: string[] = [];

    const urls = [deal.url, deal.source.url];
    for (const url of urls) {
      try {
        const parsed = new URL(url);
        const hostname = parsed.hostname;

        // Check blocked hosts
        if (blockedHosts.includes(hostname)) {
          issues.push(`Blocked host: ${hostname}`);
        }

        // Check private IP ranges
        if (isPrivateIP(hostname, blockedRanges)) {
          issues.push(`Private IP detected: ${hostname}`);
        }

        // Check for non-HTTP schemes
        if (!["http:", "https:"].includes(parsed.protocol)) {
          issues.push(`Suspicious protocol: ${parsed.protocol}`);
        }
      } catch {
        issues.push(`Invalid URL: ${url}`);
      }
    }

    return {
      check: "ssrf_protection",
      severity: "critical",
      passed: issues.length === 0,
      message:
        issues.length === 0
          ? "No SSRF vulnerabilities detected"
          : `SSRF issues: ${issues.join(", ")}`,
      details: issues.length > 0 ? issues : undefined,
      recommendation:
        issues.length > 0
          ? "Use allowlisted domains only; validate all URLs before fetching"
          : undefined,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Credential leakage detection: checks for exposed secrets in deal data.
 */
const CREDENTIAL_LEAKAGE_CHECK = {
  name: "credential_leakage",
  description: "No exposed credentials or secrets in deal data",
  validate: (deal: Deal): SecurityFinding => {
    const issues: string[] = [];
    const text = JSON.stringify(deal).toLowerCase();

    // Patterns that indicate credential leakage
    const credentialPatterns = [
      { pattern: /password\s*[:=]\s*["']?[^"'\s]+/gi, name: "password" },
      { pattern: /secret\s*[:=]\s*["']?[^"'\s]+/gi, name: "secret" },
      { pattern: /api[_-]?key\s*[:=]\s*["']?[^"'\s]+/gi, name: "api_key" },
      { pattern: /token\s*[:=]\s*["']?[^"'\s]+/gi, name: "token" },
      { pattern: /private[_-]?key\s*[:=]\s*["']?[^"'\s]+/gi, name: "private_key" },
      {
        pattern: /bearer\s+[a-zA-Z0-9._-]{20,}/gi,
        name: "bearer_token",
      },
      {
        pattern: /sk-[a-zA-Z0-9]{20,}/g,
        name: "openai_key",
      },
    ];

    for (const { pattern, name } of credentialPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        issues.push(`Potential ${name} detected: ${matches[0].substring(0, 30)}...`);
      }
    }

    return {
      check: "credential_leakage",
      severity: "critical",
      passed: issues.length === 0,
      message:
        issues.length === 0
          ? "No credential leakage detected"
          : `Credential issues: ${issues.join("; ")}`,
      details: issues.length > 0 ? issues : undefined,
      recommendation:
        issues.length > 0
          ? "Remove all secrets from deal data before storage"
          : undefined,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Injection detection: checks for SQL/NoSQL injection patterns.
 */
const INJECTION_CHECK = {
  name: "injection_detection",
  description: "No SQL/NoSQL injection patterns in deal data",
  validate: (deal: Deal): SecurityFinding => {
    const issues: string[] = [];
    const text = JSON.stringify(deal);

    const injectionPatterns = [
      { pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)/gi, name: "SQL" },
      { pattern: /(\$\{.*\}|\$where|\$regex)/gi, name: "NoSQL" },
      { pattern: /<script[\s>]/gi, name: "XSS" },
      { pattern: /(javascript|data):/gi, name: "javascript_uri" },
      { pattern: /(\.\.\/|\.\.\\)/g, name: "path_traversal" },
    ];

    for (const { pattern, name } of injectionPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        issues.push(`Potential ${name} injection: ${matches[0]}`);
      }
    }

    return {
      check: "injection_detection",
      severity: "high",
      passed: issues.length === 0,
      message:
        issues.length === 0
          ? "No injection patterns detected"
          : `Injection issues: ${issues.join("; ")}`,
      details: issues.length > 0 ? issues : undefined,
      recommendation:
        issues.length > 0
          ? "Sanitize all user-provided data before storage"
          : undefined,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * URL validation: checks for suspicious URL patterns.
 */
const URL_VALIDATION_CHECK = {
  name: "url_validation",
  description: "URLs are valid and use safe protocols",
  validate: (deal: Deal): SecurityFinding => {
    const issues: string[] = [];

    const urls = [deal.url, deal.source.url];
    for (const url of urls) {
      try {
        const parsed = new URL(url);

        // Check for HTTP (not HTTPS)
        if (parsed.protocol === "http:") {
          issues.push(`HTTP (not HTTPS): ${url}`);
        }

        // Check for extremely long URLs (potential buffer overflow)
        if (url.length > 2048) {
          issues.push(`URL exceeds 2048 characters: ${url.length}`);
        }

        // Check for suspicious port numbers
        if (parsed.port) {
          const port = parseInt(parsed.port, 10);
          if (port < 1 || port > 65535) {
            issues.push(`Invalid port: ${parsed.port}`);
          }
        }
      } catch {
        issues.push(`Malformed URL: ${url}`);
      }
    }

    return {
      check: "url_validation",
      severity: "medium",
      passed: issues.length === 0,
      message:
        issues.length === 0
          ? "URLs are valid"
          : `URL issues: ${issues.join("; ")}`,
      details: issues.length > 0 ? issues : undefined,
      recommendation:
        issues.length > 0
          ? "Use HTTPS URLs and validate all inputs"
          : undefined,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Content safety: checks for potentially harmful content.
 */
const CONTENT_SAFETY_CHECK = {
  name: "content_safety",
  description: "No harmful or inappropriate content patterns",
  validate: (deal: Deal): SecurityFinding => {
    const issues: string[] = [];
    const text = `${deal.title} ${deal.description}`.toLowerCase();

    // Basic content safety patterns
    const safetyPatterns = [
      { pattern: /\b(scam|phishing|malware|virus|hack)\b/gi, name: "malicious" },
      { pattern: /\b(get rich quick|guaranteed returns|risk.?free)\b/gi, name: "fraud" },
      { pattern: /\b(earn \$\d+ per (day|week|month|hour))\b/gi, name: "pyramid" },
    ];

    for (const { pattern, name } of safetyPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        issues.push(`Suspicious ${name} language: "${matches[0]}"`);
      }
    }

    return {
      check: "content_safety",
      severity: "medium",
      passed: issues.length === 0,
      message:
        issues.length === 0
          ? "Content appears safe"
          : `Content issues: ${issues.join("; ")}`,
      details: issues.length > 0 ? issues : undefined,
      recommendation:
        issues.length > 0
          ? "Review deal content for fraud indicators"
          : undefined,
      timestamp: new Date().toISOString(),
    };
  },
};

// ============================================================================
// Security Gate Runner
// ============================================================================

const SECURITY_CHECKS = [
  SSRF_CHECK,
  CREDENTIAL_LEAKAGE_CHECK,
  INJECTION_CHECK,
  URL_VALIDATION_CHECK,
  CONTENT_SAFETY_CHECK,
];

/**
 * Runs all security checks against a set of deals.
 *
 * @param deals - Deals to check
 * @param ctx - Pipeline context
 * @param env - Environment bindings
 * @returns Security report with pass/fail per check
 */
export async function runSecurityGate(
  deals: Deal[],
  ctx: PipelineContext,
  _env: Env,
): Promise<SecurityReport> {
  const findings: SecurityFinding[] = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  logger.info("Running security gate", {
    run_id: ctx.run_id,
    deal_count: deals.length,
    checks_count: SECURITY_CHECKS.length,
  });

  for (const deal of deals) {
    for (const check of SECURITY_CHECKS) {
      try {
        const finding = check.validate(deal);
        findings.push(finding);

        if (!finding.passed) {
          switch (finding.severity) {
            case "critical":
              criticalCount++;
              break;
            case "high":
              highCount++;
              break;
            case "medium":
              mediumCount++;
              break;
            case "low":
              lowCount++;
              break;
          }

          logger.warn(`Security finding: ${check.name}`, {
            run_id: ctx.run_id,
            deal_id: deal.id,
            severity: finding.severity,
            message: finding.message,
          });
        }
      } catch (error) {
        criticalCount++;
        findings.push({
          check: check.name,
          severity: "critical",
          passed: false,
          message: `Security check error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Critical and high findings block the pipeline
  const overallPass = criticalCount === 0 && highCount === 0;

  const report: SecurityReport = {
    run_id: ctx.run_id,
    overall_pass: overallPass,
    findings,
    critical_count: criticalCount,
    high_count: highCount,
    medium_count: mediumCount,
    low_count: lowCount,
    timestamp: new Date().toISOString(),
  };

  logger.info("Security gate complete", {
    run_id: ctx.run_id,
    overall_pass: overallPass,
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
  });

  return report;
}

/**
 * Summarizes security findings for feedback to the PLAN phase.
 */
export function summarizeSecurityFindings(report: SecurityReport): string {
  const failed = report.findings.filter((f) => !f.passed);
  if (failed.length === 0) return "";

  const lines = [
    `Security gate failed: ${failed.length} finding(s)`,
    "",
    `Critical: ${report.critical_count} | High: ${report.high_count} | Medium: ${report.medium_count} | Low: ${report.low_count}`,
    "",
    ...failed.map(
      (f) =>
        `- [${f.severity.toUpperCase()}] ${f.check}: ${f.message}`,
    ),
    "",
    "Security findings must be resolved before merge.",
  ];

  return lines.join("\n");
}

// ============================================================================
// Helpers
// ============================================================================

function isPrivateIP(hostname: string, blockedRanges: string[]): boolean {
  // Simple check for common private IP patterns
  const privatePatterns = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
  ];

  return privatePatterns.some((p) => p.test(hostname));
}
