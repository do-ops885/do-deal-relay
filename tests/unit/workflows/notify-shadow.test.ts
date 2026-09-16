import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  planNotifyReadonly,
  notifyStepName,
  summarizeNotifyReadonly,
} from "../../../worker/workflows/notify-shadow";
import { filterHighValueDeals } from "../../../worker/lib/high-value-notifier";
import { CONFIG } from "../../../worker/config";
import type { ShadowSampleKey } from "../../../worker/pipeline/discover";
import type { Deal, Env } from "../../../worker/types";

const RUN_ID = "wave3-run";
const THRESHOLD = 100;
const HIGH_REWARD = 150;
const AT_THRESHOLD = 100;
const LOW_REWARD = 20;

function createKey(
  domain: string,
  name: string,
  reward_value: number | null,
): ShadowSampleKey {
  return {
    url: `https://${domain}/deal/${name}`,
    fingerprint: `fp-${name}`,
    reward_value,
  };
}

function createNotifyEnv(threshold?: string): Env {
  return {
    ...(threshold !== undefined ? { NOTIFICATION_THRESHOLD: threshold } : {}),
  } as unknown as Env;
}

function createDeal(id: string, value: number | null): Deal {
  return {
    id,
    code: id,
    url: `https://deals.com/${id}`,
    reward: { type: "cash", value },
  } as unknown as Deal;
}

describe("notifyStepName", () => {
  it("should build deterministic names without timestamps or randomness", (): void => {
    expect(notifyStepName(RUN_ID)).toBe("notify-dry-run-wave3-run");
    expect(notifyStepName(RUN_ID)).toBe(notifyStepName(RUN_ID));
  });

  it("should sanitize unsafe run id characters in step names", (): void => {
    expect(notifyStepName("run/1:2")).toBe("notify-dry-run-run-1-2");
  });
});

describe("summarizeNotifyReadonly", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should count only rewards strictly above the threshold", (): void => {
    const keys = [
      createKey("a.com", "high", HIGH_REWARD),
      createKey("a.com", "at", AT_THRESHOLD),
      createKey("a.com", "low", LOW_REWARD),
      createKey("a.com", "null", null),
    ];

    const summary = summarizeNotifyReadonly(keys, THRESHOLD);

    expect(summary.checked).toBe(4);
    expect(summary.would_notify).toBe(1);
    expect(summary.threshold).toBe(THRESHOLD);
    expect(summary.by_source).toEqual({ "a.com": 4 });
  });

  it("should bucket invalid urls under unknown without throwing", (): void => {
    const keys: ShadowSampleKey[] = [
      { url: "not-a-url", fingerprint: "fp-bad", reward_value: HIGH_REWARD },
    ];

    const summary = summarizeNotifyReadonly(keys, THRESHOLD);

    expect(summary.checked).toBe(1);
    expect(summary.would_notify).toBe(1);
    expect(summary.by_source).toEqual({ unknown: 1 });
  });

  it("should match the main high-value filter decision", (): void => {
    const deals = [
      createDeal("high", HIGH_REWARD),
      createDeal("at", AT_THRESHOLD),
      createDeal("low", LOW_REWARD),
      createDeal("null", null),
    ];
    const keys = deals.map((deal) => ({
      url: deal.url,
      fingerprint: deal.id,
      reward_value:
        typeof deal.reward.value === "number" ? deal.reward.value : null,
    }));

    const summary = summarizeNotifyReadonly(keys, THRESHOLD);
    const main = filterHighValueDeals(deals, THRESHOLD);

    expect(summary.would_notify).toBe(main.length);
  });
});

describe("planNotifyReadonly", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should resolve the threshold from env without sending anything", async (): Promise<void> => {
    const keys = [createKey("a.com", "high", HIGH_REWARD)];

    const summary = await planNotifyReadonly(createNotifyEnv("100"), keys);

    expect(summary.checked).toBe(1);
    expect(summary.would_notify).toBe(1);
    expect(summary.threshold).toBe(100);
  });

  it("should fall back to the configured default threshold", async (): Promise<void> => {
    const keys = [createKey("a.com", "high", HIGH_REWARD)];

    const summary = await planNotifyReadonly(createNotifyEnv(), keys);

    expect(summary.threshold).toBe(CONFIG.HIGH_VALUE_THRESHOLD);
    expect(summary.would_notify).toBe(
      HIGH_REWARD > CONFIG.HIGH_VALUE_THRESHOLD ? 1 : 0,
    );
  });
});
