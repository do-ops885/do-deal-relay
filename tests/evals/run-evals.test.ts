/**
 * Eval Harness (IMP-5)
 *
 * Golden-case evaluation for the three AI-facing quality surfaces that
 * previously had no regression safety net:
 *
 *   1. alerts-matcher  — scoreDealAgainstQuery (FTS5-parity semantics)
 *   2. nlq-intent      — rule-based detectIntent (deterministic NLQ path)
 *   3. hybrid-fusion   — fuseHybridResults RRF ordering
 *
 * Each suite is a JSON fixture in tests/evals/fixtures/. The runner scores
 * every case, reports per-suite rates, and fails when a suite drops below
 * its declared threshold. Run via: npm run test:evals
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreDealAgainstQuery } from "../../worker/lib/alerts/matcher";
import { detectIntent } from "../../worker/lib/nlq/hybrid/rule-classifier";
import { fuseHybridResults } from "../../worker/lib/search/hybrid";
import type { Deal } from "../../worker/types/deal";
import type { SemanticSearchHit } from "../../worker/lib/search/client";
import type { DealSearchResult } from "../../worker/lib/d1/types";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")) as T;
}

// ============================================================================
// Fixture types
// ============================================================================

interface DealFixture {
  title: string;
  description: string;
  code: string;
  domain: string;
  category: string[];
  tags: string[];
}

interface MatcherCase {
  name: string;
  deal: DealFixture;
  query: string;
  expect: { minScore?: number; maxScore?: number };
}

interface IntentCase {
  name: string;
  query: string;
  expectIntent: string;
}

interface FusionCase {
  name: string;
  vectorHits: SemanticSearchHit[];
  ftsRows: Array<Partial<DealSearchResult> & { deal_id: string }>;
  expectTopIds: string[];
}

// ============================================================================
// Fixture -> domain object mapping
// ============================================================================

function toDeal(f: DealFixture): Deal {
  return {
    id: "eval_deal",
    code: f.code,
    title: f.title,
    description: f.description,
    url: `https://${f.domain}/deal`,
    source: {
      url: `https://${f.domain}`,
      domain: f.domain,
      discovered_at: "2026-01-01T00:00:00Z",
      trust_score: 0.8,
    },
    reward: { type: "cash", value: 0, currency: "USD" },
    expiry: { confidence: 1.0, type: "unknown" },
    metadata: {
      status: "active",
      confidence_score: 0.9,
      normalized_at: "2026-01-01T00:00:00Z",
      category: f.category,
      tags: f.tags,
    },
  };
}

function toFtsRow(
  f: Partial<DealSearchResult> & { deal_id: string },
): DealSearchResult {
  return {
    id: 1,
    title: f.title ?? "",
    description: f.description ?? "",
    domain: f.domain ?? "",
    code: f.code ?? "",
    url: f.url ?? "",
    reward_type: f.reward_type ?? "cash",
    reward_value: f.reward_value ?? 0,
    reward_currency: f.reward_currency ?? "USD",
    status: f.status ?? "active",
    category: f.category ?? [],
    tags: f.tags ?? [],
    confidence_score: f.confidence_score ?? 0.9,
    ...f,
  };
}

// ============================================================================
// Suites
// ============================================================================

describe("eval harness (IMP-5)", () => {
  it("alerts-matcher: golden scores within expected bounds", () => {
    const fixture = loadFixture<{
      thresholds: { passRate: number };
      cases: MatcherCase[];
    }>("alerts-matcher.eval.json");

    const failures: string[] = [];
    for (const c of fixture.cases) {
      const score = scoreDealAgainstQuery(toDeal(c.deal), c.query);
      if (c.expect.minScore !== undefined && score < c.expect.minScore) {
        failures.push(`${c.name}: score ${score} < min ${c.expect.minScore}`);
      }
      if (c.expect.maxScore !== undefined && score > c.expect.maxScore) {
        failures.push(`${c.name}: score ${score} > max ${c.expect.maxScore}`);
      }
    }

    const passRate =
      (fixture.cases.length - failures.length) / fixture.cases.length;
    console.log(
      `[eval:alerts-matcher] ${fixture.cases.length - failures.length}/${fixture.cases.length} passed (rate ${passRate.toFixed(2)}, threshold ${fixture.thresholds.passRate})`,
    );
    expect(failures).toEqual([]);
    expect(passRate).toBeGreaterThanOrEqual(fixture.thresholds.passRate);
  });

  it("nlq-intent: rule classifier accuracy above threshold", () => {
    const fixture = loadFixture<{
      thresholds: { accuracy: number };
      cases: IntentCase[];
    }>("nlq-intent.eval.json");

    const misses: string[] = [];
    for (const c of fixture.cases) {
      const intent = detectIntent(c.query.toLowerCase().trim());
      if (intent.primary !== c.expectIntent) {
        misses.push(
          `${c.name}: got "${intent.primary}", want "${c.expectIntent}"`,
        );
      }
    }

    const accuracy =
      (fixture.cases.length - misses.length) / fixture.cases.length;
    console.log(
      `[eval:nlq-intent] accuracy ${accuracy.toFixed(2)} (${fixture.cases.length - misses.length}/${fixture.cases.length}, threshold ${fixture.thresholds.accuracy})`,
    );
    expect(misses).toEqual([]);
    expect(accuracy).toBeGreaterThanOrEqual(fixture.thresholds.accuracy);
  });

  it("hybrid-fusion: RRF top-N ordering matches golden expectations", () => {
    const fixture = loadFixture<{
      thresholds: { topNAccuracy: number };
      cases: FusionCase[];
    }>("hybrid-fusion.eval.json");

    const misses: string[] = [];
    for (const c of fixture.cases) {
      const fused = fuseHybridResults(c.vectorHits, c.ftsRows.map(toFtsRow), {
        limit: 20,
      });
      const topIds = fused.slice(0, c.expectTopIds.length).map((r) => r.id);
      if (JSON.stringify(topIds) !== JSON.stringify(c.expectTopIds)) {
        misses.push(
          `${c.name}: got [${topIds.join(", ")}], want [${c.expectTopIds.join(", ")}]`,
        );
      }
    }

    const accuracy =
      (fixture.cases.length - misses.length) / fixture.cases.length;
    console.log(
      `[eval:hybrid-fusion] top-N accuracy ${accuracy.toFixed(2)} (${fixture.cases.length - misses.length}/${fixture.cases.length}, threshold ${fixture.thresholds.topNAccuracy})`,
    );
    expect(misses).toEqual([]);
    expect(accuracy).toBeGreaterThanOrEqual(fixture.thresholds.topNAccuracy);
  });
});
