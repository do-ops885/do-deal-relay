import { describe, it, expect } from "vitest";
import { MultiAgentOrchestrator } from "../../worker/lib/multi-agent";
import {
  handleTriggerWorkflow,
  handleGetWorkflowStatus,
} from "../../worker/routes/workflow";
import type { Env } from "../../worker/types";

describe("Multi-Agent Workflow", () => {
  describe("Orchestrator", () => {
    it("should execute all phases by default", async () => {
      const events: any[] = [];
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "test-1",
        onEvent: (e) => events.push(e),
      });

      const result = await orchestrator.execute();
      expect(result.status).toBe("completed");
      expect(result.phases_completed).toEqual([1, 2, 3, 4]);
      expect(events.some((e) => e.type === "workflow_started")).toBe(true);
      expect(events.some((e) => e.type === "workflow_completed")).toBe(true);
    });

    it("should skip phases if configured", async () => {
      const orchestrator = new MultiAgentOrchestrator({
        workflow_id: "test-2",
        skipPhases: [2, 4],
      });

      const result = await orchestrator.execute();
      expect(result.phases_completed).toEqual([1, 3]);
    });
  });

  describe("API Handlers", () => {
    const mockEnv = {} as Env;

    it("handleTriggerWorkflow should return 202 and workflow ID", async () => {
      const request = new Request("http://localhost/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: "api-test" }),
      });

      const response = await handleTriggerWorkflow(request, mockEnv);
      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.workflow_id).toBe("api-test");
    });

    it("handleGetWorkflowStatus should return 404 for unknown ID", async () => {
      const response = await handleGetWorkflowStatus("unknown", mockEnv);
      expect(response.status).toBe(404);
    });

    it("handleGetWorkflowStatus should return status for known ID", async () => {
      // First trigger it
      const triggerReq = new Request("http://localhost/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: "status-test" }),
      });
      await handleTriggerWorkflow(triggerReq, mockEnv);

      const response = await handleGetWorkflowStatus("status-test", mockEnv);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workflow_id).toBe("status-test");
      expect(body.status).toBeDefined();
    });
  });
});
