import { describe, it, expect } from "vitest";
import {
  checkBodySize,
  enforceBodyLimit,
} from "../../../worker/middleware/body-limit";
import type { Env } from "../../../worker/types";

function createRequest(contentLength?: string): Request {
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }
  return new Request("https://example.com/api/test", {
    method: "POST",
    headers,
  });
}

describe("checkBodySize Middleware", () => {
  it("should return null when Content-Length header is omitted", () => {
    const request = createRequest();
    const result = checkBodySize(request, 1024);
    expect(result).toBeNull();
  });

  it("should return null when Content-Length is within limit", () => {
    const request = createRequest("500");
    const result = checkBodySize(request, 1024);
    expect(result).toBeNull();
  });

  it("should return null when Content-Length exactly equals limit", () => {
    const request = createRequest("1024");
    const result = checkBodySize(request, 1024);
    expect(result).toBeNull();
  });

  it("should handle surrounding whitespace in valid Content-Length", () => {
    const request = createRequest("  500  ");
    const result = checkBodySize(request, 1024);
    expect(result).toBeNull();
  });

  it("should return 413 when Content-Length exceeds limit", async () => {
    const request = createRequest("2048");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(413);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Request body too large");
  });

  it("should use default max size of 1MB when not specified", async () => {
    const okRequest = createRequest("1048576"); // 1MB
    expect(checkBodySize(okRequest)).toBeNull();

    const tooLargeRequest = createRequest("1048577"); // 1MB + 1
    const result = checkBodySize(tooLargeRequest);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(413);
  });

  it("should return 400 when Content-Length is non-numeric", async () => {
    const request = createRequest("abc");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Invalid Content-Length header");
  });

  it("should return 400 when Content-Length is negative", async () => {
    const request = createRequest("-500");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Invalid Content-Length header");
  });

  it("should return 400 when Content-Length contains decimals", async () => {
    const request = createRequest("10.5");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Invalid Content-Length header");
  });

  it("should return 400 when Content-Length uses scientific notation", async () => {
    const request = createRequest("1e5");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Invalid Content-Length header");
  });

  it("should return 400 when Content-Length has explicit plus sign", async () => {
    const request = createRequest("+500");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Invalid Content-Length header");
  });

  it("should return 400 when Content-Length exceeds safe integer limit", async () => {
    const request = createRequest("999999999999999999999");
    const result = checkBodySize(request, 1024);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = (await result!.json()) as { error: string };
    expect(body.error).toBe("Invalid Content-Length header");
  });
});

describe("enforceBodyLimit actual-byte enforcement", () => {
  function streamRequest(chunks: Uint8Array[], onCancel?: () => void): Request {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
      cancel() {
        onCancel?.();
      },
    });
    return new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
  }

  it("enforces the limit when Content-Length is absent", async () => {
    const request = streamRequest([new Uint8Array(2048)]);
    const result = await enforceBodyLimit(request, 1024);
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(413);
  });

  it("allows an absent-Content-Length body within the limit and replays it", async () => {
    const request = streamRequest([new TextEncoder().encode("hello")]);
    const result = await enforceBodyLimit(request, 1024);
    expect(result.response).toBeNull();
    await expect(result.request.text()).resolves.toBe("hello");
  });

  it("allows a body exactly at the limit", async () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "12345",
    });
    const result = await enforceBodyLimit(request, 5);
    expect(result.response).toBeNull();
    await expect(result.request.text()).resolves.toBe("12345");
  });

  it("counts multibyte UTF-8 bytes rather than characters", async () => {
    const over = new Request("https://example.com/api/test", {
      method: "POST",
      body: "éé",
    });
    const overResult = await enforceBodyLimit(over, 3);
    expect(overResult.response?.status).toBe(413);

    const exact = new Request("https://example.com/api/test", {
      method: "POST",
      body: "é",
    });
    const exactResult = await enforceBodyLimit(exact, 2);
    expect(exactResult.response).toBeNull();
    await expect(exactResult.request.text()).resolves.toBe("é");
  });

  it("cancels the source stream once the limit is exceeded", async () => {
    let cancelled = false;
    const request = streamRequest(
      [new Uint8Array(10), new Uint8Array(10)],
      () => {
        cancelled = true;
      },
    );
    const result = await enforceBodyLimit(request, 5);
    expect(result.response?.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it("preserves malformed Content-Length handling", async () => {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "content-length": "abc" },
    });
    const result = await enforceBodyLimit(request, 1024);
    expect(result.response?.status).toBe(400);
  });

  it("rejects oversized signed webhook ingress before buffering", async () => {
    const { handleIncomingWebhookRequest } =
      await import("../../../worker/routes/webhooks/incoming");
    const request = new Request(
      "https://example.com/webhooks/incoming/partner-1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Uint8Array(300 * 1024),
        duplex: "half",
      } as RequestInit,
    );

    const response = await handleIncomingWebhookRequest(
      request,
      {} as Env,
      "partner-1",
    );
    expect(response.status).toBe(413);
  });
});
