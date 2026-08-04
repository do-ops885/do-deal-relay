import { DurableObject } from "cloudflare:workers";
import type { Env, PipelineContext, PipelinePhase } from "../types";
import { executePhase, handleFailure } from "../pipeline-executor";
import { logger } from "../lib/global-logger";

// ============================================================================
// PipelineExecutorDO — Durable Execution POC (NEW-ARCH-1: ADR-020 Phase 1)
// ============================================================================

export interface PipelineCheckpoint {
  runId: string;
  phase: PipelinePhase;
  startTime: number;
  lastCheckpoint: number;
  phasesCompleted: number;
  dealsDiscovered: number;
  dealsPublished: number;
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
      this.checkpoint = {
        runId,
        phase: "init",
        startTime: Date.now(),
        lastCheckpoint: Date.now(),
        phasesCompleted: 0,
        dealsDiscovered: 0,
        dealsPublished: 0,
      };
    }

    const env = this.env as Env;
    let currentPhase: PipelinePhase = this.checkpoint.phase;

    const ctx: PipelineContext = {
      run_id: runId,
      trace_id: `do-${runId}`,
      start_time: this.checkpoint.startTime,
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

    const MAX_PHASES = 20;
    let dealsPublished = 0;

    try {
      for (let i = 0; i < MAX_PHASES; i++) {
        if (currentPhase === "finalize") break;

        this.checkpoint.phase = currentPhase;
        this.checkpoint.lastCheckpoint = Date.now();
        await this.ctx.storage.put("checkpoint", this.checkpoint);

        const next = await executePhase(currentPhase, ctx, env);

        // Track phase-specific metrics
        if (currentPhase === "discover")
          this.checkpoint.dealsDiscovered = ctx.candidates.length;
        if (currentPhase === "publish") dealsPublished = ctx.scored.length;

        // Handle failure paths
        if (
          next === "revert" ||
          next === "quarantine" ||
          next === "concurrency_abort" ||
          next === "retry" ||
          next === "skipped_locked"
        ) {
          await handleFailure(next, ctx, env);
          return {
            success: false,
            phase: "finalize",
            phasesCompleted: this.checkpoint.phasesCompleted,
            dealsPublished,
          };
        }

        this.checkpoint.phasesCompleted++;
        currentPhase = next;
      }

      await this.ctx.storage.delete("checkpoint");

      return {
        success: true,
        phase: "finalize",
        phasesCompleted: this.checkpoint.phasesCompleted,
        dealsPublished,
      };
    } catch (error) {
      this.checkpoint.error =
        error instanceof Error ? error.message : String(error);
      await this.ctx.storage.put("checkpoint", this.checkpoint);

      logger.error("Pipeline execution failed", {
        component: "pipeline-executor-do",
        runId,
        phase: currentPhase,
        error: this.checkpoint.error,
      });

      return {
        success: false,
        phase: "finalize",
        phasesCompleted: this.checkpoint.phasesCompleted,
        dealsPublished,
      };
    }
  }

  async getStatus(): Promise<PipelineCheckpoint | null> {
    return this.checkpoint;
  }

  async cancel(): Promise<void> {
    await this.ctx.storage.delete("checkpoint");
    this.checkpoint = null;
  }
}
