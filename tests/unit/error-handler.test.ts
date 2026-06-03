import { describe, it, expect } from "vitest";
import { classifyError } from "../../worker/lib/error-handler";
import { PipelineError } from "../../worker/types";

describe("Error Handler", () => {
  it("should classify PipelineError correctly", () => {
    const error = new PipelineError(
      "ValidationError",
      "Test error",
      "validate",
      true,
    );
    const result = classifyError(error);
    expect(result.message).toBe("Test error");
    expect(result.phase).toBe("validate");
    expect(result.errorClass).toBe("ValidationError");
    expect(result.retryable).toBe(true);
  });

  it("should classify generic Error", () => {
    const error = new Error("Generic error");
    const result = classifyError(error);
    expect(result.message).toBe("Generic error");
    expect(result.errorClass).toBe("SystemError");
    expect(result.retryable).toBe(false);
  });

  it("should classify unknown error", () => {
    const result = classifyError("string error");
    expect(result.message).toBe("string error");
    expect(result.errorClass).toBe("SystemError");
  });
});
