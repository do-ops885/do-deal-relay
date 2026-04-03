# E2E Browser Tests

Browser-based API testing using Playwright for the Deal Discovery System.

## Overview

These tests validate the API endpoints using Playwright's request context, providing:
- Real HTTP request/response testing
- Cross-browser compatibility verification
- CI/CD integration with reporting

## Running Tests

### Prerequisites

```bash
# Playwright is already installed via npm install
# Browsers are installed automatically
```

### Run all tests

```bash
npx playwright test
```

### Run in UI mode (for development)

```bash
npx playwright test --ui
```

### Run specific test file

```bash
npx playwright test tests/e2e/api.spec.ts
```

### Run with headed browser (visible)

```bash
npx playwright test --headed
```

### Debug mode

```bash
npx playwright test --debug
```

## Configuration

Tests are configured in `playwright.config.ts`:
- Base URL: `http://localhost:8787` (local dev) or deployed URL
- Browser: Chromium (can add Firefox/WebKit)
- Auto-starts dev server before tests

## Test Coverage

### Health Endpoints
- `GET /health` - Main health check with KV status
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

### Deals API
- `GET /deals` - List deals with filtering
- `GET /deals.json` - Raw JSON output
- Category filtering
- Pagination with limit

### Ranked Deals
- `GET /deals/ranked` - Deals sorted by various criteria
- `GET /deals/ranked?sort_by=confidence` - Sort by confidence
- `GET /deals/ranked?sort_by=value` - Sort by value
- `GET /deals/highlights` - Featured deals

### Analytics
- `GET /api/analytics` - Full analytics dashboard
- `GET /api/analytics?format=summary` - Summary only

### Status & Logs
- `GET /api/status` - Pipeline status
- `GET /api/log` - Recent logs
- `GET /metrics` - Prometheus metrics

## Environment Variables

- `TEST_BASE_URL` - Override the base URL for testing
- `SKIP_DEV_SERVER` - Don't auto-start dev server
- `CI` - Run in CI mode (different retry/wait settings)

## Reports

HTML reports are generated in `playwright-report/`:

```bash
npx playwright show-report
```

## Adding New Tests

1. Add test cases to `tests/e2e/api.spec.ts`
2. Use descriptive test names with the format: `METHOD /endpoint - description`
3. Include assertions for:
   - Status codes
   - Response body structure
   - Content-Type headers
   - Key properties in response

Example:

```typescript
test('GET /deals returns filtered results by category', async ({ request }) => {
  const response = await request.get('/deals?category=finance');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.deals.every(d => d.category === 'finance')).toBe(true);
});
```
