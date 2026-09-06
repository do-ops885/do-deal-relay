import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../worker/types";
import type { ProgressState } from "../../worker/lib/mcp/progress";

vi.mock("../../worker/lib/mcp/tools", () => ({
  executeTool: vi.fn(),
}));

import { executeTool } from "../../worker/lib/mcp/tools";
import {
  handleStreamingToolCall,
  handleMCPStream,
} from "../../worker/routes/mcp-stream";

const executeToolMock = vi.mocked(executeTool);

function makeEnv(kvSeed: Record<string, string> = {}): Env {
  const kv = new Map<string, string>(Object.entries(kvSeed));
  const preparedStmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn(async () => ({ results: [] })),
    all: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
  };
  return {
    DEALS_PROD: {
      get: vi.fn(async (key: string) => kv.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        kv.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        kv.delete(key);
      }),
    } as unknown as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    DEALS_LOCK: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    DEALS_DB: {
      exec: vi.fn(async () => ({ count: 0, duration: 0 })),
      prepare: vi.fn(() => preparedStmt),
    } as unknown as D1Database,
    AI_GATEWAY_URL: "https://gateway.test",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/test",
    TRUST_THRESHOLD: "0.3",
    NOTIFICATION_THRESHOLD: "100",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
  } as unknown as Env;
}

function progressState(overrides: Partial<ProgressState>): ProgressState {
  const now = new Date().toISOString();
  return {
    operationId: "op-1",
    status: "running",
    progress: 0,
    total: 1,
    message: "",
    toolName: "test_tool",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRequest(url: string): Request {
  return new Request(url, { headers: { Origin: "https://example.com" } });
}

describe("handleStreamingToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an SSE response with an operation id header", async () => {
    executeToolMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const env = makeEnv();
    const response = await handleStreamingToolCall(
      { name: "test_tool", arguments: {} },
      env,
      makeRequest("https://worker.test/mcp/stream/tools/call"),
    );

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("X-Operation-Id")).toBeTruthy();
  });

  it("streams start progress, completion progress, and result events", async () => {
    executeToolMock.mockResolvedValue({
      content: [{ type: "text", text: "done" }],
    });
    const env = makeEnv();
    const response = await handleStreamingToolCall(
      { name: "test_tool", arguments: { q: "x" } },
      env,
      makeRequest("https://worker.test/mcp/stream/tools/call"),
    );
    const body = await response.text();

    expect(body).toContain("event: progress");
    expect(body).toContain('"status":"running"');
    expect(body).toContain('"status":"completed"');
    expect(body).toContain("event: result");
    expect(body).toContain("done");
    expect(executeToolMock).toHaveBeenCalledWith(
      "test_tool",
      { q: "x" },
      env,
      expect.any(Request),
    );
  });

  it("emits an error event without leaking details when the tool throws", async () => {
    executeToolMock.mockRejectedValue(
      new Error("internal secret detail: db password"),
    );
    const env = makeEnv();
    const response = await handleStreamingToolCall(
      { name: "test_tool", arguments: {} },
      env,
      makeRequest("https://worker.test/mcp/stream/tools/call"),
    );
    const body = await response.text();

    expect(body).toContain("event: error");
    expect(body).toContain("Tool execution failed");
    expect(body).not.toContain("db password");
  });

  it("persists progress state to KV via the tracker", async () => {
    executeToolMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const env = makeEnv();
    const response = await handleStreamingToolCall(
      { name: "test_tool", arguments: {} },
      env,
      makeRequest("https://worker.test/mcp/stream/tools/call"),
    );
    await response.text();

    const put = env.DEALS_PROD.put as unknown as ReturnType<typeof vi.fn>;
    expect(put).toHaveBeenCalled();
    const firstKey = put.mock.calls[0]?.[0] as string;
    expect(firstKey.startsWith("mcp:progress:")).toBe(true);
  });
});

describe("handleMCPStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when operationId is missing", async () => {
    const env = makeEnv();
    const response = await handleMCPStream(
      makeRequest("https://worker.test/mcp/stream"),
      env,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("operationId");
  });

  it("returns 404 for an unknown operation", async () => {
    const env = makeEnv();
    const response = await handleMCPStream(
      makeRequest("https://worker.test/mcp/stream?operationId=nope"),
      env,
    );
    expect(response.status).toBe(404);
  });

  it("streams progress and result for a completed operation", async () => {
    const state = progressState({
      operationId: "op-done",
      status: "completed",
      progress: 1,
      result: { content: [{ type: "text", text: "final" }] },
    });
    const env = makeEnv({
      "mcp:progress:op-done": JSON.stringify(state),
    });
    const response = await handleMCPStream(
      makeRequest("https://worker.test/mcp/stream?operationId=op-done"),
      env,
    );
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(body).toContain('"status":"completed"');
    expect(body).toContain("event: result");
    expect(body).toContain("final");
  });

  it("streams an error event for a failed operation", async () => {
    const state = progressState({
      operationId: "op-bad",
      status: "failed",
      error: "boom",
    });
    const env = makeEnv({
      "mcp:progress:op-bad": JSON.stringify(state),
    });
    const response = await handleMCPStream(
      makeRequest("https://worker.test/mcp/stream?operationId=op-bad"),
      env,
    );
    const body = await response.text();

    expect(body).toContain("event: error");
    expect(body).toContain("boom");
  });
});
