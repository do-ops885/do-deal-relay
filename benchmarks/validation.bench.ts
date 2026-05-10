import { bench, describe } from "vitest";
import { validate } from "../worker/pipeline/validate";
import { generateTestDeals } from "./bench-utils";
import type { Env, PipelineContext } from "../worker/types";

describe("validation pipeline", () => {
  const deals100 = generateTestDeals(100);

  const mockEnv: Env = {
    DEALS_PROD: { get: async () => null } as any,
    DEALS_STAGING: {} as any,
    DEALS_LOG: {} as any,
    DEALS_LOCK: {} as any,
    DEALS_SOURCES: {} as any,
    AI_GATEWAY_URL: "http://mock-ai",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    TRUST_THRESHOLD: "0.3",
    NOTIFICATION_THRESHOLD: "0.8",
    ENABLE_VALIDATION_CACHE: "false",
  };

  const mockCtx: PipelineContext = {
    run_id: "test-run",
    trace_id: "test-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };

  bench("validate 100 deals", async () => {
    await validate(deals100, mockCtx, mockEnv);
  });
});
