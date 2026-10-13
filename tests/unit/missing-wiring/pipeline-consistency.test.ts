/**
 * Missing-wiring sweep: stage-consistency guard rail.
 *
 * `checkConsistency` existed in worker/lib/guard-rails without a caller; the
 * stage phase now runs it between the scored batch and the staged snapshot and
 * logs a warning on divergence (read-after-write verification stays the hard
 * gate).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, PipelineContext, Deal } from "../../../worker/types";

const mocks = vi.hoisted(() => ({
  stage: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../../worker/pipeline/stage", () => ({
  stage: mocks.stage,
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: mocks.error,
    warn: mocks.warn,
    debug: mocks.debug,
  },
}));

import { executePhase } from "../../../worker/pipeline-executor";

function deal(id: string): Deal {
  return { id } as unknown as Deal;
}

function buildCtx(scoredIds: string[]): PipelineContext {
  return {
    run_id: "run-1",
    trace_id: "trace-1",
    scored: scoredIds.map(deal),
  } as unknown as PipelineContext;
}

const env = {} as unknown as Env;

describe("stage consistency guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns publish and stays quiet when the staged snapshot matches", async () => {
    const ctx = buildCtx(["a", "b"]);
    mocks.stage.mockResolvedValue({
      snapshot: { deals: [deal("a"), deal("b")] },
      verified: true,
    });

    const next = await executePhase("stage", ctx, env);

    expect(next).toBe("publish");
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("warns when staging drops more than half of the scored batch", async () => {
    const ctx = buildCtx(["a", "b", "c", "d"]);
    mocks.stage.mockResolvedValue({
      snapshot: { deals: [deal("a")] },
      verified: true,
    });

    const next = await executePhase("stage", ctx, env);

    expect(next).toBe("publish");
    expect(mocks.warn).toHaveBeenCalledWith(
      "Stage consistency check failed",
      expect.objectContaining({
        component: "state-machine",
        phase: "stage",
        run_id: "run-1",
      }),
    );
  });

  it("warns when staging adds deals", async () => {
    const ctx = buildCtx(["a"]);
    mocks.stage.mockResolvedValue({
      snapshot: { deals: [deal("a"), deal("b")] },
      verified: true,
    });

    await executePhase("stage", ctx, env);

    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it("still reverts when staging verification fails", async () => {
    const ctx = buildCtx(["a", "b"]);
    mocks.stage.mockResolvedValue({
      snapshot: { deals: [deal("a"), deal("b")] },
      verified: false,
    });

    const next = await executePhase("stage", ctx, env);

    expect(next).toBe("revert");
  });
});
