// End-to-end: the admin /metrics surface reports webhook queue health.
import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";
import {
  WEBHOOK_QUEUE_THRESHOLDS,
  type WebhookQueueHealth,
} from "../../worker/lib/webhook/health";

const ADMIN_KEY = "ddr_admin_test_key_123";
const authHeader = { "X-API-Key": ADMIN_KEY };

function createKv(storage: Map<string, string>) {
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const value = storage.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    list: vi.fn(async ({ prefix }: { prefix?: string } = {}) => ({
      keys: [...storage.keys()]
        .filter((key) => !prefix || key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    })),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("GET /metrics webhook queue health", () => {
  let storage: Map<string, string>;
  let env: Env;

  beforeEach(async () => {
    storage = new Map();
    const kv = createKv(storage);
    env = {
      DEALS_PROD: kv,
      DEALS_STAGING: kv,
      DEALS_LOG: kv,
      DEALS_LOCK: kv,
      DEALS_SOURCES: kv,
      WEBHOOK_API_KEYS: kv,
      DEALS_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      } as unknown as Env["DEALS_DB"],
      ENVIRONMENT: "test",
      TRUST_THRESHOLD: "0.3",
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      JWT_SECRET: "test-jwt-secret-32-chars-minimum-xyz",
      GITHUB_REPO: "test/repo",
    } as unknown as Env;

    storage.set(
      `apikey:${await sha256Hex(ADMIN_KEY)}`,
      JSON.stringify({ userId: "user_1", role: "admin" }),
    );
    storage.set("metrics:index", JSON.stringify([]));

    const stalePendingAt = new Date(
      Date.now() - WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS - 60_000,
    ).toISOString();
    storage.set(
      "webhook_delivery:evt_pending:sub_metrics",
      JSON.stringify({
        event_id: "evt_pending",
        subscription_id: "sub_metrics",
        status: "pending",
        attempts: [
          { attempt_number: 1, timestamp: stalePendingAt },
          { attempt_number: 2, timestamp: stalePendingAt },
        ],
        created_at: stalePendingAt,
      }),
    );
    storage.set(
      "webhook_dlq:evt_failed:sub_metrics",
      JSON.stringify({
        delivery: {
          event_id: "evt_failed",
          subscription_id: "sub_metrics",
          status: "failed",
        },
        event: { id: "evt_failed", type: "referral.created" },
        enqueued_at: new Date().toISOString(),
        retryable: true,
      }),
    );
  });

  it("returns the snapshot alongside the pipeline funnel", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/metrics?format=json", {
        headers: authHeader,
      }),
      env,
      { waitUntil: vi.fn(), passThroughException: vi.fn() } as never,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      funnel: unknown;
      webhook_queue: WebhookQueueHealth;
    };
    const health = body.webhook_queue;

    expect(body.funnel).toBeDefined();
    expect(health.dlq_depth).toBe(1);
    expect(health.sampled_deliveries).toBe(1);
    expect(health.retried_deliveries).toBe(1);
    expect(health.status).toBe("critical");
    expect(health.alerts.map((alert) => alert.kind)).toEqual([
      "dlq_depth",
      "pending_age",
    ]);
    expect(health.oldest_pending_age_ms).toBeGreaterThan(
      WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS,
    );
  });

  it("exports the same snapshot as Prometheus gauges", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/metrics", { headers: authHeader }),
      env,
      { waitUntil: vi.fn(), passThroughException: vi.fn() } as never,
    );

    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).toContain("webhook_queue_dlq_depth 1");
    expect(body).toContain("webhook_queue_alerts_active 2");
    expect(body).toContain("webhook_queue_oldest_pending_seconds ");
  });
});
