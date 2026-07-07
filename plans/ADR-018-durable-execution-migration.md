# ADR-018: Durable Execution Migration for Long-Running Pipelines

**Status**: Proposed
**Created**: 2026-07-07
**Version**: 0.1.8
**Decision Maker**: do-deal-relay Platform Team
**Type**: Architecture Migration

---

## Context

The pipeline executes 10 phases sequentially within a single Cloudflare Workers request. Workers have a **30-second CPU limit**. Complex discoveries with many sources can hit the timeout ceiling. Currently, no checkpointing exists — if a Worker dies at Phase 7, all progress is lost.

Cloudflare offers two durable execution primitives:
1. **Agents SDK `runFiber()`** — GA, unified architecture (April 2026)
2. **Cloudflare Workflows** — multi-step durable execution (GA via Agents SDK v0.3.7+)

Both survive eviction, code deploys, and crashes.

---

## Decision Drivers

1. **30s CPU Limit**: `discover` and `validate` phases can exceed limits
2. **Checkpoint/Resume**: Dying mid-pipeline loses all progress
3. **Retry Semantics**: Failed phases should retry independently
4. **Cost Efficiency**: Avoid wasted compute on full restart

---

## Current State

```
executePipeline() → init → discover → normalize → dedupe → validate
                    → score → stage → publish → verify → finalize
```

| Scenario | Current | Desired |
|----------|---------|---------|
| Eviction at Phase 5 | Full restart from Phase 1 | Resume from Phase 5 |
| API timeout at Phase 2 | Retry from Phase 1 | Retry Phase 2 only |
| KV write failure | Revert all | Resume Phase 8 |

---

## Option A: `runFiber()` (Recommended)

`runFiber()` registers a task in `cf_agents_runs`, keeps the Agent alive, and is **eviction-survivable**. Recovery is automatic via alarm system. `this.stash()` checkpoints via AsyncLocalStorage.

```typescript
// worker/durable-objects/pipeline-agent.ts
import { Agent } from "agents";

export class PipelineAgent extends Agent<Env, PipelineState> {
  initialState: PipelineState = {
    run_id: "", current_phase: "init", phase_index: 0,
    status: "idle", error: undefined,
  };

  async startPipeline(params: { run_id: string; trace_id: string }) {
    this.setState({ ...this.state, run_id: params.run_id, status: "running" });

    return this.runFiber(`pipeline:${params.run_id}`, async () => {
      const ctx = this.buildContext();

      for (let i = 0; i < PHASES.length; i++) {
        const phase = PHASES[i];
        if (!phase) break;

        // Checkpoint: persist current state
        this.stash();
        this.setState({ ...this.state, current_phase: phase, phase_index: i });

        try {
          const result = await executePhase(phase, ctx, this.env);
          if (result === "finalize") {
            this.setState({ ...this.state, status: "completed" });
            return { success: true };
          }
          if (result === "revert" || result === "quarantine") {
            this.setState({ ...this.state, status: "failed", error: result });
            return { success: false, phase, error: result };
          }
        } catch (error) {
          if (ctx.retry_count < 3) { ctx.retry_count++; i--; continue; }
          this.setState({ ...this.state, status: "failed" });
          return { success: false, phase, error: String(error) };
        }
      }
      this.setState({ ...this.state, status: "completed" });
      return { success: true };
    });
  }

  // Automatic recovery after eviction
  async onFiberRecovered(fiberName: string) {
    if (this.state.status === "running") {
      await this.startPipeline({
        run_id: this.state.run_id, trace_id: this.state.trace_id,
      });
    }
  }
}

interface PipelineState {
  run_id: string; current_phase: string; phase_index: number;
  status: "idle" | "running" | "completed" | "failed"; error?: string;
}
```

---

## Option B: Cloudflare Workflows

Workflows provide step-level durability with automatic retries and external event waiting (up to 1 year).

```typescript
// worker/durable-objects/pipeline-workflow.ts
import { AgentWorkflow } from "agents/workflows";

export class PipelineWorkflow extends AgentWorkflow<Env> {
  async run() {
    await this.step("init", async (step) => {
      await step.updateAgentState({ phase: "init", status: "running" });
    });
    await this.step("discover", async (step) => {
      const deals = await this.agent.discoverDeals();
      await step.updateAgentState({ phase: "discover", count: deals.length });
      return deals;
    });
    // ... each phase is a durable step ...
    await this.step("finalize", async (step) => {
      await step.reportComplete({ success: true });
    });
  }
}
```

---

## Comparison

| Criterion | runFiber() | Workflows |
|-----------|-----------|-----------|
| Complexity | Low (single primitive) | Medium (class + steps) |
| Checkpointing | Implicit (stash) | Explicit (step) |
| Retry granularity | Manual loop | Per-step automatic |
| Step limit | None | 10,000 default |
| Best for | Sequential pipelines | Multi-agent orchestration |

**Recommendation**: Option A. Workflows add unnecessary complexity for a 10-phase sequential pipeline.

---

## Migration Steps

| Step | Action | Duration |
|------|--------|----------|
| 1 | Create `PipelineAgent` DO + wrangler config | 1 day |
| 2 | Update `state-machine.ts` to delegate to DO | 1-2 days |
| 3 | Deploy staging, test eviction recovery | 1 day |
| 4 | Deploy production with feature flag | 1 day |
| 5 | Cutover, remove old pipeline code | 1 day |

---

## Wrangler Config

```jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "PIPELINE_AGENT", "class_name": "PipelineAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["PipelineAgent"] }]
}
```

---

## Testing

```typescript
import { runDurableObjectAlarm } from "@cloudflare/vitest-pool-workers/testing";

it("checkpoints at each phase", async () => {
  const stub = env.PIPELINE_AGENT.getByName("test");
  const result = await stub.startPipeline({ run_id: "r1", trace_id: "t1" });
  expect(result.success).toBe(true);
  expect(stub.getState().status).toBe("completed");
});

it("recovers from eviction", async () => {
  const stub = env.PIPELINE_AGENT.getByName("recovery");
  await stub.startPipeline({ run_id: "r2", trace_id: "t2" });
  await runDurableObjectAlarm(stub);
  expect(stub.getState().status).toBe("running");
});
```

| Chaos Scenario | Method | Expected |
|----------------|--------|----------|
| Kill at Phase 3 | SIGTERM | Resume Phase 3 |
| Kill at Phase 8 | SIGTERM | Resume Phase 8 |
| Double trigger | Concurrent cron | Second blocked |

---

## Rollback

| Trigger | Action |
|---------|--------|
| Recovery failures >5% | Feature-flag off, use KV pipeline |
| Pipeline stuck | Manual alarm trigger + reset |

The migration runs **parallel** to the existing pipeline for 24 hours before cutover.

---

## Timeline & Cost

| Phase | Duration | Cost Delta |
|-------|----------|------------|
| Create PipelineAgent | 1 day | — |
| Update state-machine | 1-2 days | — |
| Staging validation | 1 day | — |
| Production deploy | 1 day | +$0.24/mo |
| Cleanup | 1 day | — |
| **Total** | **5-6 days** | **+$0.24/mo** |

The ~$0.24/mo increase eliminates wasted compute from full restarts on failure.

---

## Related Documents

- [worker/state-machine.ts](../worker/state-machine.ts) — Current pipeline
- [plans/ADR-017-durable-objects-migration.md](ADR-017-durable-objects-migration.md) — DO migration (companion)
- [Cloudflare Agents Durable Execution](https://developers.cloudflare.com/agents/runtime/execution/durable-execution/)
- [Cloudflare Agents Workflows](https://developers.cloudflare.com/agents/runtime/execution/run-workflows/)
- [Unified Fiber Architecture PR #1256](https://github.com/cloudflare/agents/pull/1256)

---

*ADR generated from codebase analysis and Cloudflare Agents SDK docs (2026).*
