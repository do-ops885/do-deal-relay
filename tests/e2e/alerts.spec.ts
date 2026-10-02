import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

/**
 * Alert subscription route E2E coverage (#764 step-6 remainder, ADR-031).
 *
 * Exercises /api/nlq/alerts against the local dev server: unauthenticated
 * 401s, Zod 400s, saved-query ownership 404, the full
 * create -> list -> patch -> delete lifecycle, cross-user isolation, and
 * the detail-path error contracts (PATCH 400, GET 405).
 *
 * Rate-limit aware: /api/nlq is 10 req/60s per user and /api/auth/register
 * is 5 req/60s, so the file runs serial with three cached registered
 * users (5, 8, and 7 NLQ calls each). Data-owning flows must register:
 * the seeded admin JWT has no D1 user row, so writes 500 on the FK.
 * Zero hardcoded secrets: passwords random per run.
 */

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const E2E_USER_NAME = "Alerts E2E User";
const ALERT_DESTINATION = "https://example.com/hook";
const DEFAULT_THRESHOLD = 0.7;
const UPDATED_THRESHOLD = 0.9;
const OUT_OF_RANGE_THRESHOLD = 1.5;
const ACTIVE = 1;
const INACTIVE = 0;
const JWT_TOKEN_CANDIDATES = [
  join(process.cwd(), "tests", "e2e", ".jwt-token"),
  join(process.cwd(), ".jwt-token"),
];

interface D1InitBody {
  success: boolean;
  message?: string;
  applied?: number[];
  error?: string;
}

interface LoginBody {
  accessToken?: string;
  user?: { id: string };
}

interface SavedPostBody {
  success: boolean;
  saved?: { id: string; query: string };
  error?: string;
  code?: string;
}

interface AlertRow {
  id: string;
  user_id: string;
  saved_query_id: string;
  channel: string;
  destination: string;
  threshold: number;
  frequency: string;
  active: number;
  created_at: string;
  updated_at: string;
}

interface AlertPostBody {
  success: boolean;
  subscription?: AlertRow;
  error?: string;
  code?: string;
}

interface AlertListBody {
  success: boolean;
  total: number;
  count: number;
  subscriptions: AlertRow[];
  error?: string;
  code?: string;
}

interface ErrorBody {
  error?: string;
  code?: string;
}

function readAdminToken(): string | null {
  for (const candidate of JWT_TOKEN_CANDIDATES) {
    if (!existsSync(candidate)) continue;
    const token = readFileSync(candidate, "utf-8").trim();
    if (token.split(".").length === 3) return token;
  }
  return null;
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
}

async function ensureD1Initialized(
  request: import("@playwright/test").APIRequestContext,
): Promise<void> {
  const adminToken = readAdminToken();
  test.skip(
    adminToken === null,
    "No admin JWT at tests/e2e/.jwt-token — JWT-based E2E tests skipped",
  );
  const response = await request.get("/api/d1/migrations?action=init", {
    headers: { Authorization: `Bearer ${adminToken as string}` },
  });
  expect(response.status()).toBe(HTTP_OK);
  const body = (await response.json()) as unknown as D1InitBody;
  expect(
    body.success,
    `D1 init must report success, got: ${JSON.stringify(body)}`,
  ).toBe(true);
}

async function registerAndLogin(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  const suffix = uniqueSuffix();
  const email = `alerts-e2e-${suffix}@example.com`;
  const password = randomUUID();

  const registerResponse = await request.post("/api/auth/register", {
    data: { email, password, name: E2E_USER_NAME },
  });
  expect([HTTP_OK, HTTP_CREATED, HTTP_BAD_REQUEST]).toContain(
    registerResponse.status(),
  );

  const loginResponse = await request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(loginResponse.status()).toBe(HTTP_OK);
  const loginBody = (await loginResponse.json()) as unknown as LoginBody;
  expect(loginBody.accessToken).toBeDefined();
  const token = loginBody.accessToken;
  expect(typeof token).toBe("string");
  expect((token as string).length).toBeGreaterThan(0);
  return token as string;
}

// Serial mode shares one module instance, so cached tokens stay per-file
// and register calls total two, well under the 5/60s register budget.
let primaryToken: string | undefined;
let secondaryToken: string | undefined;
let lifecycleToken: string | undefined;

async function primaryUser(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  if (primaryToken === undefined) {
    primaryToken = await registerAndLogin(request);
  }
  return primaryToken;
}

async function secondaryUser(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  if (secondaryToken === undefined) {
    secondaryToken = await registerAndLogin(request);
  }
  return secondaryToken;
}

async function lifecycleUser(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  if (lifecycleToken === undefined) {
    lifecycleToken = await registerAndLogin(request);
  }
  return lifecycleToken;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function createSavedQuery(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  suffix: string,
): Promise<string> {
  const response = await request.post("/api/nlq/saved", {
    headers: { ...bearer(token), "Content-Type": "application/json" },
    data: {
      query: `alerts e2e query ${suffix}`,
      name: `alerts-e2e-${suffix}`,
    },
  });
  expect(response.status()).toBe(HTTP_CREATED);
  const body = (await response.json()) as unknown as SavedPostBody;
  expect(body.success).toBe(true);
  const id = body.saved?.id;
  expect(typeof id).toBe("string");
  return id as string;
}

async function createAlert(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  savedQueryId: string,
): Promise<AlertRow> {
  const response = await request.post("/api/nlq/alerts", {
    headers: { ...bearer(token), "Content-Type": "application/json" },
    data: {
      saved_query_id: savedQueryId,
      channel: "webhook",
      destination: ALERT_DESTINATION,
    },
  });
  expect(response.status()).toBe(HTTP_CREATED);
  const body = (await response.json()) as unknown as AlertPostBody;
  expect(body.success).toBe(true);
  const sub = body.subscription;
  expect(sub).toBeDefined();
  return sub as AlertRow;
}

test.describe.configure({ mode: "serial" });

test.describe("NLQ alert subscriptions (D1-backed)", () => {
  test("POST /api/nlq/alerts rejects unauthenticated requests", async ({
    request,
  }) => {
    const response = await request.post("/api/nlq/alerts", {
      data: {
        saved_query_id: randomUUID(),
        channel: "webhook",
        destination: ALERT_DESTINATION,
      },
    });
    expect(response.status()).toBe(HTTP_UNAUTHORIZED);
    const body = (await response.json()) as unknown as ErrorBody;
    // The outer withAuth gate returns { error } without a code field.
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  test("POST /api/nlq/alerts validates request body", async ({ request }) => {
    await ensureD1Initialized(request);
    const token = await primaryUser(request);

    const response = await request.post("/api/nlq/alerts", {
      headers: { ...bearer(token), "Content-Type": "application/json" },
      data: { channel: "pigeon", destination: ALERT_DESTINATION },
    });
    expect(response.status()).toBe(HTTP_BAD_REQUEST);
    const body = (await response.json()) as unknown as ErrorBody;
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("POST /api/nlq/alerts rejects an unknown saved query", async ({
    request,
  }) => {
    await ensureD1Initialized(request);
    const token = await primaryUser(request);

    const response = await request.post("/api/nlq/alerts", {
      headers: { ...bearer(token), "Content-Type": "application/json" },
      data: {
        saved_query_id: randomUUID(),
        channel: "webhook",
        destination: ALERT_DESTINATION,
      },
    });
    expect(response.status()).toBe(HTTP_NOT_FOUND);
    const body = (await response.json()) as unknown as ErrorBody;
    expect(body.code).toBe("SAVED_QUERY_NOT_FOUND");
  });

  test("alert subscription lifecycle: create, list, patch, delete", async ({
    request,
  }) => {
    await ensureD1Initialized(request);
    const token = await lifecycleUser(request);
    const savedQueryId = await createSavedQuery(request, token, uniqueSuffix());

    const created = await createAlert(request, token, savedQueryId);
    expect(created.saved_query_id).toBe(savedQueryId);
    expect(created.channel).toBe("webhook");
    expect(created.destination).toBe(ALERT_DESTINATION);
    expect(created.threshold).toBe(DEFAULT_THRESHOLD);
    expect(created.frequency).toBe("instant");
    expect(created.active).toBe(ACTIVE);

    const listResponse = await request.get("/api/nlq/alerts", {
      headers: bearer(token),
    });
    expect(listResponse.status()).toBe(HTTP_OK);
    const listBody = (await listResponse.json()) as unknown as AlertListBody;
    expect(listBody.success).toBe(true);
    expect(listBody.total).toBeGreaterThanOrEqual(1);
    expect(listBody.subscriptions.map((row) => row.id)).toContain(created.id);

    const patchResponse = await request.patch(`/api/nlq/alerts/${created.id}`, {
      headers: { ...bearer(token), "Content-Type": "application/json" },
      data: {
        threshold: UPDATED_THRESHOLD,
        frequency: "daily-digest",
        active: false,
      },
    });
    expect(patchResponse.status()).toBe(HTTP_OK);
    const patchBody = (await patchResponse.json()) as unknown as AlertPostBody;
    expect(patchBody.success).toBe(true);
    expect(patchBody.subscription?.threshold).toBe(UPDATED_THRESHOLD);
    expect(patchBody.subscription?.frequency).toBe("daily-digest");
    expect(patchBody.subscription?.active).toBe(INACTIVE);

    const deleteResponse = await request.delete(
      `/api/nlq/alerts/${created.id}`,
      { headers: bearer(token) },
    );
    expect(deleteResponse.status()).toBe(HTTP_OK);

    const listAfter = await request.get("/api/nlq/alerts", {
      headers: bearer(token),
    });
    const listAfterBody = (await listAfter.json()) as unknown as AlertListBody;
    expect(listAfterBody.subscriptions.map((row) => row.id)).not.toContain(
      created.id,
    );

    const deleteAgain = await request.delete(`/api/nlq/alerts/${created.id}`, {
      headers: bearer(token),
    });
    expect(deleteAgain.status()).toBe(HTTP_NOT_FOUND);
  });

  test("cross-user access returns 404", async ({ request }) => {
    await ensureD1Initialized(request);
    const ownerToken = await secondaryUser(request);
    const otherToken = await primaryUser(request);
    const savedQueryId = await createSavedQuery(
      request,
      ownerToken,
      uniqueSuffix(),
    );
    const created = await createAlert(request, ownerToken, savedQueryId);

    const otherPatch = await request.patch(`/api/nlq/alerts/${created.id}`, {
      headers: { ...bearer(otherToken), "Content-Type": "application/json" },
      data: { threshold: UPDATED_THRESHOLD },
    });
    expect(otherPatch.status()).toBe(HTTP_NOT_FOUND);

    const otherDelete = await request.delete(`/api/nlq/alerts/${created.id}`, {
      headers: bearer(otherToken),
    });
    expect(otherDelete.status()).toBe(HTTP_NOT_FOUND);

    const otherList = await request.get("/api/nlq/alerts", {
      headers: bearer(otherToken),
    });
    const otherListBody = (await otherList.json()) as unknown as AlertListBody;
    expect(otherListBody.subscriptions.map((row) => row.id)).not.toContain(
      created.id,
    );

    const cleanup = await request.delete(`/api/nlq/alerts/${created.id}`, {
      headers: bearer(ownerToken),
    });
    expect(cleanup.status()).toBe(HTTP_OK);
  });

  test("detail path error contracts: PATCH 400, GET 405", async ({
    request,
  }) => {
    await ensureD1Initialized(request);
    const token = await secondaryUser(request);
    const savedQueryId = await createSavedQuery(request, token, uniqueSuffix());
    const created = await createAlert(request, token, savedQueryId);

    const badPatch = await request.patch(`/api/nlq/alerts/${created.id}`, {
      headers: { ...bearer(token), "Content-Type": "application/json" },
      data: { threshold: OUT_OF_RANGE_THRESHOLD },
    });
    expect(badPatch.status()).toBe(HTTP_BAD_REQUEST);
    const badPatchBody = (await badPatch.json()) as unknown as ErrorBody;
    expect(badPatchBody.code).toBe("VALIDATION_ERROR");

    const getDetail = await request.get(`/api/nlq/alerts/${created.id}`, {
      headers: bearer(token),
    });
    expect(getDetail.status()).toBe(HTTP_METHOD_NOT_ALLOWED);
    const getDetailBody = (await getDetail.json()) as unknown as ErrorBody;
    expect(getDetailBody.code).toBe("METHOD_NOT_ALLOWED");

    const cleanup = await request.delete(`/api/nlq/alerts/${created.id}`, {
      headers: bearer(token),
    });
    expect(cleanup.status()).toBe(HTTP_OK);
  });
});
