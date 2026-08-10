import { DurableObject } from "cloudflare:workers";
import type { Env, PipelineContext, PipelinePhase } from "../types";
import { executePhase, handleFailure } from "../pipeline-executor";
import { logger } from "../lib/global-logger";

// ============================================================================
// PipelineExecutorDO — Durable Execution POC (NEW-ARCH-1: ADR-020 Phase 1)
// ============================================================================

interface SerializedPipelineError {
  phase: string;
  message: string;
}

interface SerializedPipelineContext {
  run_id: string;
  trace_id: string;
  start_time: number;
  candidates: PipelineContext["candidates"];
  normalized: PipelineContext["normalized"];
  deduped: PipelineContext["deduped"];
  validated: PipelineContext["validated"];
  scored: PipelineContext["scored"];
  snapshot?: PipelineContext["snapshot"];
  previous_snapshot?: PipelineContext["previous_snapshot"];
  errors: SerializedPipelineError[];
  retry_count: number;
  metrics?: PipelineContext["metrics"];
}

export interface PipelineCheckpoint {
  runId: string;
  phase: PipelinePhase;
  startTime: number;
  lastCheckpoint: number;
  phasesCompleted: number;
  dealsDiscovered: number;
  dealsPublished: number;
  context: SerializedPipelineContext;
  error?: string;
}

export class PipelineExecutorDO extends DurableObject {
  private checkpoint: PipelineCheckpoint | null = null;

  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/execute"
    ) {
      return new Response("Not found", { status: 404 });
    }

    let body: { runId?: unknown };
    try {
      body = (await request.json()) as { runId?: unknown };
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (typeof body.runId !== "string" || body.runId.length === 0) {
      return Response.json({ error: "runId is required" }, { status: 400 });
    }

    const result = await this.executePipeline(body.runId);
    return Response.json(result);
  }

  async executePipeline(runId: string): Promise<{
    success: boolean;
    phase: PipelinePhase;
    phasesCompleted: number;
    dealsPublished: number;
  }> {
    const savedCheckpoint =
      await this.ctx.storage.get<PipelineCheckpoint>("checkpoint");
    if (savedCheckpoint && savedCheckpoint.runId === runId) {
      this.checkpoint = savedCheckpoint;
      logger.info("Resuming pipeline from checkpoint", {
        component: "pipeline-executor-do",
        runId,
        phase: savedCheckpoint.phase,
        phasesCompleted: savedCheckpoint.phasesCompleted,
      });
    } else {
      const startTime = Date.now();
      const initialContext = createInitialContext(runId, startTime);
      this.checkpoint = createCheckpoint(runId, initialContext);
      await this.ctx.storage.put("checkpoint", this.checkpoint);
    }

    const checkpoint = this.checkpoint;
    if (!checkpoint)
      throw new Error("Pipeline checkpoint initialization failed");

    const env = this.env as Env;
    let currentPhase: PipelinePhase = checkpoint.phase;
    const ctx = restorePipelineContext(checkpoint.context);
    let dealsPublished = checkpoint.dealsPublished;

    const maxPhases = 20;

    if (currentPhase === "finalize") {
      return {
        success: !checkpoint.error,
        phase: "finalize",
        phasesCompleted: checkpoint.phasesCompleted,
        dealsPublished,
      };
    }

    try {
      for (let i = 0; i < maxPhases; i++) {
        if (currentPhase === "finalize") break;

        const next = await executePhase(currentPhase, ctx, env);

        if (currentPhase === "discover") {
          checkpoint.dealsDiscovered = ctx.candidates.length;
        }
        if (currentPhase === "publish") {
          dealsPublished = ctx.scored.length;
        }

        if (
          next === "revert" ||
          next === "quarantine" ||
          next === "concurrency_abort" ||
          next === "retry" ||
          next === "skipped_locked"
        ) {
          await handleFailure(next, ctx, env);
          checkpoint.phase = "finalize";
          checkpoint.error = `Pipeline failed via ${next}`;
          checkpoint.dealsPublished = dealsPublished;
          checkpoint.lastCheckpoint = Date.now();
          checkpoint.context = serializePipelineContext(ctx);
          await this.ctx.storage.put("checkpoint", checkpoint);
          return {
            success: false,
            phase: "finalize",
            phasesCompleted: checkpoint.phasesCompleted,
            dealsPublished,
          };
        }

        // The context and next phase are committed together. A resumed DO
        // never starts a later phase with an empty in-memory context.
        checkpoint.phase = next;
        checkpoint.error = undefined;
        checkpoint.phasesCompleted++;
        checkpoint.dealsPublished = dealsPublished;
        checkpoint.lastCheckpoint = Date.now();
        checkpoint.context = serializePipelineContext(ctx);
        await this.ctx.storage.put("checkpoint", checkpoint);
        currentPhase = next;
      }

      if (currentPhase !== "finalize") {
        checkpoint.phase = currentPhase;
        checkpoint.error = "Pipeline phase limit reached before finalization";
        checkpoint.lastCheckpoint = Date.now();
        checkpoint.dealsPublished = dealsPublished;
        checkpoint.context = serializePipelineContext(ctx);
        await this.ctx.storage.put("checkpoint", checkpoint);
        return {
          success: false,
          phase: currentPhase,
          phasesCompleted: checkpoint.phasesCompleted,
          dealsPublished,
        };
      }

      await this.ctx.storage.delete("checkpoint");

      return {
        success: true,
        phase: "finalize",
        phasesCompleted: checkpoint.phasesCompleted,
        dealsPublished,
      };
    } catch (error) {
      checkpoint.error = error instanceof Error ? error.message : String(error);
      checkpoint.phase = currentPhase;
      checkpoint.lastCheckpoint = Date.now();
      checkpoint.dealsPublished = dealsPublished;
      checkpoint.context = serializePipelineContext(ctx);
      await this.ctx.storage.put("checkpoint", checkpoint);

      logger.error("Pipeline execution failed", {
        component: "pipeline-executor-do",
        runId,
        phase: currentPhase,
        error: checkpoint.error,
      });

      return {
        success: false,
        phase: "finalize",
        phasesCompleted: checkpoint.phasesCompleted,
        dealsPublished,
      };
    }
  }

  async getStatus(): Promise<PipelineCheckpoint | null> {
    if (!this.checkpoint) {
      this.checkpoint =
        (await this.ctx.storage.get<PipelineCheckpoint>("checkpoint")) ?? null;
    }
    return this.checkpoint;
  }

  async cancel(): Promise<void> {
    await this.ctx.storage.delete("checkpoint");
    this.checkpoint = null;
  }
}

function createInitialContext(
  runId: string,
  startTime: number,
): PipelineContext {
  return {
    run_id: runId,
    trace_id: `do-${runId}`,
    start_time: startTime,
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    snapshot: undefined,
    previous_snapshot: undefined,
    errors: [],
    retry_count: 0,
    metrics: undefined,
  };
}

function createCheckpoint(
  runId: string,
  context: PipelineContext,
): PipelineCheckpoint {
  const now = Date.now();
  return {
    runId,
    phase: "init",
    startTime: context.start_time,
    lastCheckpoint: now,
    phasesCompleted: 0,
    dealsDiscovered: 0,
    dealsPublished: 0,
    context: serializePipelineContext(context),
  };
}

function serializePipelineContext(
  context: PipelineContext,
): SerializedPipelineContext {
  return {
    run_id: context.run_id,
    trace_id: context.trace_id,
    start_time: context.start_time,
    candidates: context.candidates,
    normalized: context.normalized,
    deduped: context.deduped,
    validated: context.validated,
    scored: context.scored,
    snapshot: context.snapshot,
    previous_snapshot: context.previous_snapshot,
    errors: context.errors.map(({ phase, error }) => ({
      phase,
      message: error instanceof Error ? error.message : String(error),
    })),
    retry_count: context.retry_count,
    metrics: context.metrics,
  };
}

function restorePipelineContext(
  serialized: SerializedPipelineContext,
): PipelineContext {
  return {
    run_id: serialized.run_id,
    trace_id: serialized.trace_id,
    start_time: serialized.start_time,
    candidates: serialized.candidates ?? [],
    normalized: serialized.normalized ?? [],
    deduped: serialized.deduped ?? [],
    validated: serialized.validated ?? [],
    scored: serialized.scored ?? [],
    snapshot: serialized.snapshot,
    previous_snapshot: serialized.previous_snapshot,
    errors: (serialized.errors ?? []).map(({ phase, message }) => ({
      phase,
      error: new Error(message),
    })),
    retry_count: serialized.retry_count ?? 0,
    metrics: serialized.metrics,
  };
}
