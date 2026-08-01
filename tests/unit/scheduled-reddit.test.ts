import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../worker/types";

const { checkAndCleanPostsMock, executePipelineMock } = vi.hoisted(() => ({
  checkAndCleanPostsMock: vi.fn(),
  executePipelineMock: vi.fn(),
}));

vi.mock("../../worker/reddit", () => ({
  checkAndCleanPosts: checkAndCleanPostsMock,
}));

vi.mock("../../worker/state-machine", () => ({
  executePipeline: executePipelineMock,
}));

import { handleScheduled } from "../../worker/scheduled";

describe("Reddit moderation schedule", () => {
  it("handleScheduled should isolate moderation from the discovery pipeline", async () => {
    checkAndCleanPostsMock.mockResolvedValue({
      checked: 1,
      deleted: 0,
      skipped: false,
      errors: 0,
    });
    const event = {
      cron: "*/30 * * * *",
      scheduledTime: Date.now(),
    } as ScheduledEvent;
    const env = {} as Env;

    await handleScheduled(event, env);

    expect(checkAndCleanPostsMock).toHaveBeenCalledWith(env);
    expect(executePipelineMock).not.toHaveBeenCalled();
  });
});
