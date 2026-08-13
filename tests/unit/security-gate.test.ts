import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runSecurityGate,
  summarizeSecurityFindings,
} from "../../worker/pipeline/security-gate";
import type { Deal, PipelineContext, Env } from "../../worker/types";

// Mock validateFetchUrl to prevent real network calls and test reliably
vi.mock("../../worker/lib/security", () => ({
  validateFetchUrl: vi.fn(async (url: string) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      // Block standard private IPs and prohibited domains for test validation
      if (
        host === "127.0.0.1" ||
        host === "localhost" ||
        host === "10.0.0.1" ||
        host === "192.168.1.1" ||
        host === "169.254.169.254" ||
        host === "private-host.local"
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }),
}));

describe("Security Gate - runSecurityGate", () => {
  let mockCtx: PipelineContext;
  let mockEnv: Env;

  beforeEach(() => {
    mockCtx = {
      run_id: "test-run-123",
      trace_id: "test-trace-123",
      start_time: Date.now(),
      candidates: [],
      normalized: [],
      deduped: [],
      validated: [],
      scored: [],
      errors: [],
      retry_count: 0,
    };
    mockEnv = {} as Env;
  });

  const createMockDeal = (overrides: Partial<Deal>): Deal => {
    const timestamp = new Date().toISOString();
    return {
      id: "deal-1",
      title: "Default Title",
      description: "Default description that is long enough.",
      code: "PROMO20",
      url: "https://safe-service.com/checkout",
      source: {
        domain: "safe-service.com",
        url: "https://safe-service.com",
        discovered_at: timestamp,
        trust_score: 0.9,
      },
      reward: {
        type: "percent",
        value: 20,
      },
      expiry: {
        confidence: 1.0,
        type: "unknown",
      },
      metadata: {
        category: ["finance"],
        tags: ["safe"],
        normalized_at: timestamp,
        confidence_score: 1.0,
        status: "active",
      },
      ...overrides,
    };
  };

  it("should pass when a deal has all valid and safe properties", async () => {
    const safeDeal = createMockDeal({
      id: "deal-1",
      title: "Get 20% off on premium subscriptions",
      description: "Use code PROMO20 for 20% off at check-out on safe-service.",
      url: "https://safe-service.com/checkout",
    });

    const report = await runSecurityGate([safeDeal], mockCtx, mockEnv);
    expect(report.overall_pass).toBe(true);
    expect(report.critical_count).toBe(0);
    expect(report.findings.every((f) => f.passed)).toBe(true);
  });

  it("should fail SSRF check on invalid protocol", async () => {
    const maliciousDeal = createMockDeal({
      id: "deal-2",
      title: "Get free cloud instances",
      description: "Check this protocol bypass",
      url: "ftp://safe-service.com/unsupported",
    });

    const report = await runSecurityGate([maliciousDeal], mockCtx, mockEnv);
    expect(report.overall_pass).toBe(false);
    expect(report.critical_count).toBeGreaterThan(0);
    const ssrfFinding = report.findings.find(
      (f) => f.check === "ssrf_protection",
    );
    expect(ssrfFinding).toBeDefined();
    expect(ssrfFinding?.passed).toBe(false);
    expect(ssrfFinding?.message).toContain("Suspicious protocol");
  });

  it("should fail SSRF check on blocked host and IP addresses via validateFetchUrl", async () => {
    const maliciousDeal = createMockDeal({
      id: "deal-3",
      title: "Access internally hosted instance",
      description: "Connect to private metadata service",
      url: "https://169.254.169.254/latest/meta-data",
      source: {
        domain: "private-host.local",
        url: "https://private-host.local/details",
        discovered_at: new Date().toISOString(),
        trust_score: 0.7,
      },
    });

    const report = await runSecurityGate([maliciousDeal], mockCtx, mockEnv);
    expect(report.overall_pass).toBe(false);
    expect(report.critical_count).toBeGreaterThan(0);
    const ssrfFinding = report.findings.find(
      (f) => f.check === "ssrf_protection",
    );
    expect(ssrfFinding).toBeDefined();
    expect(ssrfFinding?.passed).toBe(false);
  });

  it("should detect potential credential leakage", async () => {
    const leakingDeal = createMockDeal({
      id: "deal-4",
      title: "Leaked database secret",
      description:
        "We hardcoded connection strings here: PASSWORD=secret_pass_123",
      url: "https://safe-service.com",
    });

    const report = await runSecurityGate([leakingDeal], mockCtx, mockEnv);
    expect(report.overall_pass).toBe(false);
    expect(report.critical_count).toBeGreaterThan(0);
    const credentialFinding = report.findings.find(
      (f) => f.check === "credential_leakage",
    );
    expect(credentialFinding).toBeDefined();
    expect(credentialFinding?.passed).toBe(false);
    expect(credentialFinding?.message).toContain("Potential password detected");
  });

  it("should detect potential SQL/NoSQL injections and XSS", async () => {
    const injectionDeal = createMockDeal({
      id: "deal-5",
      title: "Injecting SQL commands",
      description:
        "SELECT * FROM users; UNION SELECT username, password FROM users;",
      url: "https://safe-service.com",
    });

    const report = await runSecurityGate([injectionDeal], mockCtx, mockEnv);
    expect(report.overall_pass).toBe(false);
    const injectionFinding = report.findings.find(
      (f) => f.check === "injection_detection",
    );
    expect(injectionFinding).toBeDefined();
    expect(injectionFinding?.passed).toBe(false);
  });

  it("should summarize failed security findings correctly", async () => {
    const maliciousDeal = createMockDeal({
      id: "deal-6",
      title: "Connect to private metadata",
      description: "connect here: PASSWORD=secret_pass_123",
      url: "https://169.254.169.254/latest/meta-data",
    });

    const report = await runSecurityGate([maliciousDeal], mockCtx, mockEnv);
    expect(report.overall_pass).toBe(false);
    const summary = summarizeSecurityFindings(report);
    expect(summary).toContain("Security gate failed");
    expect(summary).toContain("ssrf_protection");
    expect(summary).toContain("credential_leakage");
  });
});
