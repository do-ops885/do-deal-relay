import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/check-launch-readiness.sh");

function runScript() {
  return spawnSync("bash", [SCRIPT], { encoding: "utf8" });
}

describe("check-launch-readiness.sh", () => {
  it("exits 0 with repo-side sections for #994, #996, #997", () => {
    const result = runScript();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("#994");
    expect(result.stdout).toContain("#996");
    expect(result.stdout).toContain("#997");
  });

  it("reports owner-gated items without failing", () => {
    const result = runScript();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[OWNER]");
    expect(result.stdout).not.toContain("[FAIL]");
    expect(result.stdout).toContain("repo-side ready");
  });

  it("verifies the key repo-side expectations", () => {
    const result = runScript();
    expect(result.stdout).toContain("D1 migration v13 present");
    expect(result.stdout).toContain("alert-queue DLQ configured");
    expect(result.stdout).toContain("instrumented with withSpan");
    expect(result.stdout).toContain("D1 CAS fallback preserved");
  });
});
