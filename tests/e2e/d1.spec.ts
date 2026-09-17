import { test, expect } from "@playwright/test";

/**
 * D1-backed route E2E coverage (Wave A1).
 *
 * Guards the local D1 migration-runner fix: multi-line SQL via exec() used
 * to fail locally with "incomplete input" (GET /api/d1/migrations 500,
 * POST /api/nlq/saved 503 MIGRATION_PENDING). These specs run against the
 * local dev server and fail loudly if D1 init does not report success.
 */

// biome-ignore-start lint/security/noSecrets: test fixtures, not real keys
const ADMIN_KEY = "ddr_admin_test_key_0000000000000000";
// biome-ignore-end lint/security/noSecrets

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const E2E_PASSWORD = "test-password-123";
const E2E_USER_NAME = "D1 E2E User";

interface D1StatusBody {
  success: boolean;
  status?: {
    currentVersion: number;
    latestVersion: number;
    pendingCount: number;
    pending: number[];
    appliedCount: number;
  };
  error?: string;
}

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

interface SavedRow {
  id: string;
  user_id: string;
  query: string;
  name: string | null;
  intent: string | null;
}

interface SavedPostBody {
  success: boolean;
  saved?: SavedRow;
  error?: string;
  code?: string;
}

interface SavedGetBody {
  success: boolean;
  total: number;
  count: number;
  saved: SavedRow[];
  error?: string;
  code?: string;
}

function uniqueSuffix(): string {
  const randomPart = Math.floor(Math.random() * 1296).toString(36);
  return `${Date.now().toString(36)}${randomPart}`;
}

async function ensureD1Initialized(
  request: import("@playwright/test").APIRequestContext,
): Promise<void> {
  const response = await request.get("/api/d1/migrations?action=init", {
    headers: { "X-API-Key": ADMIN_KEY },
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
  const email = `d1-e2e-${suffix}@example.com`;

  const registerResponse = await request.post("/api/auth/register", {
    data: { email, password: E2E_PASSWORD, name: E2E_USER_NAME },
  });
  expect([HTTP_OK, HTTP_CREATED, HTTP_BAD_REQUEST]).toContain(
    registerResponse.status(),
  );

  const loginResponse = await request.post("/api/auth/login", {
    data: { email, password: E2E_PASSWORD },
  });
  expect(loginResponse.status()).toBe(HTTP_OK);
  const loginBody = (await loginResponse.json()) as unknown as LoginBody;
  expect(loginBody.accessToken).toBeDefined();
  const token = loginBody.accessToken;
  expect(typeof token).toBe("string");
  expect((token as string).length).toBeGreaterThan(0);
  return token as string;
}

test.describe("D1 migrations (local runner)", () => {
  test("GET /api/d1/migrations returns 200, not 500", async ({ request }) => {
    const response = await request.get("/api/d1/migrations", {
      headers: { "X-API-Key": ADMIN_KEY },
    });

    expect(response.status()).toBe(HTTP_OK);
    const body = (await response.json()) as unknown as D1StatusBody;
    expect(body.success).toBe(true);
    expect(body.error).toBeUndefined();
  });

  test("D1 init reports success", async ({ request }) => {
    await ensureD1Initialized(request);
  });
});

test.describe("NLQ saved queries (D1-backed)", () => {
  test("POST then GET /api/nlq/saved roundtrip", async ({ request }) => {
    await ensureD1Initialized(request);
    const token = await registerAndLogin(request);
    const authHeaders = { Authorization: `Bearer ${token}` };
    const suffix = uniqueSuffix();
    const query = `find trading deals with bonus ${suffix}`;

    const postResponse = await request.post("/api/nlq/saved", {
      headers: { ...authHeaders, "Content-Type": "application/json" },
      data: { query, name: `e2e-${suffix}` },
    });

    expect(postResponse.status()).toBe(HTTP_CREATED);
    const postBody = (await postResponse.json()) as unknown as SavedPostBody;
    expect(postBody.success).toBe(true);
    expect(postBody.code).toBeUndefined();
    expect(postBody.saved).toBeDefined();
    expect(postBody.saved?.query).toBe(query);

    const getResponse = await request.get("/api/nlq/saved", {
      headers: authHeaders,
    });

    expect(getResponse.status()).toBe(HTTP_OK);
    const getBody = (await getResponse.json()) as unknown as SavedGetBody;
    expect(getBody.success).toBe(true);
    expect(getBody.code).toBeUndefined();
    expect(getBody.total).toBeGreaterThanOrEqual(1);
    expect(getBody.saved.map((row) => row.query)).toContain(query);
  });
});
