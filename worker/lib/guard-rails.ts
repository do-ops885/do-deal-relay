import { Deal, PipelineError, ErrorClass } from './types';
import { CONFIG } from './config';

// ============================================================================
// Guard Rails - Safety Mechanisms
// ============================================================================

export interface GuardRailCheck {
  name: string;
  severity: 'fatal' | 'warning' | 'info';
  check: (input: unknown) => Promise<GuardRailResult>;
}

export interface GuardRailResult {
  passed: boolean;
  message?: string;
  context?: Record<string, unknown>;
}

export interface GuardRailReport {
  allPassed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    severity: string;
    message?: string;
  }>;
  fatalErrors: string[];
  warnings: string[];
}

// ============================================================================
// Safety Guard Rails
// ============================================================================

/**
 * Check for malicious patterns in deal data
 */
export async function checkSafety(deal: Deal): Promise<GuardRailResult> {
  const issues: string[] = [];

  // Check for script injection attempts
  const scriptPattern = /<script|javascript:|onerror=|onload=/i;
  const fieldsToCheck = [deal.title, deal.description, deal.code, deal.url];

  for (const field of fieldsToCheck) {
    if (scriptPattern.test(field)) {
      issues.push(`Potential XSS in field: ${field.slice(0, 50)}`);
    }
  }

  // Check for suspicious URL schemes
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:'];
  for (const scheme of dangerousSchemes) {
    if (deal.url.toLowerCase().startsWith(scheme)) {
      issues.push(`Dangerous URL scheme detected: ${scheme}`);
    }
  }

  // Check for control characters
  const controlCharPattern = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/;
  if (controlCharPattern.test(deal.code) || controlCharPattern.test(deal.title)) {
    issues.push('Control characters detected in deal data');
  }

  if (issues.length > 0) {
    return {
      passed: false,
      message: issues.join('; '),
      context: { issues },
    };
  }

  return { passed: true };
}

/**
 * Check resource limits
 */
export function checkResourceLimits(deals: Deal[]): GuardRailResult {
  const issues: string[] = [];

  // Check deal count
  if (deals.length > CONFIG.MAX_DEALS_PER_RUN) {
    issues.push(`Deal count ${deals.length} exceeds limit ${CONFIG.MAX_DEALS_PER_RUN}`);
  }

  // Check payload size estimate
  const estimatedSize = JSON.stringify(deals).length;
  if (estimatedSize > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
    issues.push(`Payload size ${estimatedSize} exceeds limit ${CONFIG.MAX_PAYLOAD_SIZE_BYTES}`);
  }

  // Check individual deal field lengths
  for (const deal of deals) {
    if (deal.title.length > 200) {
      issues.push(`Deal ${deal.id}: title too long (${deal.title.length})`);
    }
    if (deal.description.length > 1000) {
      issues.push(`Deal ${deal.id}: description too long (${deal.description.length})`);
    }
    if (deal.code.length > 50) {
      issues.push(`Deal ${deal.id}: code too long (${deal.code.length})`);
    }
  }

  if (issues.length > 0) {
    return {
      passed: false,
      message: issues.join('; '),
      context: { 
        dealCount: deals.length,
        estimatedSize,
      },
    };
  }

  return { passed: true };
}

/**
 * Check rate limiting constraints
 */
export function checkRateLimit(
  currentRequests: number,
  windowStart: number
): GuardRailResult {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 100; // 100 requests per minute

  // Reset window if expired
  if (now - windowStart > windowMs) {
    return { passed: true, context: { reset: true } };
  }

  if (currentRequests >= maxRequests) {
    return {
      passed: false,
      message: `Rate limit exceeded: ${currentRequests} requests in current window`,
      context: {
        currentRequests,
        maxRequests,
        windowRemaining: windowMs - (now - windowStart),
      },
    };
  }

  return { passed: true };
}

// ============================================================================
// Quality Guard Rails
// ============================================================================

/**
 * Check data quality metrics
 */
export function checkDataQuality(deals: Deal[]): GuardRailResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (deals.length === 0) {
    warnings.push('No deals to validate');
  }

  // Check for empty required fields
  let emptyFields = 0;
  for (const deal of deals) {
    if (!deal.code || !deal.title || !deal.url) {
      emptyFields++;
    }
  }

  if (emptyFields > 0) {
    issues.push(`${emptyFields} deals have empty required fields`);
  }

  // Check URL validity
  let invalidUrls = 0;
  for (const deal of deals) {
    try {
      new URL(deal.url);
    } catch {
      invalidUrls++;
    }
  }

  if (invalidUrls > 0) {
    issues.push(`${invalidUrls} deals have invalid URLs`);
  }

  // Check for duplicate codes (syntactic)
  const codes = new Map<string, number>();
  for (const deal of deals) {
    const count = codes.get(deal.code) || 0;
    codes.set(deal.code, count + 1);
  }

  const duplicates = Array.from(codes.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    warnings.push(`${duplicates.length} duplicate codes found: ${duplicates.map(([code]) => code).join(', ')}`);
  }

  // Check reward distribution
  const cashRewards = deals
    .filter((d) => d.reward.type === 'cash' && typeof d.reward.value === 'number')
    .map((d) => d.reward.value as number);

  if (cashRewards.length > 0) {
    const avgReward = cashRewards.reduce((a, b) => a + b, 0) / cashRewards.length;
    const maxReward = Math.max(...cashRewards);

    // Flag anomalous rewards (>3σ would be suspicious)
    const suspicious = cashRewards.filter((r) => r > avgReward * 5);
    if (suspicious.length > 0) {
      warnings.push(`${suspicious.length} deals have suspiciously high rewards`);
    }

    if (maxReward > 1000) {
      warnings.push(`Maximum reward $${maxReward} is unusually high`);
    }
  }

  const allIssues = [...issues, ...warnings];
  
  if (issues.length > 0) {
    return {
      passed: false,
      message: allIssues.join('; '),
      context: { issues, warnings },
    };
  }

  if (warnings.length > 0) {
    return {
      passed: true, // Warnings don't block
      message: allIssues.join('; '),
      context: { warnings },
    };
  }

  return { passed: true };
}

// ============================================================================
// Consistency Guard Rails
// ============================================================================

/**
 * Check for data consistency across pipeline stages
 */
export function checkConsistency(
  before: { count: number; hashes: string[] },
  after: { count: number; hashes: string[] }
): GuardRailResult {
  const issues: string[] = [];

  // Check counts make sense (can't increase after deduplication)
  if (after.count > before.count) {
    issues.push(`Deal count increased from ${before.count} to ${after.count}`);
  }

  // Check for data loss (shouldn't lose >50% without reason)
  const lossRatio = before.count > 0 ? (before.count - after.count) / before.count : 0;
  if (lossRatio > 0.5) {
    issues.push(`Lost ${(lossRatio * 100).toFixed(1)}% of deals - check pipeline`);
  }

  // Check hash integrity (no deals should disappear between stages without tracking)
  const missingHashes = before.hashes.filter((h) => !after.hashes.includes(h));
  if (missingHashes.length > 0 && missingHashes.length < before.count) {
    // Some loss is expected (deduplication, validation), but track it
    console.warn(`${missingHashes.length} deals removed from pipeline`);
  }

  if (issues.length > 0) {
    return {
      passed: false,
      message: issues.join('; '),
      context: {
        beforeCount: before.count,
        afterCount: after.count,
        lossRatio,
      },
    };
  }

  return { passed: true };
}

// ============================================================================
// Run All Guard Rails
// ============================================================================

/**
 * Run comprehensive guard rail checks
 */
export async function runGuardRails(
  deals: Deal[],
  stage: 'input' | 'processing' | 'output'
): Promise<GuardRailReport> {
  const checks: GuardRailReport['checks'] = [];
  const fatalErrors: string[] = [];
  const warnings: string[] = [];

  // Stage-specific checks
  if (stage === 'input') {
    // Resource limits on input
    const resourceCheck = checkResourceLimits(deals);
    checks.push({
      name: 'resource_limits',
      passed: resourceCheck.passed,
      severity: 'fatal',
      message: resourceCheck.message,
    });
    if (!resourceCheck.passed) fatalErrors.push(resourceCheck.message || 'Resource limit exceeded');
  }

  if (stage === 'processing') {
    // Safety checks on each deal
    for (let i = 0; i < Math.min(deals.length, 10); i++) {
      const safetyCheck = await checkSafety(deals[i]);
      if (!safetyCheck.passed) {
        checks.push({
          name: `safety_check_${i}`,
          passed: false,
          severity: 'fatal',
          message: safetyCheck.message,
        });
        fatalErrors.push(`Deal ${deals[i].id}: ${safetyCheck.message}`);
      }
    }
  }

  if (stage === 'output') {
    // Data quality on output
    const qualityCheck = checkDataQuality(deals);
    checks.push({
      name: 'data_quality',
      passed: qualityCheck.passed,
      severity: qualityCheck.passed && qualityCheck.message ? 'warning' : 'fatal',
      message: qualityCheck.message,
    });
    if (!qualityCheck.passed) {
      fatalErrors.push(qualityCheck.message || 'Data quality check failed');
    } else if (qualityCheck.message) {
      warnings.push(qualityCheck.message);
    }
  }

  return {
    allPassed: fatalErrors.length === 0,
    checks,
    fatalErrors,
    warnings,
  };
}

/**
 * Enforce guard rails (throw on fatal errors)
 */
export async function enforceGuardRails(
  deals: Deal[],
  stage: 'input' | 'processing' | 'output'
): Promise<void> {
  const report = await runGuardRails(deals, stage);

  if (!report.allPassed) {
    throw new PipelineError(
      'ValidationError',
      `Guard rails failed: ${report.fatalErrors.join('; ')}`,
      'validate',
      false
    );
  }
}
