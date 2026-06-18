import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "../../../bot/lib/logger";

/**
 * Tests for the createLogger factory pattern in bot/lib/logger.ts.
 *
 * Covers: API surface, level filtering, JSON-vs-text formatting, context
 * merge precedence (top-level vs explicit), and per-instance state
 * isolation. The factory pattern was introduced to eliminate the
 * module-singleton mutable state leak between bot/discord and bot/telegram;
 * the isolation tests are the regression guard for that contract.
 */

describe("createLogger", () => {
  beforeEach(() => {
    // Reset any console.* spies left over from a prior test so each test
    // starts with a clean mock surface and an empty call log.
    vi.restoreAllMocks();
  });

  describe("API surface", () => {
    it("returns a Logger with debug/info/warn/error methods", () => {
      const logger = createLogger({ component: "test" });
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });

    it("exposes setMinLevel / setContext / clearContext for runtime tuning", () => {
      const logger = createLogger();
      expect(typeof logger.setMinLevel).toBe("function");
      expect(typeof logger.setContext).toBe("function");
      expect(typeof logger.clearContext).toBe("function");
    });
  });

  describe("level filtering", () => {
    it("defaults to info level: debug suppressed, info+ emitted via console.log", () => {
      const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = createLogger({ component: "test" });
      logger.debug("debug-suppressed");
      logger.info("info-emitted");
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("info-emitted"));
      infoSpy.mockRestore();
    });

    it("setMinLevel('warn') suppresses info and debug; only warn emits", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = createLogger({ component: "test" });
      logger.setMinLevel("warn");
      logger.debug("debug-suppressed");
      logger.info("info-suppressed");
      logger.warn("warn-emitted");
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("error level routes to console.error (not console.log or console.warn)", () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = createLogger({ component: "test" });
      logger.error("error-emitted");
      expect(errSpy).toHaveBeenCalledTimes(1);
      errSpy.mockRestore();
    });
  });

  describe("JSON vs text formatting", () => {
    it("emits JSON output when context is provided", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = createLogger({ component: "test" });
      logger.info("json-output", { request_id: "abc-123" });
      expect(spy).toHaveBeenCalledTimes(1);
      const called = spy.mock.calls[0]?.[0];
      expect(typeof called).toBe("string");
      const parsed = JSON.parse(called as string);
      expect(parsed.message).toBe("json-output");
      expect(parsed.level).toBe("info");
      expect(parsed.context.component).toBe("test");
      expect(parsed.context.request_id).toBe("abc-123");
      spy.mockRestore();
    });

    it("emits text output when no context is provided (createLogger() with no args)", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      // No args -> globalContext = {} -> log entry has no context -> text output.
      const logger = createLogger();
      logger.info("text-output");
      expect(spy).toHaveBeenCalledTimes(1);
      const called = spy.mock.calls[0]?.[0] as string;
      expect(typeof called).toBe("string");
      expect(called).toContain("text-output");
      expect(called).not.toMatch(/^\{/); // Not JSON
      spy.mockRestore();
    });
  });

  describe("context merge precedence", () => {
    it("explicit context overrides top-level LoggerOptions fields when keys collide", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = createLogger({
        component: "alpha",
        context: { component: "beta" },
      });
      logger.info("merge-test-collision");
      expect(spy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
      expect(parsed.context.component).toBe("beta");
      spy.mockRestore();
    });

    it("top-level fields merge with explicit context when keys differ", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = createLogger({
        component: "alpha",
        context: { trace_id: "xyz" },
      });
      logger.info("merge-test-disjoint");
      expect(spy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
      expect(parsed.context.component).toBe("alpha");
      expect(parsed.context.trace_id).toBe("xyz");
      spy.mockRestore();
    });
  });

  describe("per-instance state isolation", () => {
    it("two createLogger calls produce independent setMinLevel state", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const l1 = createLogger({ component: "l1" });
      const l2 = createLogger({ component: "l2" });
      // Raise l1's threshold; l2 stays at default 'info'.
      l1.setMinLevel("warn");
      // Emit from l1 both BELOW (info) and AT (warn) the threshold; then from
      // l2 at its own (info) threshold. The three orthogonal branches cover
      // the four regression modes:
      //   - l1.threshold silently ignored (and l2 unaffected): all three emit
      //   - l1.threshold leaks DOWN to l2: l2.info would also be suppressed
      //   - l1.threshold leaks UP to l2: l2.info still emits, but the
      //     below-threshold l1.info would too
      //   - correct behavior: only l1.warn + l2.info emit
      l1.info("l1-info-MUST-BE-SUPPRESSED-BY-L1-WARN-THRESHOLD");
      l1.warn("l1-warn-MUST-EMIT-AT-WARN-LEVEL");
      l2.info("l2-info-MUST-EMIT-AT-DEFAULT-INFO-LEVEL");
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0]?.[0]).toContain("l2-info-MUST-EMIT");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("l1-warn-MUST-EMIT");
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("two createLogger calls produce independent setContext state", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const l1 = createLogger();
      const l2 = createLogger();
      l1.setContext({ component: "l1-context" });
      l2.setContext({ component: "l2-context" });
      l1.info("l1-log");
      l2.info("l2-log");
      expect(spy).toHaveBeenCalledTimes(2);
      const l1Parsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
      const l2Parsed = JSON.parse(spy.mock.calls[1]?.[0] as string);
      expect(l1Parsed.context.component).toBe("l1-context");
      expect(l2Parsed.context.component).toBe("l2-context");
      spy.mockRestore();
    });

    it("setContext on one instance does not bleed into another's globalContext (regression guard)", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const base = createLogger({ component: "base" });
      const tuned = createLogger({ component: "tuned" });

      tuned.setContext({ trace_id: "trace-99" }); // only `tuned` should see this

      base.info("base-info");
      tuned.info("tuned-info");

      const baseParsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
      const tunedParsed = JSON.parse(spy.mock.calls[1]?.[0] as string);

      // `base` should still carry its initial component and NOT pick up trace_id.
      expect(baseParsed.context.component).toBe("base");
      expect(baseParsed.context.trace_id).toBeUndefined();

      // `tuned` should carry both its initial component and the setContext trace_id.
      expect(tunedParsed.context.component).toBe("tuned");
      expect(tunedParsed.context.trace_id).toBe("trace-99");

      spy.mockRestore();
    });
  });
});
