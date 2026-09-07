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
    it("npm does not use invalid prerelease wildcard versions", () => {
      // Dependabot cloud rejects glob-style prerelease requirements such as
      // "*-alpha*" for npm ("invalid version requirements for a npm ignore
      // condition"). Dependabot ignores prereleases by default for stable
      // dependencies, so no repo-wide "*" versions ignore is needed.
      const ignores = npmUpdate.ignore ?? [];
      for (const entry of ignores) {
        const versions = entry.versions ?? [];
        for (const v of versions) {
          expect(
            v.includes("*") && /alpha|beta|rc|pre/i.test(v),
            `invalid npm ignore version "${v}"`,
          ).toBe(false);
        }
      }
      expect(ignores.some((i: any) => i["dependency-name"] === "*")).toBe(
        false,
      );
    });

    it("docker ecosystem is intentionally unconfigured", () => {
      // .github/dependabot.yml currently scopes updates to github-actions
      // and npm only. If a docker entry is (re-)introduced it must include
      // an ignore block filtering pre-release tags; restore the wildcard
      // assertions here when that happens.
      expect(dockerUpdate).toBeUndefined();
    });

    it("vitest major pins use valid ranges to prevent eresolve", () => {
      // vitest 5 conflicts with @cloudflare/vitest-pool-workers 0.22.0
      // (peers vitest 4). The ignore entries must use standard npm range
      // syntax accepted by Dependabot cloud (e.g. ">=5").
      const ignores = npmUpdate.ignore ?? [];
      const vitest = ignores.find(
        (i: any) => i["dependency-name"] === "vitest",
      );
      const vitestScoped = ignores.find(
        (i: any) => i["dependency-name"] === "@vitest/*",
      );

      expect(vitest).toBeDefined();
      expect(vitestScoped).toBeDefined();
      expect(vitest.versions).toContain(">=5");
      expect(vitestScoped.versions).toContain(">=5");
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
