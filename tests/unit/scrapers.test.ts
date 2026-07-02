// Unit tests for worker/lib/research-agent/scrapers/*
// ============================================================================
//
// Covers the new Scraper interface, ready checks, and the AI extractor
// parsing logic. Live network calls are deliberately NOT exercised here —
// those belong in integration tests with mocks. We assert:
//   - readiness contract
//   - error path when credentials are missing
//   - AI response parsing (json array, fenced json, regex fallback)
//   - barrel registry + SourceName resolution

import { describe, expect, it, vi } from "vitest";
import {
  ProductHuntScraper,
  GitHubScraper,
  HackerNewsScraper,
  RedditScraper,
  GenericScraper,
  AIExtractorScraper,
  createDefaultScraperRegistry,
  buildFetchError,
  buildFetchSuccess,
} from "../../worker/lib/research-agent/scrapers";

describe("Scraper — base helpers", () => {
  it("buildFetchError returns a uniform error result", () => {
    const err = buildFetchError(401, "auth missing", 1000);
    expect(err.success).toBe(false);
    expect(err.statusCode).toBe(401);
    expect(err.error).toBe("auth missing");
    expect(err.content).toBe("");
    // duration is a number >=0
    expect(typeof err.fetchDurationMs).toBe("number");
  });

  it("buildFetchSuccess returns a uniform success result", () => {
    const ok = buildFetchSuccess("payload", "application/json", 1000);
    expect(ok.success).toBe(true);
    expect(ok.statusCode).toBe(200);
    expect(ok.content).toBe("payload");
    expect(ok.contentType).toBe("application/json");
    expect(ok.error).toBeUndefined();
  });
});

describe("ProductHuntScraper", () => {
  it("is not ready without a token", () => {
    const s = new ProductHuntScraper();
    expect(s.isReady({})).toBe(false);
  });

  it("is ready when PRODUCTHUNT_API_TOKEN is set", () => {
    const s = new ProductHuntScraper();
    expect(s.isReady({ PRODUCTHUNT_API_TOKEN: "abc" })).toBe(true);
  });

  it("returns error FetchResult when token missing", async () => {
    const s = new ProductHuntScraper();
    const r = await s.scrape({}, "anything");
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(401);
    expect(r.error).toMatch(/token not configured/i);
  });

  it("uses provided name", () => {
    expect(new ProductHuntScraper().name).toBe("producthunt");
  });
});

describe("GitHubScraper", () => {
  it("is always ready (search works unauthenticated)", () => {
    expect(new GitHubScraper().isReady({})).toBe(true);
    expect(new GitHubScraper().isReady({ GITHUB_API_TOKEN: "t" })).toBe(true);
  });
});

describe("HackerNewsScraper", () => {
  it("is always ready (Algolia search is public)", () => {
    expect(new HackerNewsScraper().isReady({})).toBe(true);
  });
});

describe("RedditScraper", () => {
  it("is always ready (falls back to public JSON without OAuth)", () => {
    expect(new RedditScraper().isReady({})).toBe(true);
  });
});

describe("GenericScraper", () => {
  it("is not ready without baseUrl on env", () => {
    const s = new GenericScraper();
    expect(s.isReady({})).toBe(false);
  });

  it("is ready when env.baseUrl is provided", () => {
    const s = new GenericScraper();
    expect(s.isReady({ baseUrl: "https://x.com" })).toBe(true);
  });

  it("returns error FetchResult when baseUrl missing", async () => {
    const r = await new GenericScraper().scrape({}, "q");
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toMatch(/baseUrl/i);
  });
});

describe("AIExtractorScraper — parsing", () => {
  function makeAI(response: unknown) {
    const ai = { run: vi.fn().mockResolvedValue(response) };
    const s = new AIExtractorScraper();
    return { ai, s };
  }

  it("is ready only when env.AI is bound", () => {
    expect(new AIExtractorScraper().isReady({})).toBe(false);
    expect(new AIExtractorScraper().isReady({ AI: {} as never })).toBe(true);
  });

  it("returns 503 error when env.AI missing", async () => {
    const r = await new AIExtractorScraper().scrape({}, "hello");
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(503);
  });

  it("returns empty array JSON for empty input", async () => {
    const ai = { run: vi.fn() };
    const r = await new AIExtractorScraper().scrape(
      { AI: ai as never },
      "   ",
    );
    expect(r.success).toBe(true);
    expect(r.content).toBe("[]");
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("extracts parsed JSON array from plain string response", async () => {
    const { ai, s } = makeAI(
      '[{"code":"ABC123","url":"https://x.com/i/ABC123","reward":"$20","confidence":0.9}]',
    );
    const r = await s.scrape({ AI: ai as never }, "site:reddit.com alpha");
    expect(r.success).toBe(true);
    expect(JSON.parse(r.content)).toEqual([
      {
        code: "ABC123",
        url: "https://x.com/i/ABC123",
        reward: "$20",
        confidence: 0.9,
      },
    ]);
  });

  it("strips markdown ```json fences before parsing", async () => {
    const { ai, s } = makeAI(
      "```json\n[{\"code\":\"XYZ\",\"url\":\"https://x.com/i/XYZ\",\"confidence\":0.7}]\n```",
    );
    const r = await s.scrape({ AI: ai as never }, "xyz");
    expect(r.success).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed[0].code).toBe("XYZ");
  });

  it("falls back to regex array extraction on malformed JSON", async () => {
    const { ai, s } = makeAI(
      'Sure, here is the result: [{"code":"A1","confidence":0.6}] done.',
    );
    const r = await s.scrape({ AI: ai as never }, "alpha");
    expect(r.success).toBe(true);
    expect(JSON.parse(r.content)[0].code).toBe("A1");
  });

  it("returns empty array on garbage response", async () => {
    const { ai, s } = makeAI("not json at all");
    const r = await s.scrape({ AI: ai as never }, "alpha");
    expect(r.success).toBe(true);
    expect(r.content).toBe("[]");
  });

  it("handles object-shaped AI response with `response` key", async () => {
    const { ai, s } = makeAI({ response: '[{"code":"R1","confidence":0.5}]' });
    const r = await s.scrape({ AI: ai as never }, "alpha");
    expect(JSON.parse(r.content)[0].code).toBe("R1");
  });

  it("returns 500 error when AI.run throws", async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error("rate limit")) };
    const r = await new AIExtractorScraper().scrape(
      { AI: ai as never },
      "alpha",
    );
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(500);
    expect(r.error).toMatch(/rate limit/);
  });

  it("truncates long input text", async () => {
    const long = "x".repeat(50_000);
    const ai = { run: vi.fn().mockResolvedValue("[]") };
    await new AIExtractorScraper({ maxTextChars: 64 }).scrape(
      { AI: ai as never },
      long,
    );
    const callArgs = ai.run.mock.calls[0]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = callArgs.messages.find((m) => m.role === "user");
    expect(userMessage?.content.length).toBeLessThan(long.length);
    expect(userMessage?.content.length).toBeGreaterThan(64); // includes domain prefix not just text
  });
});

describe("createDefaultScraperRegistry", () => {
  it("returns 5 default scrapers keyed by source name", () => {
    const reg = createDefaultScraperRegistry();
    expect(reg.size).toBe(5);
    expect(reg.get("producthunt")?.name).toBe("producthunt");
    expect(reg.get("github")?.name).toBe("github");
    expect(reg.get("hackernews")?.name).toBe("hackernews");
    expect(reg.get("reddit")?.name).toBe("reddit");
    expect(reg.get("company_site")?.name).toBe("company_site");
  });
});
