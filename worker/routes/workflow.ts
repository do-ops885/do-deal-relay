import { z } from "zod";
import type { Env } from "../types";
import { jsonResponse } from "./utils";
import { MultiAgentOrchestrator, WorkflowEvent } from "../lib/multi-agent";

// ============================================================================
// Schemas
// ============================================================================

export const TriggerWorkflowSchema = z.object({
  workflow_id: z.string().optional(),
  dry_run: z.boolean().optional().default(false),
  skip_phases: z.array(z.number()).optional().default([]),
});

export type TriggerWorkflowBody = z.infer<typeof TriggerWorkflowSchema>;

// In-memory store for active/recent workflows (reset on worker restart)
const workflowState = new Map<
  string,
  {
    status: string;
    events: WorkflowEvent[];
    result?: any;
  }
>();

// ============================================================================
// Handlers
// ============================================================================

export async function handleTriggerWorkflow(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as TriggerWorkflowBody;
    const validation = TriggerWorkflowSchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse(
        { error: "Invalid request body", details: validation.error.errors },
        400,
        request,
      );
    }

    const workflowId = body.workflow_id || `wf-${Date.now()}`;

    // Start workflow asynchronously
    const orchestrator = new MultiAgentOrchestrator({
      workflow_id: workflowId,
      dryRun: body.dry_run,
      skipPhases: body.skip_phases,
      onEvent: (event) => {
        const state = workflowState.get(workflowId) || {
          status: "running",
          events: [],
        };
        state.events.push(event);
        if (event.type === "workflow_completed") state.status = "completed";
        if (event.type === "workflow_failed") state.status = "failed";
        workflowState.set(workflowId, state);
      },
    });

    workflowState.set(workflowId, { status: "running", events: [] });

    // Trigger execution
    orchestrator.execute().then((result) => {
      const state = workflowState.get(workflowId);
      if (state) {
        state.result = result;
        workflowState.set(workflowId, state);
      }
    });

    return jsonResponse(
      {
        success: true,
        workflow_id: workflowId,
        status: "triggered",
        message: "Workflow execution started in background",
      },
      202,
      request,
    );
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to trigger workflow",
        message: (error as Error).message,
      },
      500,
      request,
    );
  }
}

export async function handleGetWorkflowStatus(
  workflowId: string,
  env: Env,
  request?: Request,
): Promise<Response> {
  const state = workflowState.get(workflowId);

  if (!state) {
    return jsonResponse({ error: "Workflow not found" }, 404, request);
  }

  return jsonResponse(
    {
      workflow_id: workflowId,
      status: state.status,
      events_count: state.events.length,
      recent_events: state.events.slice(-5),
      result: state.result,
    },
    200,
    request,
  );
}
