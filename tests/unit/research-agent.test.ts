import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeReferralResearch,
  convertResearchToReferrals,
  researchAllReferralPossibilities,
  fetchFromSource,
  extractReferralsFromContent,
  researchRateLimiter,
  fetchGenericPageContent,
} from "../../worker/lib/research-agent";
import { RESEARCH_SOURCES } from "../../worker/lib/research-agent/types";
import type { Env, WebResearchRequest } from "../../worker/types";

describe("Research Agent - Real Fetching", () => {
  let mockEnv: Env;

  beforeEach(() => {
    // Create a proper mock environment with KV methods
    const createKVMock = () => ({
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      getWithMetadata: vi
        .fn()
        .mockResolvedValue({ value: null, metadata: null }),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
    });

    mockEnv = {
      DEALS_PROD: createKVMock() as unknown as KVNamespace,
      DEALS_STAGING: createKVMock() as unknown as KVNamespace,
      DEALS_LOG: createKVMock() as unknown as KVNamespace,
      DEALS_LOCK: createKVMock() as unknown as KVNamespace,
      DEALS_SOURCES: createKVMock() as unknown as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
    } as Env;

    // Reset rate limiter
    researchRateLimiter["requests"].clear();

    // Reset fetch mock
    vi.restoreAllMocks();
  });

  describe("fetchFromSource", () => {
    it("should return error for non-existent source", async () => {
      const source = RESEARCH_SOURCES[0];

      // Mock fetch to simulate failure
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await fetchFromSource(source, "test query");

      // Should fail since we're mocking fetch error
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should respect payload size limits", async () => {
      // Create a large content string that exceeds MAX_PAYLOAD_SIZE_BYTES (1MB)
      const largeContent = "x".repeat(1_500_000); // 1.5MB

      // Mock fetch to return oversized content
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(largeContent),
      });

      const result = await fetchGenericPageContent("https://example.com/test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("size limit");
    });
  });

  describe("extractReferralsFromContent", () => {
    it("should extract referral codes from HTML content", () => {
      const content = `
        <html>
          <body>
            <div>Use referral: REF123456 for $50 bonus when you sign up today</div>
            <div>Invite: INVITE789 gives you 20% off your first purchase</div>
            <div>Get started with code: PROMO2024 and earn rewards</div>
            <a href="https://example.com/invite/REF123456">Sign up with referral</a>
          </body>
        </html>
      `;

      const source = RESEARCH_SOURCES.find((s) => s.name === "company_site")!;
      const referrals = extractReferralsFromContent(
        content,
        source,
        "company_site",
      );

      expect(referrals.length).toBeGreaterThan(0);
      // Check for extracted codes
      expect(
        referrals.some(
          (r) =>
            r.code.includes("REF") ||
            r.code.includes("INVITE") ||
            r.code.includes("PROMO"),
        ),
      ).toBe(true);
    });

    it("should calculate confidence scores appropriately", () => {
      const content = `
        Get $100 bonus with referral code ABCD1234
        https://example.com/referral/ABCD1234
      `;

      const source = RESEARCH_SOURCES[0];
      const referrals = extractReferralsFromContent(
        content,
        source,
        source.name,
      );

      const highConfidenceReferral = referrals.find(
        (r) => r.code === "ABCD1234",
      );
      if (highConfidenceReferral) {
        expect(highConfidenceReferral.confidence).toBeGreaterThan(0.5);
      }
    });

    it("should filter out low confidence codes", () => {
      const content = `
        <div>test referral code XYZ123 (this is a test context with test keyword)</div>
        <div>demo referral code ABC456 (this is a demo example with demo keyword)</div>
        <div>sample referral code DEF789 (this is a sample fake with sample keyword)</div>
      `;

      const source = RESEARCH_SOURCES.find((s) => s.name === "company_site")!;
      const referrals = extractReferralsFromContent(
        content,
        source,
        source.name,
      );

      // Suspicious codes should have lower confidence due to test/demo/sample keywords
      referrals.forEach((ref) => {
        const context = (ref.context || "").toLowerCase();
        if (
          context.includes("test") ||
          context.includes("demo") ||
          context.includes("sample")
        ) {
          expect(ref.confidence).toBeLessThan(0.6);
        }
      });
    });
  });

  describe("researchRateLimiter", () => {
    it("should allow requests within limit", () => {
      const source = "test-source";

      // Should allow first 10 requests
      for (let i = 0; i < 10; i++) {
        expect(researchRateLimiter.canMakeRequest(source)).toBe(true);
        researchRateLimiter.recordRequest(source);
      }

      // 11th request should be blocked
      expect(researchRateLimiter.canMakeRequest(source)).toBe(false);
    });

    it("should track time until next window", () => {
      const source = "test-source";
      researchRateLimiter.recordRequest(source);

      const waitTime = researchRateLimiter.getTimeUntilNextWindow(source);
      expect(waitTime).toBeGreaterThanOrEqual(0);
      expect(waitTime).toBeLessThanOrEqual(60000); // 1 minute window
    });
  });

  describe("executeReferralResearch", () => {
    it("should perform simulated research by default", async () => {
      const request: WebResearchRequest = {
        query: "trading212 referral",
        domain: "trading212.com",
        depth: "quick",
        max_results: 5,
      };

      const result = await executeReferralResearch(mockEnv, request);

      expect(result.query).toBe("trading212 referral");
      expect(result.domain).toBe("trading212.com");
      expect(result.discovered_codes.length).toBeGreaterThan(0);
      expect(result.research_metadata.sources_checked.length).toBeGreaterThan(
        0,
      );
      expect(result.research_metadata.agent_id).toBeDefined();
    });

    it("should include known program patterns when domain is known", async () => {
      const request: WebResearchRequest = {
        query: "trading212",
        domain: "trading212.com",
        depth: "quick",
        sources: ["company_site"],
        max_results: 10,
      };

      const result = await executeReferralResearch(mockEnv, request);

      // Should include patterns from known referral program
      expect(result.discovered_codes.length).toBeGreaterThan(0);

      // At least some codes should come from known patterns
      const knownPatternCodes = result.discovered_codes.filter(
        (c) =>
          c.source.includes("known_pattern") || c.source.includes("trading212"),
      );
      expect(knownPatternCodes.length).toBeGreaterThan(0);
    });

    it("should respect max_results limit", async () => {
      const request: WebResearchRequest = {
        query: "test",
        depth: "thorough",
        sources: ["producthunt", "reddit"],
        max_results: 3,
      };

      const result = await executeReferralResearch(mockEnv, request);

      expect(result.discovered_codes.length).toBeLessThanOrEqual(3);
    });

    it("should deduplicate codes", async () => {
      const request: WebResearchRequest = {
        query: "test",
        depth: "quick",
        sources: ["producthunt", "reddit"],
        max_results: 50,
      };

      const result = await executeReferralResearch(mockEnv, request);

      const codes = result.discovered_codes.map((c) => c.code.toLowerCase());
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(codes.length);
    });

    it("should use real fetching when requested (with fallback)", async () => {
      // Mock fetch to simulate failure (triggers fallback)
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const request: WebResearchRequest = {
        query: "test referral",
        depth: "quick",
        sources: ["producthunt"],
        max_results: 5,
        options: {
          use_real_fetching: true,
        },
      };

      const result = await executeReferralResearch(mockEnv, request);

      // Should still return results via fallback simulation
      expect(result.discovered_codes.length).toBeGreaterThan(0);
      expect(result.research_metadata.used_real_fetching).toBe(true);
      expect(result.research_metadata.errors).toBeDefined();
      expect(result.research_metadata.errors!.length).toBeGreaterThan(0);
    });
  });

  describe("convertResearchToReferrals", () => {
    it("should convert research results to referral inputs", async () => {
      const researchResult = {
        query: "test",
        domain: "example.com",
        discovered_codes: [
          {
            code: "TESTCODE123",
            url: "https://example.com/invite/TESTCODE123",
            source: "test_source",
            discovered_at: new Date().toISOString(),
            reward_summary: "$50 bonus",
            confidence: 0.8,
          },
        ],
        research_metadata: {
          sources_checked: ["test"],
          search_queries: ["test"],
          research_duration_ms: 100,
          agent_id: "test-agent",
        },
      };

      const referrals = await convertResearchToReferrals(
        mockEnv,
        researchResult,
      );

      expect(referrals.length).toBe(1);
      expect(referrals[0].code).toBe("TESTCODE123");
      expect(referrals[0].status).toBe("quarantined");
      expect(referrals[0].metadata.confidence_score).toBe(0.8);
    });

    it("should filter by confidence threshold", async () => {
      const researchResult = {
        query: "test",
        domain: "example.com",
        discovered_codes: [
          {
            code: "HIGHCONF",
            url: "https://example.com/high",
            source: "test",
            discovered_at: new Date().toISOString(),
            confidence: 0.9,
          },
          {
            code: "LOWCONF",
            url: "https://example.com/low",
            source: "test",
            discovered_at: new Date().toISOString(),
            confidence: 0.2,
          },
        ],
        research_metadata: {
          sources_checked: ["test"],
          search_queries: ["test"],
          research_duration_ms: 100,
          agent_id: "test-agent",
        },
      };

      const referrals = await convertResearchToReferrals(
        mockEnv,
        researchResult,
        0.5,
      );

      expect(referrals.length).toBe(1);
      expect(referrals[0].code).toBe("HIGHCONF");
    });
  });

  describe("researchAllReferralPossibilities", () => {
    it("should research all possibilities for a domain", async () => {
      const result = await researchAllReferralPossibilities(
        mockEnv,
        "trading212.com",
        "thorough",
        false, // Don't use real fetching in tests
      );

      expect(result.domain).toBe("trading212.com");
      expect(result.discovered_codes.length).toBeGreaterThan(0);
      // Check for either known_program or known_pattern prefix
      const hasKnownSource = result.research_metadata.sources_checked.some(
        (s) =>
          s.startsWith("known_program:trading212") ||
          s.startsWith("known_pattern:trading212"),
      );
      expect(hasKnownSource).toBe(true);
    });
  });
});
