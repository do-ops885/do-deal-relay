import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("dashboard research and health views", () => {
  it("registers real Research and System Health renderers", () => {
    const app = readProjectFile("public/js/app.js");
    expect(app).toContain(
      'import { renderResearchView } from "./research.js";',
    );
    expect(app).toContain('import { renderHealthView } from "./health.js";');
    expect(app).toMatch(/research:\s*renderResearchView/);
    expect(app).toMatch(/health:\s*renderHealthView/);
    expect(app).not.toContain("Research view will be implemented");
    expect(app).not.toContain("System health view will be implemented");
  });

  it("exposes the research-results API contract", () => {
    const api = readProjectFile("public/js/api.js");
    const research = readProjectFile("public/js/research.js");
    expect(api).toContain("/api/research/");
    expect(api).toContain("getResearchResults");
    expect(research).toContain("api.getResearchResults(domain)");
    expect(research).toContain("discovered_codes");
    expect(research).toContain("research_metadata");
  });

  it("renders health dependencies and checks from the backend response", () => {
    const health = readProjectFile("public/js/health.js");
    expect(health).toContain("data?.dependencies");
    expect(health).toContain("data?.checks");
    expect(health).toContain("data?.pipeline");
    expect(health).toContain("api.getHealth()");
  });
});
