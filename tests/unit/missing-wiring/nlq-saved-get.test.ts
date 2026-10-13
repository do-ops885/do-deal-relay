/**
 * Missing-wiring sweep: GET /api/nlq/saved/:id.
 *
 * `getSavedQuery` existed in worker/lib/d1/nlq-saved without an HTTP surface;
 * ownership is enforced in SQL so another user's id resolves as 404.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";
import { jsonRecord } from "../../fixtures/typed-assert";

const mocks = vi.hoisted(() => ({
  getSavedQuery: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock("../../../worker/lib/d1/nlq-saved", () => ({
  saveQuery: vi.fn(),
  listSavedQueries: vi.fn(),
  deleteSavedQuery: vi.fn(),
  getSavedQuery: mocks.getSavedQuery,
}));

vi.mock("../../../worker/lib/auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { handleSavedGetById } from "../../../worker/routes/nlq/saved";

const db = {} as Env["DEALS_DB"];
const env = { DEALS_DB: db } as unknown as Env;

function request(): Request {
  return new Request("https://example.com/api/nlq/saved/saved-1");
}

const row = {
  id: "saved-1",
  user_id: "user-1",
  query: "top trading bonuses",
  name: "trading",
  intent: "rank",
  created_at: "2026-10-13T00:00:00Z",
  updated_at: "2026-10-13T00:00:00Z",
};

describe("GET /api/nlq/saved/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
    });
  });

  it("returns 503 when D1 is not configured", async () => {
    const response = await handleSavedGetById(
      request(),
      {} as unknown as Env,
      "saved-1",
    );
    expect(response.status).toBe(503);
  });

  it("returns 401 for anonymous callers", async () => {
    mocks.authenticateRequest.mockResolvedValue({ authenticated: false });
    const response = await handleSavedGetById(request(), env, "saved-1");
    expect(response.status).toBe(401);
    expect(mocks.getSavedQuery).not.toHaveBeenCalled();
  });

  it("returns the saved query owned by the caller", async () => {
    mocks.getSavedQuery.mockResolvedValue(row);
    const response = await handleSavedGetById(request(), env, "saved-1");
    expect(response.status).toBe(200);
    expect(jsonRecord(jsonRecord(await response.json()).saved).id).toBe(
      "saved-1",
    );
    expect(mocks.getSavedQuery).toHaveBeenCalledWith(db, "user-1", "saved-1");
  });

  it("returns 404 when the id is unknown or owned by someone else", async () => {
    mocks.getSavedQuery.mockResolvedValue(null);
    const response = await handleSavedGetById(request(), env, "saved-1");
    expect(response.status).toBe(404);
    expect(jsonRecord(await response.json()).code).toBe("NOT_FOUND");
  });

  it("returns 503 with a migration hint when the table is missing", async () => {
    mocks.getSavedQuery.mockRejectedValue(new Error("no such table: x"));
    const response = await handleSavedGetById(request(), env, "saved-1");
    expect(response.status).toBe(503);
    expect(jsonRecord(await response.json()).code).toBe("MIGRATION_PENDING");
  });

  it("returns 500 on unexpected storage errors", async () => {
    mocks.getSavedQuery.mockRejectedValue(new Error("D1_ERROR"));
    const response = await handleSavedGetById(request(), env, "saved-1");
    expect(response.status).toBe(500);
    expect(jsonRecord(await response.json()).code).toBe("GET_FAILED");
  });
});
