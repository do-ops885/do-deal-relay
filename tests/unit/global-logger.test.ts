import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setLogLevel,
  setLogContext,
  clearLogContext,
  logger,
} from "../../worker/lib/global-logger";

describe("Global Logger", () => {
  beforeEach(() => {
    clearLogContext();
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("should respect log levels", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.debug("debug message");
    expect(logSpy).not.toHaveBeenCalled();

    logger.info("info message");
    expect(logSpy).toHaveBeenCalled();
  });

  it("should allow changing log level", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    setLogLevel("debug");
    logger.debug("debug message");
    expect(logSpy).toHaveBeenCalled();
  });

  it("should include global context in logs", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setLogContext({ app: "test-app" });

    logger.info("test message");
    const call = logSpy.mock.calls[0];
    if (call) {
      const parsed = JSON.parse(call[0] as string);
      expect(parsed.context.app).toBe("test-app");
    } else {
      throw new Error("console.log was not called");
    }
  });

  it("should prioritize local context over global context", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setLogContext({ key: "global" });

    logger.info("test message", { key: "local" });
    const call = logSpy.mock.calls[0];
    if (call) {
      const parsed = JSON.parse(call[0] as string);
      expect(parsed.context.key).toBe("local");
    } else {
      throw new Error("console.log was not called");
    }
  });

  it("should handle error level with console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("error message");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("should handle warn level with console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("warn message");
    expect(warnSpy).toHaveBeenCalled();
  });
});
