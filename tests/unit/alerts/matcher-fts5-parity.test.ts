/**
 * FTS5-Parity Matcher Tests (IMP-4, ADR-031 hardening)
 *
 * The alerts matcher implements FTS5 unicode61-style token semantics
 * in-memory: exact-token and explicit prefix (`token*`) matching, phrase
 * substring bonus, no query-side substring false positives.
 */

import { describe, it, expect } from "vitest";
import {
  scoreDealAgainstQuery,
  tokenizeDealText,
} from "../../../worker/lib/alerts/matcher";
import type { Deal } from "../../../worker/types/deal";

const sampleDeal: Deal = {
  id: "deal_1",
  code: "AWS500",
  title: "AWS Cloud Credits $500",
  description: "Get $500 in cloud credits for startups",
  url: "https://example.com/aws",
  source: {
    url: "https://example.com",
    domain: "example.com",
    discovered_at: "2026-09-20T00:00:00Z",
    trust_score: 0.9,
  },
  reward: { type: "cash", value: 500, currency: "USD" },
  expiry: { confidence: 1.0, type: "unknown" },
  metadata: {
    status: "active",
    confidence_score: 0.9,
    normalized_at: "2026-09-20T00:00:00Z",
    category: ["cloud", "hosting"],
    tags: ["aws", "credits"],
  },
};

describe("tokenizeDealText (FTS5 unicode61 parity)", () => {
  it("splits on punctuation, lowercases, drops empties", () => {
    expect(tokenizeDealText("AWS Cloud-Credits, $500!")).toEqual([
      "aws",
      "cloud",
      "credits",
      "500",
    ]);
  });
});

describe("scoreDealAgainstQuery FTS5 parity", () => {
  it("exact-token AND match scores 1.0 (phrase hit)", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "cloud credits")).toBe(1.0);
  });

  it("no substring false positives: 'art' does not match 'startups'", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "art")).toBe(0);
  });

  it("no substring false positives: 'car' does not match 'cardano'", () => {
    const deal: Deal = {
      ...sampleDeal,
      title: "Cardano staking bonus",
      description: "Earn rewards on cardano",
      code: "ADA10",
      metadata: { ...sampleDeal.metadata, category: [], tags: [] },
    };
    expect(scoreDealAgainstQuery(deal, "car")).toBe(0);
  });

  it("prefix token matches token prefixes: 'cred*' hits 'credits'", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "cred*")).toBe(1.0);
  });

  it("prefix token with too-short prefix does not match", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "c*")).toBe(0);
  });

  it("partial token ratio for multi-token queries (no boost tokens)", () => {
    // 'startups' is a description token; 'vpn' misses -> 1/2, no boost.
    const score = scoreDealAgainstQuery(sampleDeal, "startups vpn");
    expect(score).toBeCloseTo(0.5, 5);
  });

  it("domain/category boost stacks on partial ratio (legacy behavior pinned)", () => {
    // 'cloud' + 'credits' match, 'vpn' misses -> 2/3 + 0.3 boost.
    const score = scoreDealAgainstQuery(sampleDeal, "cloud credits vpn");
    expect(score).toBeCloseTo(2 / 3 + 0.3, 5);
  });

  it("exact code token matches (aws500)", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "aws500")).toBe(1.0);
  });

  it("code without exact token does not match (aws is a tag token, so it does)", () => {
    // 'aws' is a tag token -> exact match. 'aw' is not a token at all.
    expect(scoreDealAgainstQuery(sampleDeal, "aw")).toBe(0);
  });

  it("domain/category boost still applies on partial token match", () => {
    // 'hosting' is a category token; 'vpn' misses. ratio 0.5 + 0.3 boost.
    const score = scoreDealAgainstQuery(sampleDeal, "hosting vpn");
    expect(score).toBeCloseTo(0.8, 5);
  });

  it("empty and whitespace queries score 0", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "")).toBe(0);
    expect(scoreDealAgainstQuery(sampleDeal, "   ")).toBe(0);
  });

  it("single-char query tokens are ignored (FTS5 min token parity)", () => {
    expect(scoreDealAgainstQuery(sampleDeal, "a b c")).toBe(0);
  });
});
