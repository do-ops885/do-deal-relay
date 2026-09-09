/**
 * Node-test stub for the workers-runtime-only `cloudflare:workers` module.
 *
 * Unit tests run on the plain Node threads pool, where the Workers runtime
 * specifier does not resolve. This stub provides the base classes used by
 * production workflow modules so files like `worker/index.ts` stay
 * importable. It carries no behavior: workflow step logic is tested via
 * stub step objects, never through this class.
 */

export class WorkflowEntrypoint<EnvT = unknown, _ParamsT = unknown> {
  protected env: EnvT;
  protected ctx: unknown;
  constructor(ctx: unknown, env: EnvT) {
    this.ctx = ctx;
    this.env = env;
  }
  async run(): Promise<unknown> {
    throw new Error("stub: run() is not implemented in unit tests");
  }
}

export class NonRetryableError extends Error {
  constructor(message: string, name?: string) {
    super(message);
    this.name = name ?? "NonRetryableError";
  }
}
