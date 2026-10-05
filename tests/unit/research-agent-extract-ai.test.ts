/**
 * NI-2 (ADR-032): extractWithAI must be fail-closed on the
 * ai_extractor_scraper feature flag. Historically the flag was declared
 * off but never read, so LLM extraction ran whenever env.AI was bound.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractWithAI } from "../../worker/lib/research-agent/compliance-log";
import { setFeatureFlag } from "../../worker/lib/feature-flags";
import type { Env } from "../../worker/types";

// Compliance logging is out of scope for the gate tests; keep it silent.
vi.mock("../../worker/lib/eu-ai-act-logger", () => ({
  createComplianceLogger: () => ({
    logOperation: vi.fn(async () => undefined),
  }),
  hashInputData: vi.fn(async () => "hash"),
}));

type MockKV = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function buildEnv(): {
  env: Env;
  kv: Map<string, unknown>;
  aiRun: ReturnType<typeof vi.fn>;
} {
  const kv = new Map<string, unknown>();
  const aiRun = vi.fn(async () => ({
    response: JSON.stringify([
      {
        code: "SAVE20NOW",
        url: "https://example.com/invite/SAVE20NOW",
        reward: "$20 credit",
        confidence: 0.9,
      },
    ]),
  }));
  const dealsLock: MockKV = {
    get: vi.fn(async <T>(key: string, type?: string): Promise<T | null> => {
      const value = kv.get(key);
      if (value === undefined) return null;
      if (type === "json" && typeof value === "string") {
        return JSON.parse(value) as T;
      }
      return value as T;
    }),
    put: vi.fn(async (key: string, value: string) => {
      kv.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      kv.delete(key);
    }),
  };
  const env = {
    DEALS_LOCK: dealsLock,
    AI: { run: aiRun },
  } as unknown as Env;
  return { env, kv, aiRun };
}

describe("extractWithAI flag gating (NI-2, ADR-032)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] and never calls Workers AI when the flag is missing (default off)", async () => {
    const { env, aiRun } = buildEnv();
    const codes = await extractWithAI(
      env,
      "Use code SAVE20NOW for $20",
      "example.com",
    );
    expect(codes).toEqual([]);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it("returns [] when the flag is explicitly disabled", async () => {
    const { env, aiRun } = buildEnv();
    await setFeatureFlag({ name: "ai_extractor_scraper", enabled: false }, env);
    const codes = await extractWithAI(
      env,
      "Use code SAVE20NOW for $20",
      "example.com",
    );
    expect(codes).toEqual([]);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it("extracts codes when the flag is enabled", async () => {
    const { env, aiRun } = buildEnv();
    await setFeatureFlag({ name: "ai_extractor_scraper", enabled: true }, env);
    const codes = await extractWithAI(
      env,
      "Use code SAVE20NOW for $20",
      "example.com",
    );
    expect(aiRun).toHaveBeenCalledTimes(1);
    expect(codes).toHaveLength(1);
    expect(codes[0]?.code).toBe("SAVE20NOW");
    expect(codes[0]?.source).toBe("ai_extractor");
  });

  it("returns [] for empty content even when enabled", async () => {
    const { env, aiRun } = buildEnv();
    await setFeatureFlag({ name: "ai_extractor_scraper", enabled: true }, env);
    const codes = await extractWithAI(env, "   ", "example.com");
    expect(codes).toEqual([]);
    expect(aiRun).not.toHaveBeenCalled();
  });
});
