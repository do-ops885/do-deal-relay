# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api.spec.ts >> Ranked Deals API >> GET /deals/highlights returns featured deals
- Location: tests/e2e/api.spec.ts:133:3

# Error details

```
Error: expect(received).toHaveProperty(path)

Expected path: "generated_at"
Received path: []

Received value: {"expiring_soon": [], "meta": {"expiring_soon_count": 0, "recently_added_count": 1, "top_deals_count": 1}, "recently_added": [{"code": "WELCOME2024", "description": "Test deal for endpoint verification", "expiry": {"confidence": 0.8, "type": "soft"}, "id": "test-deal-1", "metadata": {"category": ["welcome"], "confidence_score": 0.5, "normalized_at": "2026-03-31T19:20:00Z", "status": "active", "tags": ["test"]}, "requirements": ["New users only"], "reward": {"currency": "USD", "type": "cash", "value": 50}, "source": {"discovered_at": "2026-03-31T19:20:00Z", "domain": "example.com", "trust_score": 0.5, "url": "https://example.com"}, "title": "Test Welcome Deal", "url": "https://example.com/welcome"}], "top_deals": [{"code": "WELCOME2024", "description": "Test deal for endpoint verification", "expiry": {"confidence": 0.8, "type": "soft"}, "id": "test-deal-1", "metadata": {"category": ["welcome"], "confidence_score": 0.5, "normalized_at": "2026-03-31T19:20:00Z", "status": "active", "tags": ["test"]}, "requirements": ["New users only"], "reward": {"currency": "USD", "type": "cash", "value": 50}, "source": {"discovered_at": "2026-03-31T19:20:00Z", "domain": "example.com", "trust_score": 0.5, "url": "https://example.com"}, "title": "Test Welcome Deal", "url": "https://example.com/welcome"}]}
```

# Test source

```ts
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
  120 |     const body = await response.json();
  121 |     expect(body.sort_by).toBe("confidence");
  122 |   });
  123 | 
  124 |   test("GET /deals/ranked supports sorting by value", async ({ request }) => {
  125 |     const response = await request.get("/deals/ranked?sort_by=value");
  126 | 
  127 |     expect(response.ok()).toBeTruthy();
  128 | 
  129 |     const body = await response.json();
  130 |     expect(body.sort_by).toBe("value");
  131 |   });
  132 | 
  133 |   test("GET /deals/highlights returns featured deals", async ({ request }) => {
  134 |     const response = await request.get("/deals/highlights");
  135 | 
  136 |     expect(response.ok()).toBeTruthy();
  137 |     expect(response.status()).toBe(200);
  138 | 
  139 |     const body = await response.json();
  140 |     expect(body).toHaveProperty("top_deals");
  141 |     expect(body).toHaveProperty("expiring_soon");
  142 |     expect(body).toHaveProperty("recently_added");
> 143 |     expect(body).toHaveProperty("generated_at");
      |                  ^ Error: expect(received).toHaveProperty(path)
  144 |   });
  145 | });
  146 | 
  147 | test.describe("Analytics API", () => {
  148 |   test("GET /api/analytics returns analytics data", async ({ request }) => {
  149 |     const response = await request.get("/api/analytics");
  150 | 
  151 |     expect(response.ok()).toBeTruthy();
  152 |     expect(response.status()).toBe(200);
  153 | 
  154 |     const body = await response.json();
  155 |     expect(body).toHaveProperty("summary");
  156 |     expect(body).toHaveProperty("categories");
  157 |     expect(body).toHaveProperty("sources");
  158 |     expect(body).toHaveProperty("quality");
  159 |     expect(body).toHaveProperty("generated_at");
  160 |   });
  161 | 
  162 |   test("GET /api/analytics?format=summary returns summary only", async ({
  163 |     request,
  164 |   }) => {
  165 |     const response = await request.get("/api/analytics?format=summary");
  166 | 
  167 |     expect(response.ok()).toBeTruthy();
  168 |     expect(response.status()).toBe(200);
  169 | 
  170 |     const body = await response.json();
  171 |     expect(body).toHaveProperty("summary");
  172 |     expect(body.summary).toHaveProperty("total_deals");
  173 |     expect(body.summary).toHaveProperty("active_deals");
  174 |   });
  175 | });
  176 | 
  177 | test.describe("API Status Endpoints", () => {
  178 |   test("GET /api/status returns pipeline status", async ({ request }) => {
  179 |     const response = await request.get("/api/status");
  180 | 
  181 |     expect(response.ok()).toBeTruthy();
  182 |     expect(response.status()).toBe(200);
  183 | 
  184 |     const body = await response.json();
  185 |     expect(body).toHaveProperty("version");
  186 |     expect(body).toHaveProperty("pipeline_status");
  187 |     expect(body).toHaveProperty("kv_namespaces");
  188 |   });
  189 | 
  190 |   test("GET /api/log returns recent logs", async ({ request }) => {
  191 |     const response = await request.get("/api/log");
  192 | 
  193 |     expect(response.ok()).toBeTruthy();
  194 |     expect(response.status()).toBe(200);
  195 | 
  196 |     const body = await response.json();
  197 |     expect(body).toHaveProperty("logs");
  198 |     expect(body).toHaveProperty("count");
  199 |     expect(Array.isArray(body.logs)).toBe(true);
  200 |   });
  201 | });
  202 | 
  203 | test.describe("Metrics Endpoint", () => {
  204 |   test("GET /metrics returns Prometheus metrics", async ({ request }) => {
  205 |     const response = await request.get("/metrics");
  206 | 
  207 |     expect(response.ok()).toBeTruthy();
  208 |     expect(response.status()).toBe(200);
  209 | 
  210 |     const contentType = response.headers()["content-type"];
  211 |     expect(contentType).toContain("text/plain");
  212 | 
  213 |     const body = await response.text();
  214 |     expect(body).toContain("# HELP");
  215 |     expect(body).toContain("# TYPE");
  216 |   });
  217 | });
  218 | 
  219 | test.describe("404 Handling", () => {
  220 |   test("Invalid endpoint returns 404", async ({ request }) => {
  221 |     const response = await request.get("/invalid-endpoint");
  222 | 
  223 |     expect(response.status()).toBe(404);
  224 |   });
  225 | });
  226 | 
  227 | test.describe("CORS Headers", () => {
  228 |   test("API endpoints include CORS headers", async ({ request }) => {
  229 |     const response = await request.get("/health");
  230 | 
  231 |     expect(response.ok()).toBeTruthy();
  232 | 
  233 |     const headers = response.headers();
  234 |     // CORS headers should be present for API endpoints
  235 |     expect(headers).toBeDefined();
  236 |   });
  237 | });
  238 | 
```