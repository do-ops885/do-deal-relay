import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  discover,
  discoverSourceReadonly,
} from "../../../worker/pipeline/discover";
import { validatedFetch } from "../../../worker/lib/security";
import { flushValidationTally } from "../../../worker/lib/storage";
import type { Env, PipelineContext, SourceConfig } from "../../../worker/types";

vi.mock("../../../worker/lib/security", () => ({
  validatedFetch: vi.fn(),
}));

vi.mock("../../../worker/lib/storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/lib/storage")>();
  return { ...actual, flushValidationTally: vi.fn() };
});

const TEST_ENVIRONMENT = "test";
const TEST_TRUST_THRESHOLD = "0.3";
const PARITY_DOMAIN = "parity.com";
const PARITY_PATTERN = "/deals";
const PARITY_TRUST = 0.7;
const PARITY_LIMIT = 10;
const EXPECTED_DEAL_COUNT = 2;
const FLUSH_DISABLED_MESSAGE = "writes disabled in shadow path";
const FETCH_FAILURE_MESSAGE = "network down";

const mockValidatedFetch: ReturnType<typeof vi.fn> = vi.mocked(validatedFetch);
const mockFlush = vi.mocked(flushValidationTally);

interface FixtureDeal {
  code: string;
  url: string;
  title: string;
  reward_value: number;
}

function createParitySource(): SourceConfig {
  return {
    domain: PARITY_DOMAIN,
    url_patterns: [PARITY_PATTERN],
    trust_initial: PARITY_TRUST,
    classification: "probationary",
    active: true,
  };
}

function fixturePayload(): FixtureDeal[] {
  return [
    {
      code: "PARITY1",
      url: `https://${PARITY_DOMAIN}/invite/1`,
      title: "Parity Deal One",
      reward_value: 10,
    },
    {
      code: "PARITY2",
      url: `https://${PARITY_DOMAIN}/invite/2`,
      title: "Parity Deal Two",
      reward_value: 20,
    },
  ];
}

function createParityEnv(sources: SourceConfig[]): {
  env: Env;
  sourcesPut: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, unknown>([["registry", sources]]);
  const sourcesPut = vi.fn(
    async (key: string, value: string): Promise<void> => {
      store.set(key, JSON.parse(value) as unknown);
    },
  );
  const env = {
    DEALS_PROD: {
      get: vi.fn(async (_key: string): Promise<null> => null),
      put: vi.fn(async (_key: string, _value: string): Promise<void> => {}),
      delete: vi.fn(async (_key: string): Promise<void> => {}),
    } as unknown as KVNamespace,
    DEALS_STAGING: {} as unknown as KVNamespace,
    DEALS_LOG: {} as unknown as KVNamespace,
    DEALS_LOCK: {} as unknown as KVNamespace,
    DEALS_SOURCES: {
      get: vi.fn(
        async (key: string): Promise<unknown> => store.get(key) ?? null,
      ),
      put: sourcesPut,
      delete: vi.fn(async (key: string): Promise<void> => {
        store.delete(key);
      }),
    } as unknown as KVNamespace,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    DEALS_DB: {} as unknown as D1Database,
    TRUST_THRESHOLD: TEST_TRUST_THRESHOLD,
    ENVIRONMENT: TEST_ENVIRONMENT,
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;
  return { env, sourcesPut };
}

function createPipelineContext(): PipelineContext {
  return {
    run_id: "parity-run",
    trace_id: "parity-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };
}

function mockSuccessfulFetch(payload: unknown): void {
  mockValidatedFetch.mockResolvedValue({
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    text: async (): Promise<string> => JSON.stringify(payload),
  });
}

describe("discoverSourceReadonly parity", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should return counts matching the main path on the same fixture", async (): Promise<void> => {
    mockSuccessfulFetch(fixturePayload());
    mockFlush.mockResolvedValue(undefined);
    const { env } = createParityEnv([createParitySource()]);

    const readonly = await discoverSourceReadonly(
      createParitySource(),
      PARITY_LIMIT,
    );
    const main = await discover(env, createPipelineContext());

    expect(readonly.deal_count).toBe(EXPECTED_DEAL_COUNT);
    expect(readonly.error_count).toBe(0);
    expect(main.deals).toHaveLength(readonly.deal_count);
    expect(main.errors).toHaveLength(readonly.error_count);
    expect(readonly.sample_codes).toEqual(main.deals.map((deal) => deal.code));
  });

  it("should succeed with zero writes even when the flush path throws", async (): Promise<void> => {
    mockSuccessfulFetch(fixturePayload());
    mockFlush.mockRejectedValue(new Error(FLUSH_DISABLED_MESSAGE));
    const { env, sourcesPut } = createParityEnv([createParitySource()]);

    const readonly = await discoverSourceReadonly(
      createParitySource(),
      PARITY_LIMIT,
    );

    expect(readonly.deal_count).toBe(EXPECTED_DEAL_COUNT);
    expect(readonly.error_count).toBe(0);
    expect(mockFlush).not.toHaveBeenCalled();
    expect(sourcesPut).not.toHaveBeenCalled();
    expect(env).toBeDefined();
  });

  it("should show the main path needs the flush path that readonly skips", async (): Promise<void> => {
    mockSuccessfulFetch(fixturePayload());
    mockFlush.mockRejectedValue(new Error(FLUSH_DISABLED_MESSAGE));
    const { env } = createParityEnv([createParitySource()]);

    const main = await discover(env, createPipelineContext());

    expect(mockFlush).toHaveBeenCalled();
    expect(main.deals).toHaveLength(0);
    expect(main.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should mirror main-path errors on fetch failure", async (): Promise<void> => {
    mockValidatedFetch.mockRejectedValue(new Error(FETCH_FAILURE_MESSAGE));
    mockFlush.mockResolvedValue(undefined);
    const { env } = createParityEnv([createParitySource()]);

    const readonly = await discoverSourceReadonly(
      createParitySource(),
      PARITY_LIMIT,
    );
    const main = await discover(env, createPipelineContext());

    expect(readonly.deal_count).toBe(0);
    expect(readonly.error_count).toBe(1);
    expect(main.deals).toHaveLength(0);
    expect(main.errors).toHaveLength(readonly.error_count);
  });
});
