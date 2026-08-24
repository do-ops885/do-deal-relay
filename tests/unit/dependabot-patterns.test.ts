import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { minimatch } from "minimatch";
import fs from "fs";
import path from "path";
import { load as yamlLoad, JSON_SCHEMA } from "js-yaml";

describe("Dependabot Patterns and Wildcards", () => {
  const content = fs.readFileSync(".github/dependabot.yml", "utf8");
  const config = yamlLoad(content, { schema: JSON_SCHEMA }) as any;

  const npmUpdate = config.updates.find(
    (u: any) => u["package-ecosystem"] === "npm",
  );
  const dockerUpdate = config.updates.find(
    (u: any) => u["package-ecosystem"] === "docker",
  );
  const githubUpdate = config.updates.find(
    (u: any) => u["package-ecosystem"] === "github-actions",
  );
  const terraformUpdate = config.updates.find(
    (u: any) => u["package-ecosystem"] === "terraform",
  );

  const matchOptions = { dot: true, nocomment: true };

  describe("npm Grouping Patterns", () => {
    it("cloudflare group correctly captures scoped packages", () => {
      const cloudflareGroup = npmUpdate.groups.cloudflare;
      const patterns = cloudflareGroup.patterns;

      expect(
        patterns.some((p: string) =>
          minimatch("@cloudflare/workers-types", p, matchOptions),
        ),
      ).toBe(true);
      expect(
        patterns.some((p: string) =>
          minimatch("@cloudflare/kv-asset-handler", p, matchOptions),
        ),
      ).toBe(true);
      expect(
        patterns.some((p: string) => minimatch("wrangler", p, matchOptions)),
      ).toBe(true);
      expect(
        patterns.some((p: string) => minimatch("miniflare", p, matchOptions)),
      ).toBe(true);

      expect(
        patterns.some((p: string) => minimatch("lodash", p, matchOptions)),
      ).toBe(false);
    });

    it("testing group correctly captures vitest and related packages", () => {
      const testingGroup = npmUpdate.groups.testing;
      const patterns = testingGroup.patterns;

      expect(
        patterns.some((p: string) => minimatch("vitest", p, matchOptions)),
      ).toBe(true);
      expect(
        patterns.some((p: string) =>
          minimatch("@vitest/coverage-v8", p, matchOptions),
        ),
      ).toBe(true);
      expect(
        patterns.some((p: string) => minimatch("playwright", p, matchOptions)),
      ).toBe(true);
      expect(
        patterns.some((p: string) =>
          minimatch("@playwright/test", p, matchOptions),
        ),
      ).toBe(true);
      expect(
        patterns.some((p: string) => minimatch("artillery", p, matchOptions)),
      ).toBe(true);
    });
  });

  describe("Version Ignore Wildcards", () => {
    it("npm correctly filters pre-release tags", () => {
      const wildcards = npmUpdate.ignore.find(
        (i: any) => i["dependency-name"] === "*",
      ).versions;

      expect(
        wildcards.some((w: string) =>
          minimatch("1.0.0-alpha", w, matchOptions),
        ),
      ).toBe(true);
      expect(
        wildcards.some((w: string) =>
          minimatch("2.1.0-beta.1", w, matchOptions),
        ),
      ).toBe(true);
      expect(
        wildcards.some((w: string) => minimatch("3.0.0-rc.5", w, matchOptions)),
      ).toBe(true);

      expect(
        wildcards.some((w: string) => minimatch("1.0.0", w, matchOptions)),
      ).toBe(false);
    });

    it("docker ecosystem is intentionally unconfigured", () => {
      // .github/dependabot.yml currently scopes updates to github-actions
      // and npm only. If a docker entry is (re-)introduced it must include
      // an ignore block filtering pre-release tags; restore the wildcard
      // assertions here when that happens.
      expect(dockerUpdate).toBeUndefined();
    });

    it("configured pre-release wildcards exclude tags but not stable versions", () => {
      // Guards the matching semantics of the repo-wide ignore wildcards:
      // suffixed patterns must catch prefixed/qualified pre-release forms
      // while leaving stable versions untouched.
      const wildcards = npmUpdate.ignore.find(
        (i: any) => i["dependency-name"] === "*",
      ).versions;

      expect(
        wildcards.some((w: string) =>
          minimatch("v1.0.0-alpha", w, matchOptions),
        ),
      ).toBe(true);
      expect(
        wildcards.some((w: string) =>
          minimatch("myapp:1.0.0-rc1", w, matchOptions),
        ),
      ).toBe(true);

      expect(
        wildcards.some((w: string) => minimatch("v1.0.0", w, matchOptions)),
      ).toBe(false);
    });
  });

  describe("Negative Test Cases (Validator Integration)", () => {
    const validatorScript = path.resolve("scripts/validate-dependabot.js");
    const fixturesDir = path.resolve("tests/fixtures");

    function runValidator(fixturePath: string): {
      exitCode: number | null;
      stderr: string;
      stdout: string;
    } {
      try {
        const result = execSync(`node "${validatorScript}" "${fixturePath}"`, {
          encoding: "utf8",
          stdio: "pipe",
        });
        return { exitCode: 0, stdout: result, stderr: "" };
      } catch (e: any) {
        return {
          exitCode: e.status ?? 1,
          stdout: e.stdout?.toString() ?? "",
          stderr: e.stderr?.toString() ?? e.message ?? "",
        };
      }
    }

    it("rejects config with missing version field", () => {
      const fixture = path.join(fixturesDir, "dependabot-missing-version.yml");
      const result = runValidator(fixture);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/version: 2/i);
    });

    it("rejects config with invalid ecosystem", () => {
      const fixture = path.join(
        fixturesDir,
        "dependabot-invalid-ecosystem.yml",
      );
      const result = runValidator(fixture);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(
        /invalid package-ecosystem/i,
      );
    });

    it("rejects config with missing schedule", () => {
      const fixture = path.join(fixturesDir, "dependabot-missing-schedule.yml");
      const result = runValidator(fixture);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/invalid schedule/i);
    });

    it("rejects config with invalid schedule day", () => {
      const fixture = path.join(
        fixturesDir,
        "dependabot-invalid-schedule-day.yml",
      );
      const result = runValidator(fixture);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/invalid schedule\.day/i);
    });

    it("accepts valid config", () => {
      const validFixture = ".github/dependabot.yml";
      const result = runValidator(validFixture);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("Other Ecosystem Patterns", () => {
    it("github-actions group captures all actions", () => {
      const patterns = githubUpdate.groups["github-actions"].patterns;
      const isMatch = (val: string, pat: string) => {
        if (pat === "*") return true;
        return minimatch(val, pat, matchOptions);
      };
      expect(patterns.some((p: string) => isMatch("actions/checkout", p))).toBe(
        true,
      );
    });

    it("terraform ecosystem is intentionally unconfigured", () => {
      // .github/dependabot.yml currently scopes updates to github-actions
      // and npm only. If a terraform entry is (re-)introduced it must group
      // hashicorp providers under a "terraform-providers" group whose
      // patterns capture "hashicorp/*"; restore those assertions here.
      expect(terraformUpdate).toBeUndefined();
    });
  });
});
