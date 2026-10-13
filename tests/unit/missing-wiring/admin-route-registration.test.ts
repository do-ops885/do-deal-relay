/**
 * Missing-wiring sweep: admin route registration.
 *
 * Confirms the new /api/admin/ci-status and /api/admin/referrals/reconcile
 * endpoints are dispatched through the admin ladder with the admin role
 * required, and that unknown admin paths still fall through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";

const mocks = vi.hoisted(() => ({
  handleCiStatus: vi.fn(async () => new Response("ci")),
  handleReconcileReferrals: vi.fn(async () => new Response("reconcile")),
  withAuth: vi.fn(),
}));

vi.mock("../../../worker/routes/admin/ci-status", () => ({
  handleCiStatus: mocks.handleCiStatus,
}));

vi.mock("../../../worker/routes/admin/referrals", () => ({
  handleReconcileReferrals: mocks.handleReconcileReferrals,
}));

vi.mock("../../../worker/lib/auth", () => ({
  withAuth: mocks.withAuth,
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { tryHandleAdminKeyRoutes } from "../../../worker/router/legacy-auth-routes";

const env = {} as unknown as Env;

describe("admin route registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAuth.mockImplementation(
      async (
        _request: Request,
        _env: Env,
        _role: string,
        handler: (auth: unknown) => Promise<Response>,
      ) => handler({ authenticated: true, role: "admin", userId: "admin-1" }),
    );
  });

  it("registers GET /api/admin/ci-status behind the admin role", async () => {
    const request = new Request("https://example.com/api/admin/ci-status");
    const response = await tryHandleAdminKeyRoutes(
      request,
      env,
      new URL(request.url),
      "/api/admin/ci-status",
    );

    expect(response).not.toBeNull();
    expect(mocks.withAuth).toHaveBeenCalledWith(
      request,
      env,
      "admin",
      expect.any(Function),
    );
    expect(mocks.handleCiStatus).toHaveBeenCalledWith(
      request,
      expect.any(URL),
      env,
    );
  });

  it("registers POST /api/admin/referrals/reconcile behind the admin role", async () => {
    const request = new Request(
      "https://example.com/api/admin/referrals/reconcile",
      { method: "POST" },
    );
    const response = await tryHandleAdminKeyRoutes(
      request,
      env,
      new URL(request.url),
      "/api/admin/referrals/reconcile",
    );

    expect(response).not.toBeNull();
    expect(mocks.handleReconcileReferrals).toHaveBeenCalledWith(request, env);
  });

  it("ignores the wrong method and unknown admin paths", async () => {
    const post = new Request("https://example.com/api/admin/ci-status", {
      method: "POST",
    });
    expect(
      await tryHandleAdminKeyRoutes(
        post,
        env,
        new URL(post.url),
        "/api/admin/ci-status",
      ),
    ).toBeNull();
    expect(
      await tryHandleAdminKeyRoutes(
        post,
        env,
        new URL(post.url),
        "/api/admin/unknown",
      ),
    ).toBeNull();
  });
});
