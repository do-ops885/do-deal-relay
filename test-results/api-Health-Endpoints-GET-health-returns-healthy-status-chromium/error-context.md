# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api.spec.ts >> Health Endpoints >> GET /health returns healthy status
- Location: tests/e2e/api.spec.ts:9:3

# Error details

```
Error: expect(received).toHaveProperty(path)

Expected path: "kv_status"
Received path: []

Received value: {"checks": {"kv_connection": true, "last_run_success": false, "snapshot_valid": true}, "components": {"external_services": {"github_api": true}, "kv_stores": {"deals_lock": true, "deals_log": true, "deals_prod": true, "deals_sources": true, "deals_staging": true}, "pipeline": {"average_duration_ms": 0, "last_run": "2026-04-03T09:35:19.113Z", "last_success": false}}, "metrics": {"avg_deals_per_run": 1, "success_rate_24h": 0, "total_runs_24h": 0}, "status": "healthy", "timestamp": "2026-04-03T09:35:19.113Z", "version": "0.1.0"}
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Browser-based API endpoint tests
  5   |  * Tests the Deal Discovery System using Playwright
  6   |  */
  7   | 
  8   | test.describe("Health Endpoints", () => {
  9   |   test("GET /health returns healthy status", async ({ request }) => {
  10  |     const response = await request.get("/health");
  11  | 
  12  |     expect(response.ok()).toBeTruthy();
  13  |     expect(response.status()).toBe(200);
  14  | 
  15  |     const body = await response.json();
  16  |     expect(body).toHaveProperty("status", "healthy");
  17  |     expect(body).toHaveProperty("version");
  18  |     expect(body).toHaveProperty("timestamp");
> 19  |     expect(body).toHaveProperty("kv_status");
      |                  ^ Error: expect(received).toHaveProperty(path)
  20  |     expect(body.kv_status).toHaveProperty("DEALS_PROD");
  21  |     expect(body.kv_status).toHaveProperty("DEALS_STAGING");
  22  |     expect(body.kv_status).toHaveProperty("DEALS_SOURCES");
  23  |   });
  24  | 
  25  |   test("GET /health/ready returns readiness probe", async ({ request }) => {
  26  |     const response = await request.get("/health/ready");
  27  | 
  28  |     expect(response.ok()).toBeTruthy();
  29  |     expect(response.status()).toBe(200);
  30  | 
  31  |     const body = await response.json();
  32  |     expect(body).toHaveProperty("ready");
  33  |     expect(typeof body.ready).toBe("boolean");
  34  |   });
  35  | 
  36  |   test("GET /health/live returns liveness probe", async ({ request }) => {
  37  |     const response = await request.get("/health/live");
  38  | 
  39  |     expect(response.ok()).toBeTruthy();
  40  |     expect(response.status()).toBe(200);
  41  | 
  42  |     const body = await response.json();
  43  |     expect(body).toHaveProperty("alive");
  44  |     expect(body.alive).toBe(true);
  45  |   });
  46  | });
  47  | 
  48  | test.describe("Deals API", () => {
  49  |   test("GET /deals returns deals list", async ({ request }) => {
  50  |     const response = await request.get("/deals");
  51  | 
  52  |     expect(response.ok()).toBeTruthy();
  53  |     expect(response.status()).toBe(200);
  54  | 
  55  |     const body = await response.json();
  56  |     expect(body).toHaveProperty("deals");
  57  |     expect(body).toHaveProperty("count");
  58  |     expect(body).toHaveProperty("generated_at");
  59  |     expect(Array.isArray(body.deals)).toBe(true);
  60  |   });
  61  | 
  62  |   test("GET /deals.json returns raw deals", async ({ request }) => {
  63  |     const response = await request.get("/deals.json");
  64  | 
  65  |     expect(response.ok()).toBeTruthy();
  66  |     expect(response.status()).toBe(200);
  67  | 
  68  |     const contentType = response.headers()["content-type"];
  69  |     expect(contentType).toContain("application/json");
  70  | 
  71  |     const body = await response.json();
  72  |     expect(Array.isArray(body.deals) || typeof body === "object").toBe(true);
  73  |   });
  74  | 
  75  |   test("GET /deals supports filtering by category", async ({ request }) => {
  76  |     const response = await request.get("/deals?category=finance");
  77  | 
  78  |     expect(response.ok()).toBeTruthy();
  79  |     expect(response.status()).toBe(200);
  80  | 
  81  |     const body = await response.json();
  82  |     expect(body).toHaveProperty("deals");
  83  |     expect(Array.isArray(body.deals)).toBe(true);
  84  |   });
  85  | 
  86  |   test("GET /deals supports pagination with limit", async ({ request }) => {
  87  |     const response = await request.get("/deals?limit=5");
  88  | 
  89  |     expect(response.ok()).toBeTruthy();
  90  |     expect(response.status()).toBe(200);
  91  | 
  92  |     const body = await response.json();
  93  |     expect(body).toHaveProperty("deals");
  94  |     expect(body.count).toBeLessThanOrEqual(5);
  95  |   });
  96  | });
  97  | 
  98  | test.describe("Ranked Deals API", () => {
  99  |   test("GET /deals/ranked returns ranked deals", async ({ request }) => {
  100 |     const response = await request.get("/deals/ranked");
  101 | 
  102 |     expect(response.ok()).toBeTruthy();
  103 |     expect(response.status()).toBe(200);
  104 | 
  105 |     const body = await response.json();
  106 |     expect(body).toHaveProperty("deals");
  107 |     expect(body).toHaveProperty("count");
  108 |     expect(body).toHaveProperty("sort_by");
  109 |     expect(Array.isArray(body.deals)).toBe(true);
  110 |   });
  111 | 
  112 |   test("GET /deals/ranked supports sorting by confidence", async ({
  113 |     request,
  114 |   }) => {
  115 |     const response = await request.get("/deals/ranked?sort_by=confidence");
  116 | 
  117 |     expect(response.ok()).toBeTruthy();
  118 |     expect(response.status()).toBe(200);
  119 | 
```