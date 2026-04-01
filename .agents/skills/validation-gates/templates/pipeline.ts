/**
 * Validation Gates Pipeline Template
 *
 * Implements a configurable 10-gate validation system.
 * Keep under 500 lines per AGENTS.md requirements.
 */

export interface GateResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  artifacts?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  gates: GateResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
}

export interface GateConfig {
  name: string;
  enabled: boolean;
  required: boolean;
  timeout: number;
  retry?: number;
  condition?: (ctx: ValidationContext) => boolean;
}

export interface ValidationContext {
  files: string[];
  changedFiles: string[];
  isCI: boolean;
  hasTests: boolean;
  [key: string]: unknown;
}

export type GateExecutor = (
  input: unknown,
  ctx: ValidationContext,
) => Promise<GateResult> | GateResult;

export class Gate {
  constructor(
    public config: GateConfig,
    private executor: GateExecutor,
  ) {}

  static syntax(config: { language?: string; strict?: boolean } = {}): Gate {
    return new Gate(
      { name: "syntax", enabled: true, required: true, timeout: 30000 },
      async (input: unknown) => {
        const start = Date.now();
        try {
          // Syntax validation logic
          return {
            name: "syntax",
            passed: true,
            duration: Date.now() - start,
          };
        } catch (error) {
          return {
            name: "syntax",
            passed: false,
            duration: Date.now() - start,
            error: String(error),
          };
        }
      },
    );
  }

  static tests(config: { coverage?: number; timeout?: number } = {}): Gate {
    return new Gate(
      {
        name: "tests",
        enabled: true,
        required: true,
        timeout: config.timeout || 120000,
      },
      async (input: unknown, ctx: ValidationContext) => {
        const start = Date.now();
        // Test execution logic
        return {
          name: "tests",
          passed: ctx.hasTests,
          duration: Date.now() - start,
        };
      },
    );
  }

  static security(): Gate {
    return new Gate(
      { name: "security", enabled: true, required: true, timeout: 60000 },
      async () => ({
        name: "security",
        passed: true,
        duration: 0,
      }),
    );
  }

  static performance(): Gate {
    return new Gate(
      { name: "performance", enabled: true, required: false, timeout: 60000 },
      async () => ({
        name: "performance",
        passed: true,
        duration: 0,
      }),
    );
  }

  async run(input: unknown, ctx: ValidationContext): Promise<GateResult> {
    if (!this.config.enabled) {
      return { name: this.config.name, passed: true, duration: 0 };
    }
    if (this.config.condition && !this.config.condition(ctx)) {
      return { name: this.config.name, passed: true, duration: 0 };
    }
    return await this.executor(input, ctx);
  }
}

export class ValidationPipeline {
  private gates: Gate[];
  private mode: "sequential" | "parallel";

  constructor(
    gates: Gate[],
    options: { mode?: "sequential" | "parallel" } = {},
  ) {
    this.gates = gates;
    this.mode = options.mode || "sequential";
  }

  async run(input: unknown, ctx: ValidationContext): Promise<ValidationResult> {
    const start = Date.now();
    const results: GateResult[] = [];

    if (this.mode === "sequential") {
      for (const gate of this.gates) {
        const result = await gate.run(input, ctx);
        results.push(result);
        if (!result.passed && gate.config.required) {
          break;
        }
      }
    } else {
      const promises = this.gates.map((g) => g.run(input, ctx));
      results.push(...(await Promise.all(promises)));
    }

    const passed = results.every((r) => r.passed);
    const requiredPassed =
      this.gates.filter((g, i) => g.config.required && results[i].passed)
        .length === this.gates.filter((g) => g.config.required).length;

    return {
      passed: passed && requiredPassed,
      gates: results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        skipped: 0,
        duration: Date.now() - start,
      },
    };
  }
}

// Default 10-gate pipeline
export function createDefaultPipeline(): ValidationPipeline {
  return new ValidationPipeline([
    Gate.syntax(),
    Gate.tests(),
    Gate.security(),
    Gate.performance(),
  ]);
}
