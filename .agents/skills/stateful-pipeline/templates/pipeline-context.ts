/**
 * Pipeline Context Management
 *
 * Maintains state across pipeline phases with:
 * - Data transformation tracking
 * - Error accumulation
 * - Metrics collection
 * - Snapshot support for rollback
 */

export interface PipelineContext<TInput, TOutput = TInput> {
  // Core data
  input: TInput;
  output?: TOutput;

  // Phase tracking
  currentPhase: string;
  completedPhases: string[];
  phaseData: Map<string, PhaseData>;

  // Error handling
  errors: PhaseError[];
  retryCount: number;

  // Rollback support
  snapshots: Snapshot<TOutput>[];

  // Observability
  startTime: number;
  phaseStartTime: number;
  metadata: Map<string, unknown>;
}

interface PhaseData {
  input: unknown;
  output: unknown;
  duration: number;
  metrics: Record<string, number>;
}

interface PhaseError {
  phase: string;
  error: Error;
  timestamp: number;
  retryable: boolean;
}

interface Snapshot<T> {
  phase: string;
  data: T;
  timestamp: number;
}

export function createContext<TInput>(
  input: TInput,
  options: ContextOptions = {},
): PipelineContext<TInput> {
  const { enableSnapshots = true, metadata = {} } = options;

  return {
    input,
    currentPhase: "init",
    completedPhases: [],
    phaseData: new Map(),
    errors: [],
    retryCount: 0,
    snapshots: enableSnapshots
      ? []
      : (undefined as unknown as Snapshot<never>[]),
    startTime: Date.now(),
    phaseStartTime: Date.now(),
    metadata: new Map(Object.entries(metadata)),
  };
}

export function transitionPhase<T>(
  ctx: PipelineContext<T>,
  newPhase: string,
  data?: T,
): void {
  // Complete current phase
  const currentData = ctx.phaseData.get(ctx.currentPhase);
  if (currentData) {
    currentData.duration = Date.now() - ctx.phaseStartTime;
  }

  // Create snapshot before transition
  if (ctx.snapshots && data) {
    ctx.snapshots.push({
      phase: ctx.currentPhase,
      data,
      timestamp: Date.now(),
    });
  }

  // Record completion
  ctx.completedPhases.push(ctx.currentPhase);

  // Transition to new phase
  ctx.currentPhase = newPhase;
  ctx.phaseStartTime = Date.now();
  ctx.retryCount = 0;
}

export function recordError<T>(
  ctx: PipelineContext<T>,
  error: Error,
  retryable: boolean = false,
): void {
  ctx.errors.push({
    phase: ctx.currentPhase,
    error,
    timestamp: Date.now(),
    retryable,
  });
}

export function getLastSnapshot<T>(
  ctx: PipelineContext<T>,
  phase?: string,
): T | undefined {
  if (!ctx.snapshots || ctx.snapshots.length === 0) {
    return undefined;
  }

  if (phase) {
    const snapshot = ctx.snapshots
      .slice()
      .reverse()
      .find((s) => s.phase === phase);
    return snapshot?.data as T;
  }

  return ctx.snapshots[ctx.snapshots.length - 1]?.data as T;
}

export function setMetadata<T>(
  ctx: PipelineContext<T>,
  key: string,
  value: unknown,
): void {
  ctx.metadata.set(key, value);
}

export function getMetadata<T>(
  ctx: PipelineContext<unknown>,
  key: string,
): T | undefined {
  return ctx.metadata.get(key) as T;
}

interface ContextOptions {
  enableSnapshots?: boolean;
  metadata?: Record<string, unknown>;
}
