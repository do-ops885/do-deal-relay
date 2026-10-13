/**
 * Missing-wiring sweep: admin CI status + referral reconciliation handlers.
 *
 * Both handlers route capabilities that existed in `worker/lib` without an
 * HTTP surface (worker/lib/github/workflows.ts, reconcileReferralStores).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";
import { jsonRecord } from "../../fixtures/typed-assert";

const mocks = vi.hoisted(() => ({
  getWorkflowRuns: vi.fn(),
  getWorkflowStatusSummary: vi.fn(),
  waitForWorkflowsComplete: vi.fn(),
  loggerError: vi.fn(),
  reconcileReferralStores: vi.fn(),
}));

vi.mock("../../../worker/lib/github/workflows", () => ({
  getWorkflowRuns: mocks.getWorkflowRuns,
  getWorkflowStatusSummary: mocks.getWorkflowStatusSummary,
  waitForWorkflowsComplete: mocks.waitForWorkflowsComplete,
}));

vi.mock("../../../worker/lib/github/core", () => ({
  getGitHubLogger: () => ({ error: mocks.loggerError }),
}));

vi.mock("../../../worker/lib/referral-storage/dual-write", () => ({
  reconcileReferralStores: mocks.reconcileReferralStores,
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { handleCiStatus } from "../../../worker/routes/admin/ci-status";
import { handleReconcileReferrals } from "../../../worker/routes/admin/referrals";

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_REPO: "do-ops885/do-deal-relay",
    GITHUB_TOKEN: "ghp_test",
    ...overrides,
  } as unknown as Env;
}

function getRequest(query = ""): Request {
  return new Request(`https://example.com/api/admin/ci-status${query}`);
}

describe("admin ci-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkflowRuns.mockResolvedValue([
      {
        id: 1,
        name: "CI",
        head_sha: "abc1234",
        status: "completed",
        conclusion: "success",
        html_url: "https://example.com/run/1",
        created_at: "2026-10-13T00:00:00Z",
        updated_at: "2026-10-13T00:05:00Z",
      },
    ]);
    mocks.getWorkflowStatusSummary.mockResolvedValue({
      total_runs: 1,
      completed_runs: 1,
      successful_runs: 1,
      failed_runs: 0,
      pending_runs: 0,
    });
    mocks.waitForWorkflowsComplete.mockResolvedValue({
      success: true,
      status: {
        total_runs: 1,
        completed_runs: 1,
        successful_runs: 1,
        failed_runs: 0,
        pending_runs: 0,
      },
      attempts: 2,
    });
  });

  it("returns 503 when GITHUB_REPO is missing", async () => {
    const request = getRequest();
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv({ GITHUB_REPO: "" }),
    );
    expect(response.status).toBe(503);
    expect(jsonRecord(await response.json()).code).toBe(
      "GITHUB_REPO_NOT_CONFIGURED",
    );
  });

  it("returns 503 when GITHUB_TOKEN is missing", async () => {
    const request = getRequest();
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv({ GITHUB_TOKEN: "" }),
    );
    expect(response.status).toBe(503);
    expect(jsonRecord(await response.json()).code).toBe(
      "GITHUB_TOKEN_NOT_CONFIGURED",
    );
  });

  it("rejects an invalid branch name", async () => {
    const request = getRequest("?branch=main;rm -rf");
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv(),
    );
    expect(response.status).toBe(400);
    expect(mocks.getWorkflowStatusSummary).not.toHaveBeenCalled();
  });

  it("rejects an invalid commit sha", async () => {
    const request = getRequest("?commit=not-a-sha");
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("returns the workflow summary and recent runs", async () => {
    const request = getRequest("?branch=main&runs=5");
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv(),
    );
    expect(response.status).toBe(200);
    const body = jsonRecord(await response.json());
    expect(body.branch).toBe("main");
    expect(jsonRecord(body.summary).successful_runs).toBe(1);
    expect(mocks.getWorkflowRuns).toHaveBeenCalledWith(
      "do-ops885/do-deal-relay",
      "main",
      5,
    );
  });

  it("clamps the runs parameter to the allowed maximum", async () => {
    const request = getRequest("?runs=9999");
    await handleCiStatus(request, new URL(request.url), buildEnv());
    expect(mocks.getWorkflowRuns).toHaveBeenCalledWith(
      "do-ops885/do-deal-relay",
      "main",
      20,
    );
  });

  it("polls for completion when wait=1 with a bounded attempt count", async () => {
    const request = getRequest("?wait=1&attempts=9&commit=abc1234");
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv(),
    );
    expect(response.status).toBe(200);
    const body = jsonRecord(await response.json());
    expect(body.success).toBe(true);
    expect(mocks.waitForWorkflowsComplete).toHaveBeenCalledWith(
      "do-ops885/do-deal-relay",
      "main",
      { maxAttempts: 5, pollIntervalMs: 2000, targetCommitSha: "abc1234" },
    );
  });

  it("returns 502 and logs when GitHub is unavailable", async () => {
    mocks.getWorkflowStatusSummary.mockRejectedValue(new Error("boom"));
    const request = getRequest();
    const response = await handleCiStatus(
      request,
      new URL(request.url),
      buildEnv(),
    );
    expect(response.status).toBe(502);
    expect(jsonRecord(await response.json()).code).toBe("GITHUB_UNAVAILABLE");
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

describe("admin referral reconcile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when neither store is configured", async () => {
    const request = new Request(
      "https://example.com/api/admin/referrals/reconcile",
      { method: "POST" },
    );
    const response = await handleReconcileReferrals(
      request,
      {} as unknown as Env,
    );
    expect(response.status).toBe(503);
  });

  it("reports divergence without mutating stores", async () => {
    mocks.reconcileReferralStores.mockResolvedValue({
      kvCount: 12,
      d1Count: 10,
      divergent: true,
    });
    const request = new Request(
      "https://example.com/api/admin/referrals/reconcile",
      { method: "POST" },
    );
    const response = await handleReconcileReferrals(
      request,
      buildEnv({ DEALS_PROD: {} as Env["DEALS_PROD"] }),
    );
    expect(response.status).toBe(200);
    const body = jsonRecord(await response.json());
    expect(body.action_required).toBe(true);
    expect(jsonRecord(body.reconciled).kvCount).toBe(12);
  });

  it("reports convergence", async () => {
    mocks.reconcileReferralStores.mockResolvedValue({
      kvCount: 4,
      d1Count: 4,
      divergent: false,
    });
    const request = new Request(
      "https://example.com/api/admin/referrals/reconcile",
      { method: "POST" },
    );
    const response = await handleReconcileReferrals(
      request,
      buildEnv({ DEALS_DB: {} as Env["DEALS_DB"] }),
    );
    const body = jsonRecord(await response.json());
    expect(body.action_required).toBe(false);
  });
});
