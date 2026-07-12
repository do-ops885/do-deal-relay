import { describe, it, expect } from "vitest";
import {
  toError,
  safeClientMessage,
  sanitizeErrorForClient,
} from "../../worker/lib/sanitize-error";

describe("sanitize-error", () => {
  describe("toError", () => {
    it("should return the same error if it is an instance of Error", () => {
      const error = new Error("test error");
      expect(toError(error)).toBe(error);
    });

    it("should convert a string to an Error instance", () => {
      const error = "test error";
      const result = toError(error);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("test error");
    });

    it("should convert an object to an Error instance using JSON.stringify", () => {
      const error = { foo: "bar" };
      const result = toError(error);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('{"foo":"bar"}');
    });

    it("should handle objects that cannot be stringified", () => {
      const error: any = { foo: "bar" };
      error.self = error; // Circular reference
      const result = toError(error);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("[object Object]");
    });

    it("should convert other types to Error using String()", () => {
      expect(toError(123).message).toBe("123");
      expect(toError(true).message).toBe("true");
      expect(toError(null).message).toBe("null");
      expect(toError(undefined).message).toBe("undefined");
    });
  });

  describe("safeClientMessage", () => {
    it('should return "An unexpected error occurred"', () => {
      expect(safeClientMessage(new Error("secret info"))).toBe(
        "An unexpected error occurred",
      );
    });
  });

  describe("sanitizeErrorForClient", () => {
    it('should return an object with "An unexpected error occurred"', () => {
      const result = sanitizeErrorForClient(new Error("secret info"));
      expect(result).toEqual({ error: "An unexpected error occurred" });
    });
  });
});
