import { PipelinePhase, PipelineContext, PipelineConfig, FailurePath } from './types';

/**
 * Create a stateful pipeline with configurable phases
 */
export function createPipeline<T>(
  phases: string[],
  config: PipelineConfig = {}
): PipelineInstance<T> {
  const {
    maxRetries = 3,
    onFailure = 'revert',
    enableMetrics = true,
    enableStructuredLogging = true
  } = config;

  return {
    async execute(initialData: T): Promise<PipelineResult<T>> {
      const ctx: PipelineContext<T> = {
        data: initialData,
        phase: 'init',
        retryCount: 0,
        errors: [],
        metrics: enableMetrics ? createMetrics() : undefined,
        startTime: Date.now()
      };

      try {
        for (const phase of phases) {
          ctx.phase = phase;
          
          // Execute phase with retry logic
          const result = await executePhaseWithRetry(
            phase,
            ctx,
            maxRetries
          );

          if (result.failurePath) {
            return handleFailure(result.failurePath, ctx, onFailure);
          }
        }

        return {
          success: true,
          data: ctx.data,
          metrics: ctx.metrics?.finalize(),
          duration: Date.now() - ctx.startTime
        };

      } catch (error) {
        return handleUnexpectedError(error, ctx);
      }
    }
  };
}

interface PipelineInstance<T> {
  execute(data: T): Promise<PipelineResult<T>>;
}

interface PipelineResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  failurePath?: FailurePath;
  metrics?: PipelineMetrics;
  duration: number;
}

interface PipelineContext<T> {
  data: T;
  phase: string;
  retryCount: number;
  errors: Error[];
  metrics?: MetricsCollector;
  startTime: number;
}

type FailurePath = 'revert' | 'quarantine' | 'concurrency_abort';

interface PipelineConfig {
  maxRetries?: number;
  onFailure?: FailurePath;
  enableMetrics?: boolean;
  enableStructuredLogging?: boolean;
}

async function executePhaseWithRetry<T>(
  phase: string,
  ctx: PipelineContext<T>,
  maxRetries: number
): Promise<{ failurePath?: FailurePath }> {
  const phaseStartTime = Date.now();
  
  while (ctx.retryCount <= maxRetries) {
    try {
      ctx.metrics?.recordPhaseStart(phase);
      
      // Phase execution would go here
      // const result = await executePhase(phase, ctx.data);
      
      ctx.metrics?.recordPhaseComplete(phase, Date.now() - phaseStartTime);
      return { failurePath: undefined };
      
    } catch (error) {
      if (isRetryable(error) && ctx.retryCount < maxRetries) {
        ctx.retryCount++;
        await sleep(1000 * ctx.retryCount);
        continue;
      }
      
      throw error;
    }
  }
  
  return { failurePath: 'revert' };
}

function isRetryable(error: Error): boolean {
  // Retry on network errors, timeouts
  return error.message.includes('timeout') || 
         error.message.includes('ECONNRESET') ||
         error.message.includes('ETIMEDOUT');
}

function handleFailure<T>(
  failurePath: FailurePath,
  ctx: PipelineContext<T>,
  onFailure: FailurePath
): PipelineResult<T> {
  switch (onFailure) {
    case 'revert':
      // Rollback logic
      return {
        success: false,
        error: `Pipeline failed at phase ${ctx.phase}`,
        failurePath: 'revert',
        metrics: ctx.metrics?.finalize(),
        duration: Date.now() - ctx.startTime
      };
      
    case 'quarantine':
      // Mark data as suspicious but continue
      return {
        success: true,
        data: ctx.data,
        metrics: ctx.metrics?.finalize(),
        duration: Date.now() - ctx.startTime
      };
      
    default:
      return {
        success: false,
        error: `Unexpected failure path: ${failurePath}`,
        failurePath,
        metrics: ctx.metrics?.finalize(),
        duration: Date.now() - ctx.startTime
      };
  }
}

function handleUnexpectedError<T>(
  error: Error,
  ctx: PipelineContext<T>
): PipelineResult<T> {
  return {
    success: false,
    error: error.message,
    metrics: ctx.metrics?.finalize(),
    duration: Date.now() - ctx.startTime
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Metrics stub
interface MetricsCollector {
  recordPhaseStart(phase: string): void;
  recordPhaseComplete(phase: string, duration: number): void;
  finalize(): PipelineMetrics;
}

interface PipelineMetrics {
  phases: Record<string, { duration: number }>;
  totalDuration: number;
  retryCount: number;
}

function createMetrics(): MetricsCollector {
  const phases: Record<string, { duration: number }> = {};
  
  return {
    recordPhaseStart(phase: string) {
      // Implementation
    },
    recordPhaseComplete(phase: string, duration: number) {
      phases[phase] = { duration };
    },
    finalize() {
      return {
        phases,
        totalDuration: 0,
        retryCount: 0
      };
    }
  };
}
