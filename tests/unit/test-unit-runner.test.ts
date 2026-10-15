import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

describe("test-unit runner script", () => {
  let tempSummaryFile: string;
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempSummaryFile = join(
      tmpdir(),
      `test-summary-${Date.now()}-${randomUUID()}.md`,
    );

    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as unknown as never);
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
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      signal: null,
      output: [],
      pid: 1234,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      error: undefined,
    } as unknown as ReturnType<typeof spawnSync>);

    // @ts-expect-error script is JS without declaration file
    await import("../../scripts/test-unit.js");

    expect(spawnSync).toHaveBeenCalledWith(
      "vitest",
      ["run", "-c", "vitest.config.unit.ts"],
      {
        stdio: "inherit",
        timeout: 300_000,
      },
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("exits non-zero (1) and writes to GITHUB_STEP_SUMMARY when killed by timeout", async () => {
    process.env.GITHUB_STEP_SUMMARY = tempSummaryFile;

    const timeoutErr = new Error(
      "ETIMEDOUT",
    ) as unknown as NodeJS.ErrnoException;
    timeoutErr.code = "ETIMEDOUT";

    vi.mocked(spawnSync).mockReturnValue({
      status: null,
      signal: "SIGTERM",
      output: [],
      pid: 1234,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      error: timeoutErr,
    } as unknown as ReturnType<typeof spawnSync>);

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
    vi.mocked(spawnSync).mockReturnValue({
      status: 2,
      signal: null,
      output: [],
      pid: 1234,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      error: undefined,
    } as unknown as ReturnType<typeof spawnSync>);

    // @ts-expect-error script is JS without declaration file
    await import("../../scripts/test-unit.js");

    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
