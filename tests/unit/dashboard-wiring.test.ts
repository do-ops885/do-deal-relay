import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("public dashboard renderer wiring", () => {
  it("imports the implemented dashboard renderers", () => {
    const app = readProjectFile("public/js/app.js");

    expect(app).toContain('import { renderDealsView } from "./deals.js";');
    expect(app).toContain(
      'import { renderReferralsView } from "./referrals.js";',
    );
    expect(app).toContain(
      'import { renderAnalyticsView } from "./analytics.js";',
    );
  });

  it("registers deals, referrals, and analytics with the router", () => {
    const app = readProjectFile("public/js/app.js");

    expect(app).toMatch(/deals:\s*renderDealsView/);
    expect(app).toMatch(/referrals:\s*renderReferralsView/);
    expect(app).toMatch(/analytics:\s*renderAnalyticsView/);
    expect(app).toContain("const views = buildViews();");
    expect(app).toContain("views,");
    expect(app).not.toContain("buildStubViews");
    expect(app).not.toContain("__ddrStubViews");
  });

  it("registers the completed research and health views", () => {
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
});
