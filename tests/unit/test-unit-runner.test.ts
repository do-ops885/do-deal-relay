import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("test-unit runner script", () => {
  let tempSummaryFile: string;
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempSummaryFile = join(
      tmpdir(),
      `test-summary-${Date.now()}-${Math.random().toString(36).substring(2)}.md`,
    );

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    if (existsSync(tempSummaryFile)) {
      unlinkSync(tempSummaryFile);
    }
    vi.restoreAllMocks();
  });

  it("exits with status 0 on successful vitest run", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("success"));

    // @ts-expect-error script is JS without declaration file
    await import("../../scripts/test-unit.js");

    expect(execSync).toHaveBeenCalledWith(
      "vitest run -c vitest.config.unit.ts",
      {
        stdio: "inherit",
        timeout: 300_000,
      },
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits non-zero (1) and writes to GITHUB_STEP_SUMMARY when killed by timeout", async () => {
    process.env.GITHUB_STEP_SUMMARY = tempSummaryFile;

    const timeoutError = new Error("Command failed") as any;
    timeoutError.killed = true;
    timeoutError.signal = "SIGTERM";
    vi.mocked(execSync).mockImplementation(() => {
      throw timeoutError;
    });

    // @ts-expect-error script is JS without declaration file
    await import("../../scripts/test-unit.js");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "vitest killed by timeout (known upstream hang)",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    expect(existsSync(tempSummaryFile)).toBe(true);
    const summaryContent = readFileSync(tempSummaryFile, "utf8");
    expect(summaryContent).toContain("### ❌ Unit Tests Failed");
    expect(summaryContent).toContain(
      "vitest killed by timeout (known upstream hang)",
    );
  });

  it("exits with error status when command fails without timeout", async () => {
    const processError = new Error("Command failed") as any;
    processError.killed = false;
    processError.status = 2;
    vi.mocked(execSync).mockImplementation(() => {
      throw processError;
    });

    // @ts-expect-error script is JS without declaration file
    await import("../../scripts/test-unit.js");

    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
