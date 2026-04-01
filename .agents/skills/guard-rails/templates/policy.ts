/**
 * Guard Rails Policy Template
 *
 * Configurable safety and quality enforcement system.
 */

export interface RuleConfig {
  name: string;
  severity: "error" | "warning" | "info";
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface Violation {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  location?: { line: number; column: number; file?: string };
  fix?: string;
}

export interface GuardResult {
  passed: boolean;
  violations: Violation[];
  fixed?: string;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

export interface GuardConfig {
  rules: Rule[];
  severity: "strict" | "normal" | "relaxed";
  autofix: boolean;
  failOn: "error" | "warning" | "never";
  ignore: string[];
}

export type RuleChecker = (
  code: string,
  ctx: GuardContext,
) => Violation[] | Violation | null;

export interface GuardContext {
  isProduction: boolean;
  isCI: boolean;
  filePath: string;
  [key: string]: unknown;
}

export class Rule {
  constructor(
    public config: RuleConfig,
    private checker: RuleChecker,
  ) {}

  check(code: string, ctx: GuardContext): Violation[] {
    if (!this.config.enabled) return [];
    const result = this.checker(code, ctx);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }

  static noSecretsInCode(patterns?: string[]): Rule {
    const secretPatterns = patterns || [
      "API_KEY",
      "PASSWORD",
      "SECRET",
      "TOKEN",
    ];
    return new Rule(
      { name: "no-secrets", severity: "error", enabled: true },
      (code: string) => {
        for (const pattern of secretPatterns) {
          if (code.includes(pattern)) {
            return {
              rule: "no-secrets",
              severity: "error",
              message: `Potential secret found: ${pattern}`,
            };
          }
        }
        return null;
      },
    );
  }

  static requiredTests(config: { minCoverage?: number } = {}): Rule {
    return new Rule(
      {
        name: "required-tests",
        severity: "warning",
        enabled: true,
        options: config,
      },
      (code: string, ctx: GuardContext) => {
        const hasTests =
          code.includes("describe") ||
          code.includes("it(") ||
          code.includes("test(");
        if (!hasTests && ctx.filePath.endsWith(".ts")) {
          return {
            rule: "required-tests",
            severity: "warning",
            message: "No tests found for this file",
          };
        }
        return null;
      },
    );
  }

  static maxComplexity(max: number): Rule {
    return new Rule(
      { name: "max-complexity", severity: "warning", enabled: true },
      () => ({
        rule: "max-complexity",
        severity: "warning",
        message: `Complexity exceeds ${max}`,
      }),
    );
  }

  static bannedImports(modules: string[]): Rule {
    return new Rule(
      { name: "banned-imports", severity: "error", enabled: true },
      (code: string) => {
        const violations: Violation[] = [];
        for (const mod of modules) {
          if (
            code.includes(`from '${mod}'`) ||
            code.includes(`from "${mod}"`)
          ) {
            violations.push({
              rule: "banned-imports",
              severity: "error",
              message: `Banned import: ${mod}`,
            });
          }
        }
        return violations;
      },
    );
  }
}

export class GuardRails {
  private config: GuardConfig;

  constructor(config: GuardConfig) {
    this.config = config;
  }

  async check(code: string, ctx: GuardContext): Promise<GuardResult> {
    const violations: Violation[] = [];

    for (const rule of this.config.rules) {
      const result = rule.check(code, ctx);
      violations.push(...result);
    }

    const errors = violations.filter((v) => v.severity === "error").length;
    const warnings = violations.filter((v) => v.severity === "warning").length;
    const infos = violations.filter((v) => v.severity === "info").length;

    const failThreshold =
      this.config.failOn === "error"
        ? 0
        : this.config.failOn === "warning"
          ? warnings + errors
          : violations.length;

    return {
      passed:
        errors === 0 && (this.config.failOn !== "warning" || warnings === 0),
      violations,
      summary: { errors, warnings, infos },
    };
  }

  static security(
    options: { noSecrets?: boolean; noEval?: boolean } = {},
  ): GuardRails {
    const rules: Rule[] = [];
    if (options.noSecrets !== false) rules.push(Rule.noSecretsInCode());
    return new GuardRails({
      rules,
      severity: "strict",
      autofix: false,
      failOn: "error",
      ignore: [],
    });
  }

  static quality(
    options: { minCoverage?: number; maxComplexity?: number } = {},
  ): GuardRails {
    const rules: Rule[] = [];
    if (options.minCoverage)
      rules.push(Rule.requiredTests({ minCoverage: options.minCoverage }));
    if (options.maxComplexity)
      rules.push(Rule.maxComplexity(options.maxComplexity));
    return new GuardRails({
      rules,
      severity: "normal",
      autofix: true,
      failOn: "warning",
      ignore: ["*.test.ts"],
    });
  }
}
