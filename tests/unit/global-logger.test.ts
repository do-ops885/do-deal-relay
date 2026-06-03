import { describe, it, expect } from "vitest";
import {
  logger,
  setLogLevel,
  setLogContext,
  clearLogContext,
} from "../../worker/lib/global-logger";

describe("Global Logger", () => {
  it("should have logger with expected methods", () => {
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it("should set log level without error", () => {
    expect(() => setLogLevel("debug")).not.toThrow();
    expect(() => setLogLevel("info")).not.toThrow();
    expect(() => setLogLevel("warn")).not.toThrow();
    expect(() => setLogLevel("error")).not.toThrow();
  });

  it("should set and clear log context", () => {
    expect(() => setLogContext({ component: "test" })).not.toThrow();
    expect(() => clearLogContext()).not.toThrow();
  });
});
