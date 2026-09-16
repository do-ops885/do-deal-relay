import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PipelineWorkflow,
  pipelineStepName,
} from "../../../worker/workflows/pipeline-workflow";
import { maybeTriggerPipelineWorkflow } from "../../../worker/workflows/pipeline-trigger";
import { executePhase, handleFailure } from "../../../worker/pipeline-executor";
import { acquireLock, releaseLock, extendLock } from "../../../worker/lib/lock";
import { notify } from "../../../worker/notify";
import { isFeatureEnabled } from "../../../worker/lib/feature-flags";
import type {
  Deal,
  Env,
  FailurePath,
  PipelineContext,
  PipelinePhase,
} from "../../../worker/types";

vi.mock("../../../worker/pipeline-executor", () => ({
  executePhase: vi.fn(),
  handleFailure: vi.fn(),
}));

vi.mock("../../../worker/lib/lock", () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  extendLock: vi.fn(),
}));

vi.mock("../../../worker/notify", () => ({
  notify: vi.fn(),
}));

vi.mock("../../../worker/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));

const RUN_ID = "cutover-1";
const CRON = "0 */6 * * *";
const FLAG_NAME = "workflow_pipeline_cutover";
const TRIGGER_FAILURE = "binding exploded";

type PipelineRunFn = typeof PipelineWorkflow.prototype.run;
type PipelineRunEvent = Parameters<PipelineRunFn>[0];
type PipelineRunStep = Parameters<PipelineRunFn>[1];

const mockExecutePhase = vi.mocked(executePhase);
const mockHandleFailure = vi.mocked(handleFailure);
const mockAcquireLock = vi.mocked(acquireLock);
const mockReleaseLock = vi.mocked(releaseLock);
const mockExtendLock = vi.mocked(extendLock);
const mockNotify = vi.mocked(notify);
const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled);

const NEXT_BY_PHASE: Record<string, PipelinePhase | FailurePath> = {
  discover: "normalize",
  normalize: "dedupe",
  dedupe: "validate",
  validate: "score",
  score: "stage",
  stage: "publish",
  publish: "verify",
  verify: "finalize",
  finalize: "finalize",
};

function createDeal(id: string): Deal {
  return {
    id,
    code: id,
    url: `https://deals.com/${id}`,
    reward: { type: "cash", value: 10 },
  } as unknown as Deal;
}

function mockHappyPhases(): void {
  mockExecutePhase.mockImplementation(
    async (
      phase: PipelinePhase,
      ctx: PipelineContext,
    ): Promise<PipelinePhase | FailurePath> => {
      if (phase === "discover") {
        ctx.candidates = [createDeal("deal-1")];
      } else if (phase === "normalize") {
        ctx.normalized = ctx.candidates;
      } else if (phase === "dedupe") {
        ctx.deduped = ctx.normalized;
      } else if (phase === "validate") {
        ctx.validated = ctx.deduped;
      } else if (phase === "score") {
        ctx.scored = ctx.validated;
      }
      const next = NEXT_BY_PHASE[phase];
      return next ?? "finalize";
    },
  );
}

function createWorkflowEnv(): {
  env: Env;
  kvPut: ReturnType<typeof vi.fn>;
  kvDelete: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, string>();
  const kvPut = vi.fn(async (key: string, value: string): Promise<void> => {
    store.set(key, value);
  });
  const kvDelete = vi.fn(async (key: string): Promise<void> => {
    store.delete(key);
  });
  const kvGet = vi.fn(async (key: string): Promise<unknown> => {
    const raw = store.get(key);
    if (raw === undefined) {
      if (key === "staging:snapshot") {
        return { snapshot_hash: "staging-1" };
      }
      return null;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  });
  const env = {
    DEALS_STAGING: { get: kvGet, put: kvPut, delete: kvDelete },
    DEALS_LOG: {
      get: vi.fn(async (): Promise<null> => null),
      put: vi.fn(async (): Promise<void> => {}),
    },
    DEALS_DB: {},
  } as unknown as Env;
  return { env, kvPut, kvDelete };
}

async function driveRun(env: Env): Promise<{
  names: string[];
  result: Awaited<ReturnType<PipelineRunFn>>;
}> {
  const names: string[] = [];
  const stubStep = {
    do: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      names.push(name);
      return fn();
    },
  } as unknown as PipelineRunStep;
  const host = Object.assign(
    Object.create(PipelineWorkflow.prototype) as PipelineWorkflow,
    { env },
  );
  const event = {
    payload: { run_id: RUN_ID, cron: CRON },
  } as unknown as PipelineRunEvent;
  const result = await PipelineWorkflow.prototype.run.call(
    host,
    event,
    stubStep,
  );
  return { names, result };
}

describe("pipelineStepName", () => {
  it("should build deterministic names without timestamps or randomness", (): void => {
    expect(pipelineStepName("discover", RUN_ID)).toBe(`wf-discover-${RUN_ID}`);
    expect(pipelineStepName("discover", RUN_ID)).toBe(
      pipelineStepName("discover", RUN_ID),
    );
  });

  it("should sanitize unsafe run id characters in step names", (): void => {
    expect(pipelineStepName("discover", "run/1:2")).toBe("wf-discover-run-1-2");
  });
});

describe("PipelineWorkflow run", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
    mockAcquireLock.mockResolvedValue(true);
    mockReleaseLock.mockResolvedValue(undefined);
    mockExtendLock.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(true);
    mockHappyPhases();
  });

  it("should run all phase steps and release the lock on success", async (): Promise<void> => {
    const { env, kvPut, kvDelete } = createWorkflowEnv();

    const { names, result } = await driveRun(env);

    expect(names).toEqual([
      pipelineStepName("init", RUN_ID),
      pipelineStepName("discover", RUN_ID),
      pipelineStepName("validate", RUN_ID),
      pipelineStepName("score", RUN_ID),
      pipelineStepName("stage", RUN_ID),
      pipelineStepName("publish", RUN_ID),
      pipelineStepName("finalize", RUN_ID),
      pipelineStepName("release", RUN_ID),
    ]);
    expect(result).toEqual({ success: true, phase: "finalize" });
    expect(mockAcquireLock).toHaveBeenCalledTimes(1);
    expect(mockReleaseLock).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(
      kvPut.mock.calls.some(([key]) => String(key).startsWith(`wf:${RUN_ID}:`)),
    ).toBe(true);
    expect(kvDelete).toHaveBeenCalled();
  });

  it("should run failure handling and still release on a revert path", async (): Promise<void> => {
    mockExecutePhase.mockImplementation(
      async (
        phase: PipelinePhase,
        ctx: PipelineContext,
      ): Promise<PipelinePhase | FailurePath> => {
        if (phase === "discover") {
          ctx.candidates = [createDeal("deal-1")];
          return "normalize";
        }
        if (phase === "normalize") {
          ctx.normalized = ctx.candidates;
          return "dedupe";
        }
        if (phase === "dedupe") {
          ctx.deduped = [];
          return "validate";
        }
        if (phase === "validate") {
          ctx.validated = [];
          return "revert";
        }
        return "finalize";
      },
    );
    const { env } = createWorkflowEnv();

    const { names, result } = await driveRun(env);

    expect(names).toContain(pipelineStepName("failure", RUN_ID));
    expect(names).toContain(pipelineStepName("release", RUN_ID));
    expect(mockHandleFailure).toHaveBeenCalledTimes(1);
    expect(mockHandleFailure.mock.calls[0]?.[0]).toBe("revert");
    expect(mockReleaseLock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it("should notify critical and skip the run when the lock is held", async (): Promise<void> => {
    mockAcquireLock.mockRejectedValue(new Error("locked"));
    const { env } = createWorkflowEnv();

    const { names, result } = await driveRun(env);

    expect(names).toEqual([
      pipelineStepName("init", RUN_ID),
      pipelineStepName("failure", RUN_ID),
    ]);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0]?.[1]).toMatchObject({
      type: "system_error",
      severity: "critical",
    });
    expect(mockReleaseLock).not.toHaveBeenCalled();
    expect(mockExecutePhase).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.phase).toBe("init");
  });

  it("should isolate trace ids per run", async (): Promise<void> => {
    const { env } = createWorkflowEnv();

    await driveRun(env);
    const firstTrace = mockAcquireLock.mock.calls[0]?.[2];
    vi.clearAllMocks();
    mockAcquireLock.mockResolvedValue(true);
    mockHappyPhases();
    await driveRun(env);
    const secondTrace = mockAcquireLock.mock.calls[0]?.[2];

    expect(firstTrace).toBeDefined();
    expect(secondTrace).toBeDefined();
    expect(firstTrace).not.toBe(secondTrace);
  });
});

describe("maybeTriggerPipelineWorkflow", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  function createTriggerEnv(binding?: unknown): Env {
    const partial: Record<string, unknown> = {};
    if (binding !== undefined) {
      partial.PIPELINE_WORKFLOW = binding;
    }
    return partial as unknown as Env;
  }

  it("should skip without touching the binding when the flag is disabled", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(false);
    const create = vi.fn(async (): Promise<unknown> => ({}));
    const env = createTriggerEnv({ create });

    const result = await maybeTriggerPipelineWorkflow(env, RUN_ID, CRON);

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(FLAG_NAME, env);
    expect(result).toEqual({ triggered: false, reason: "flag_disabled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("should report binding_missing when the flag is on but no binding exists", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(true);

    const result = await maybeTriggerPipelineWorkflow(
      createTriggerEnv(),
      RUN_ID,
      CRON,
    );

    expect(result).toEqual({ triggered: false, reason: "binding_missing" });
  });

  it("should create a deterministic instance id with run params", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(true);
    const create = vi.fn(async (): Promise<unknown> => ({}));
    const env = createTriggerEnv({ create });

    const result = await maybeTriggerPipelineWorkflow(env, RUN_ID, CRON);

    expect(result).toEqual({ triggered: true, reason: "created" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      id: `pipeline-${RUN_ID}`,
      params: { run_id: RUN_ID, cron: CRON },
    });
  });

  it("should isolate trigger failures into an error result", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(true);
    const create = vi.fn(async (): Promise<unknown> => {
      throw new Error(TRIGGER_FAILURE);
    });
    const env = createTriggerEnv({ create });

    const result = await maybeTriggerPipelineWorkflow(env, RUN_ID, CRON);

    expect(result).toEqual({ triggered: false, reason: "error" });
  });
});
