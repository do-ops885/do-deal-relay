import { describe, it, expect } from "vitest";
import { checkBodySize } from "../../../worker/middleware/body-limit";

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
