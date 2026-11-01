/**
 * Trace span helper (IMP-2 / P3-17).
 *
 * Wraps work in a Worker trace span so pipeline phases and queue work carry
 * deal/alert attributes into whatever OTLP destination is configured (see
 * docs/opentelemetry-setup.md). Export only happens when a destination is
 * set; without one, `tracing` still returns an untraced span and this helper
 * costs a callback.
 *
 * Unit tests alias `cloudflare:workers` to
 * tests/fixtures/cloudflare-workers-stub.ts, whose `tracing` invokes the
 * callback with a no-op span, so instrumented code stays testable on Node.
 */
import { tracing } from "cloudflare:workers";

export type SpanAttributes = Record<string, string | number | boolean>;

interface ExceptionDetails {
  code: string;
  name?: string;
  message: string;
  stack?: string;
}

function exceptionDetails(error: unknown): ExceptionDetails {
  if (error instanceof Error) {
    return {
      code: "unhandled_exception",
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    };
  }
  return { code: "unhandled_exception", message: String(error) };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Run `work` inside a span named `name`. Tracing never changes control flow:
 * a runtime without the API runs the work directly, and a rejected promise is
 * recorded on the span and rethrown unchanged.
 */
export function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  work: () => T,
): T {
  const enterSpan = tracing?.enterSpan;
  if (typeof enterSpan !== "function") {
    return work();
  }

  return enterSpan(name, (span) => {
    span.setAttributes(attributes);

    let result: T;
    try {
      result = work();
    } catch (error) {
      span.recordException(exceptionDetails(error));
      throw error;
    }

    if (isPromiseLike(result)) {
      return result.then(undefined, (error: unknown) => {
        span.recordException(exceptionDetails(error));
        throw error;
      }) as T;
    }

    return result;
  });
}
