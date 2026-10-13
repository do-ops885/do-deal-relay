/**
 * Missing-wiring sweep: log trace lookup + structured JSONL export.
 *
 * `queryLogsByTraceId` and `exportStructuredLogsAsJSONL` existed in
 * worker/lib/logger without an HTTP surface; both are routed through
 * GET /api/log (worker/routes/core/pipeline.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";
import { jsonRecord, recordArray } from "../../fixtures/typed-assert";

const mocks = vi.hoisted(() => ({
  getRunLogs: vi.fn(),
  getRecentLogs: vi.fn(),
  exportLogsAsJSONL: vi.fn(),
  exportStructuredLogsAsJSONL: vi.fn(),
  queryLogsByTraceId: vi.fn(),
}));

vi.mock("../../../worker/lib/logger", () => ({
  getRunLogs: mocks.getRunLogs,
  getRecentLogs: mocks.getRecentLogs,
  exportLogsAsJSONL: mocks.exportLogsAsJSONL,
  exportStructuredLogsAsJSONL: mocks.exportStructuredLogsAsJSONL,
  queryLogsByTraceId: mocks.queryLogsByTraceId,
}));

vi.mock("../../../worker/state-machine", () => ({
  executePipeline: vi.fn(),
  getPipelineStatus: vi.fn(),
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { handleGetLogs } from "../../../worker/routes/core/pipeline";

const env = {} as unknown as Env;

function logsRequest(query = ""): { request: Request; url: URL } {
  const request = new Request(`https://example.com/api/log${query}`);
  return { request, url: new URL(request.url) };
}

describe("GET /api/log wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRecentLogs.mockResolvedValue([]);
    mocks.getRunLogs.mockResolvedValue([]);
    mocks.exportLogsAsJSONL.mockResolvedValue('{"legacy":true}');
    mocks.exportStructuredLogsAsJSONL.mockResolvedValue('{"structured":true}');
    mocks.queryLogsByTraceId.mockResolvedValue([
      { timestamp: "2026-10-13T00:00:00Z", level: "info", message: "hello" },
    ]);
  });

  it("returns structured entries for a trace_id lookup", async () => {
    const { request, url } = logsRequest("?trace_id=trace-123");
    const response = await handleGetLogs(url, env, request);
    expect(response.status).toBe(200);
    const body = jsonRecord(await response.json());
    expect(body.trace_id).toBe("trace-123");
    expect(body.count).toBe(1);
    expect(recordArray(body.logs)).toHaveLength(1);
    expect(mocks.queryLogsByTraceId).toHaveBeenCalledWith(env, "trace-123");
    expect(mocks.getRecentLogs).not.toHaveBeenCalled();
  });

  it("rejects a malformed trace_id without hitting KV", async () => {
    const { request, url } = logsRequest("?trace_id=bad%20id!");
    const response = await handleGetLogs(url, env, request);
    expect(response.status).toBe(400);
    expect(jsonRecord(await response.json()).code).toBe("INVALID_TRACE_ID");
    expect(mocks.queryLogsByTraceId).not.toHaveBeenCalled();
  });

  it("exports structured logs as JSONL", async () => {
    const { request, url } = logsRequest("?format=structured-jsonl");
    const response = await handleGetLogs(url, env, request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(response.headers.get("Content-Disposition")).toContain(
      "structured-logs.jsonl",
    );
    expect(await response.text()).toBe('{"structured":true}');
    expect(mocks.exportStructuredLogsAsJSONL).toHaveBeenCalledWith(env);
  });

  it("keeps the legacy JSONL export unchanged", async () => {
    const { request, url } = logsRequest("?format=jsonl");
    const response = await handleGetLogs(url, env, request);
    expect(response.headers.get("Content-Disposition")).toContain(
      "deals-research.jsonl",
    );
    expect(mocks.exportLogsAsJSONL).toHaveBeenCalledWith(env);
    expect(mocks.exportStructuredLogsAsJSONL).not.toHaveBeenCalled();
  });

  it("still supports run_id and count lookups", async () => {
    const { request, url } = logsRequest("?run_id=run-1");
    await handleGetLogs(url, env, request);
    expect(mocks.getRunLogs).toHaveBeenCalledWith(env, "run-1");

    vi.clearAllMocks();
    mocks.getRecentLogs.mockResolvedValue([]);
    const second = logsRequest("?count=5");
    await handleGetLogs(second.url, env, second.request);
    expect(mocks.getRecentLogs).toHaveBeenCalledWith(env, 5);
  });
});
