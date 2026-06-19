import { describe, it, expect } from "vitest";
import {
  toErrCtx,
  toErrMessage,
  type ErrContext,
} from "../../../worker/lib/errors";

/**
 * Tests for toErrCtx helper in worker/lib/errors.ts.
 *
 * Mirrors `tests/unit/bot/lib-errors.test.ts`. The helper is identical
 * across the bot and worker tiers; if these tests diverge, the helpers
 * have drifted.
 */

describe("toErrCtx", () => {
  describe("Error instances", () => {
    it("returns { name, message, stack? } for a generic Error", () => {
      const err = new Error("something broke");
      const ctx = toErrCtx(err);
      expect(ctx).toMatchObject({
        name: "Error",
        message: "something broke",
      });
      expect((ctx as { stack?: string }).stack).toBeDefined();
    });

    it("preserves subclass name and message for TypeError", () => {
      const err = new TypeError("expected string");
      const ctx = toErrCtx(err);
      expect(ctx).toMatchObject({
        name: "TypeError",
        message: "expected string",
      });
    });

    it("preserves subclass name for custom Error subclasses", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }
      const err = new CustomError("domain failure");
      const ctx = toErrCtx(err);
      expect(ctx).toMatchObject({
        name: "CustomError",
        message: "domain failure",
      });
    });

    it("returns stack: undefined when Error.stack is undefined", () => {
      // The helper intentionally keeps the `stack` key on the returned
      // object even when the underlying Error.stack is undefined — the
      // structural contract is "string | undefined", not "key absent".
      // Future maintainers should not "tighten" this by switching to
      // conditional spread without first re-checking all consumers.
      const err = new Error("no-stack");
      err.stack = undefined;
      const ctx = toErrCtx(err);
      expect(ctx).toMatchObject({
        name: "Error",
        message: "no-stack",
      });
      // Narrow the discriminated union so TypeScript can see the
      // Error-branch `stack?: string` property.
      if ("name" in ctx) {
        expect(ctx.stack).toBeUndefined();
      } else {
        throw new Error("expected Error branch");
      }
    });
  });

  describe("non-Error throws", () => {
    it("returns { value } for a thrown string", () => {
      const ctx = toErrCtx("network unreachable");
      expect(ctx).toEqual({ value: "network unreachable" });
    });

    it("returns { value } for a thrown number", () => {
      const ctx = toErrCtx(401);
      expect(ctx).toEqual({ value: "401" });
    });

    it("returns { value: 'null' } for a thrown null", () => {
      const ctx = toErrCtx(null);
      expect(ctx).toEqual({ value: "null" });
    });

    it("returns { value: 'undefined' } for a thrown undefined", () => {
      const ctx = toErrCtx(undefined);
      expect(ctx).toEqual({ value: "undefined" });
    });

    it("returns { value } '[object Object]' for a thrown plain object", () => {
      // String() of a plain object yields '[object Object]' (not JSON).
      // The helper intentionally does NOT introspect — it preserves
      // String() semantics which are cycle-safe but information-lossy.
      const ctx = toErrCtx({ code: "E_FAIL", detail: "downstream" });
      expect(ctx).toEqual({ value: "[object Object]" });
    });
  });

  describe("discriminated-union structural contract", () => {
    it("Error branch shape: { name, message, stack? }", () => {
      const ctx: ErrContext = toErrCtx(new Error("x"));
      if ("name" in ctx) {
        expect(typeof ctx.name).toBe("string");
        expect(typeof ctx.message).toBe("string");
        // stack is optional: either string or absent.
        if ("stack" in ctx) expect(typeof ctx.stack).toBe("string");
      } else {
        throw new Error("expected Error branch");
      }
    });

    it("non-Error branch shape: { value }", () => {
      const ctx: ErrContext = toErrCtx("stringy");
      if ("value" in ctx) {
        expect(typeof ctx.value).toBe("string");
      } else {
        throw new Error("expected non-Error branch");
      }
    });
  });

  describe("AggregateError (ES2021)", () => {
    it("preserves AggregateError name and message", () => {
      const a = new TypeError("inner-1");
      const b = new RangeError("inner-2");
      const agg = new AggregateError([a, b], "two failures");
      const ctx = toErrCtx(agg);
      expect(ctx).toMatchObject({
        name: "AggregateError",
        message: "two failures",
      });
    });
  });

  describe("Symbol throws", () => {
    it("returns { value } for a thrown Symbol", () => {
      // Symbol.toString() yields "Symbol(description)" in modern JS.
      // The helper relies on String() coercion which is safe for sym.
      const ctx = toErrCtx(Symbol("nope"));
      expect(ctx).toEqual({ value: "Symbol(nope)" });
    });
  });
});

describe("toErrMessage", () => {
  it("returns err.message for Error instances", () => {
    expect(toErrMessage(new Error("boom"))).toBe("boom");
  });

  it("returns subclass message for TypeError", () => {
    expect(toErrMessage(new TypeError("not a string"))).toBe("not a string");
  });

  it("returns the string verbatim for thrown strings", () => {
    expect(toErrMessage("network down")).toBe("network down");
  });

  it("returns 'null' for thrown null", () => {
    expect(toErrMessage(null)).toBe("null");
  });

  it("returns 'undefined' for thrown undefined", () => {
    expect(toErrMessage(undefined)).toBe("undefined");
  });

  it("returns the decimal form for thrown numbers", () => {
    expect(toErrMessage(401)).toBe("401");
  });

  it("returns Symbol(description) for thrown Symbols", () => {
    expect(toErrMessage(Symbol("nope"))).toBe("Symbol(nope)");
  });

  it("preserves parity with legacy error pattern output", () => {
    // The whole point of toErrMessage is to be a drop-in replacement for
    // `error instanceof Error ? error.message : String(error)` — a
    // property test ensures no future regression in either direction.
    const samples = [
      new Error("a"),
      "b",
      42,
      null,
      undefined,
      { x: 1 },
      Symbol("s"),
    ] as const;
    for (const s of samples) {
      const legacy = s instanceof Error ? s.message : String(s);
      expect(toErrMessage(s)).toBe(legacy);
    }
  });
});
