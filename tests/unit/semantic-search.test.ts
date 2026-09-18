import { describe, it, expect, vi } from "vitest";
import { handleSemanticSearch } from "../../worker/routes/semantic-search";
import type { Env } from "../../worker/types";

const REMOTE_BINDING_REQUIRED_CODE = "REMOTE_BINDING_REQUIRED";
const REMOTE_VECTORIZE_MESSAGE =
  "Binding DEAL_EMBEDDINGS needs to be run remotely";
const REMOTE_AI_MESSAGE = "Binding AI needs to be run remotely";
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_BAD_REQUEST = 400;
const SEMANTIC_SEARCH_URL = "https://example.com/api/semantic-search";
const VALID_QUERY_BODY = JSON.stringify({ query: "best trading bonus" });

function mockEnv(overrides: Record<string, unknown> = {}): Env {
  return {
    ...overrides,
  } as unknown as Env;
}

function postRequest(body: string): Request {
  return new Request(SEMANTIC_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("semantic-search remote-only bindings map to 503", () => {
  it("maps remote-only Vectorize error to 503 with stable code", async () => {
    const env = mockEnv({
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
      },
      DEAL_EMBEDDINGS: {
        query: vi.fn().mockRejectedValue(new Error(REMOTE_VECTORIZE_MESSAGE)),
      },
    });
    const response = await handleSemanticSearch(
      postRequest(VALID_QUERY_BODY),
      env,
    );
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const body = (await response.json()) as {
      error: string;
      code?: string;
    };
    expect(body.code).toBe(REMOTE_BINDING_REQUIRED_CODE);
    expect(typeof body.error).toBe("string");
  });

  it("maps remote-only AI error to 503 with stable code", async () => {
    const env = mockEnv({
      AI: {
        run: vi.fn().mockRejectedValue(new Error(REMOTE_AI_MESSAGE)),
      },
      DEAL_EMBEDDINGS: {
        query: vi.fn(),
      },
    });
    const response = await handleSemanticSearch(
      postRequest(VALID_QUERY_BODY),
      env,
    );
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const body = (await response.json()) as {
      error: string;
      code?: string;
    };
    expect(body.code).toBe(REMOTE_BINDING_REQUIRED_CODE);
  });

  it("keeps unrelated errors as 500 without remote code", async () => {
    const env = mockEnv({
      AI: {
        run: vi.fn().mockRejectedValue(new Error("upstream timeout")),
      },
      DEAL_EMBEDDINGS: {
        query: vi.fn(),
      },
    });
    const response = await handleSemanticSearch(
      postRequest(VALID_QUERY_BODY),
      env,
    );
    expect(response.status).toBe(HTTP_INTERNAL_ERROR);
    const body = (await response.json()) as {
      error: string;
      code?: string;
    };
    expect(body.error).toBe("Semantic search failed");
    expect(body.code).toBeUndefined();
  });

  it("preserves 503 when bindings are absent", async () => {
    const response = await handleSemanticSearch(
      postRequest(VALID_QUERY_BODY),
      mockEnv({}),
    );
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    const body = (await response.json()) as {
      error: string;
      code?: string;
    };
    expect(body.error).toContain("not configured");
    expect(body.code).toBeUndefined();
  });

  it("preserves 405 for non-POST and 400 for invalid body", async () => {
    const getResponse = await handleSemanticSearch(
      new Request(SEMANTIC_SEARCH_URL, { method: "GET" }),
      mockEnv({ AI: {}, DEAL_EMBEDDINGS: {} }),
    );
    expect(getResponse.status).toBe(HTTP_METHOD_NOT_ALLOWED);

    const badEnv = mockEnv({
      AI: { run: vi.fn() },
      DEAL_EMBEDDINGS: { query: vi.fn() },
    });
    const badResponse = await handleSemanticSearch(
      postRequest(JSON.stringify({ query: "" })),
      badEnv,
    );
    expect(badResponse.status).toBe(HTTP_BAD_REQUEST);
  });
});
