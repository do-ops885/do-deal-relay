import { describe, it, expect, vi, beforeEach } from "vitest";
import { maybeTriggerShadowDiscovery } from "../../../worker/workflows/shadow-trigger";
import { isFeatureEnabled } from "../../../worker/lib/feature-flags";
import type { Env } from "../../../worker/types";

vi.mock("../../../worker/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));

const RUN_ID = "run-7";
const FLAG_NAME = "workflow_shadow_discovery";
const TRIGGER_FAILURE = "boom";

interface WorkflowCreateArgs {
  id: string;
  params: { run_id: string };
}

interface WorkflowCreateResult {
  id: string;
}

interface FakeWorkflowBinding {
  create: (args: WorkflowCreateArgs) => Promise<WorkflowCreateResult>;
}

const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled);

function createRecordingBinding(): {
  binding: FakeWorkflowBinding;
  calls: WorkflowCreateArgs[];
} {
  const calls: WorkflowCreateArgs[] = [];
  return {
    calls,
    binding: {
      create: async (
        args: WorkflowCreateArgs,
      ): Promise<WorkflowCreateResult> => {
        calls.push(args);
        return { id: args.id };
      },
    },
  };
}

function createTriggerEnv(binding?: FakeWorkflowBinding): Env {
  const partial: Record<string, unknown> = {};
  if (binding !== undefined) {
    partial.DISCOVERY_WORKFLOW = binding;
  }
  return partial as unknown as Env;
}

describe("maybeTriggerShadowDiscovery", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should skip without touching the binding when the flag is disabled", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(false);
    const recorder = createRecordingBinding();
    const env: Env = createTriggerEnv(recorder.binding);

    const result = await maybeTriggerShadowDiscovery(env, RUN_ID);

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(FLAG_NAME, env);
    expect(result).toEqual({ triggered: false, reason: "flag_disabled" });
    expect(recorder.calls).toHaveLength(0);
  });

  it("should report binding_missing when the flag is on but no binding exists", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(true);

    const result = await maybeTriggerShadowDiscovery(
      createTriggerEnv(),
      RUN_ID,
    );

    expect(result).toEqual({ triggered: false, reason: "binding_missing" });
  });

  it("should create one instance named shadow-<run_id> with the run params", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(true);
    const recorder = createRecordingBinding();

    const result = await maybeTriggerShadowDiscovery(
      createTriggerEnv(recorder.binding),
      RUN_ID,
    );

    expect(result).toEqual({ triggered: true, reason: "created" });
    expect(recorder.calls).toEqual([
      { id: `shadow-${RUN_ID}`, params: { run_id: RUN_ID } },
    ]);
  });

  it("should isolate binding failures instead of throwing", async (): Promise<void> => {
    mockIsFeatureEnabled.mockResolvedValue(true);
    const failing: FakeWorkflowBinding = {
      create: async (
        _args: WorkflowCreateArgs,
      ): Promise<WorkflowCreateResult> => {
        throw new Error(TRIGGER_FAILURE);
      },
    };

    const result = await maybeTriggerShadowDiscovery(
      createTriggerEnv(failing),
      RUN_ID,
    );

    expect(result).toEqual({ triggered: false, reason: "error" });
  });
});
