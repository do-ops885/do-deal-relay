import { describe, it, expect } from "vitest";
import { minimatch } from "minimatch";
import fs from "fs";
import yaml from "js-yaml";

describe("Dependabot Patterns and Wildcards", () => {
  const content = fs.readFileSync(".github/dependabot.yml", "utf8");
  const config = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as any;

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

  // Dependabot matching is simpler than glob stars in some ecosystems but generally '*' matches everything in a string.
  // For minimatch to match across slashes with a single '*', we can use 'matchBase: true' or just use '**' if we wanted deep,
  // but Dependabot's '*' is usually literal string match with wildcard.
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
      // We will update the config to make these match more broadly
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

    it("docker correctly filters pre-release tags", () => {
      const wildcards = dockerUpdate.ignore.find(
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

  describe("Other Ecosystem Patterns", () => {
    it("github-actions group captures all actions", () => {
      const patterns = githubUpdate.groups["github-actions"].patterns;
      // In Dependabot '*' matches 'actions/checkout'
      // In minimatch, we might need a specific check or use a different pattern if '*' doesn't match slashes
      const isMatch = (val: string, pat: string) => {
        if (pat === "*") return true;
        return minimatch(val, pat, matchOptions);
      };
      expect(patterns.some((p: string) => isMatch("actions/checkout", p))).toBe(
        true,
      );
    });

    it("terraform group captures hashicorp providers", () => {
      const patterns = terraformUpdate.groups["terraform-providers"].patterns;
      const isMatch = (val: string, pat: string) => {
        if (pat.endsWith("/*")) {
          return val.startsWith(pat.slice(0, -1));
        }
        return minimatch(val, pat, matchOptions);
      };
      expect(patterns.some((p: string) => isMatch("hashicorp/aws", p))).toBe(
        true,
      );
      expect(patterns.some((p: string) => isMatch("hashicorp/google", p))).toBe(
        true,
      );
      expect(
        patterns.some((p: string) => isMatch("cloudflare/cloudflare", p)),
      ).toBe(false);
    });
  });
});
