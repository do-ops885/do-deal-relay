# Track C: Test Coverage

## Uncovered Logic Identified
`handleCreateApiKey` in `worker/routes/admin/keys.ts`:
- Creation of API key with default rate limits when `rateLimit` option is not provided in body.
- Creation of API key with custom rate limits when `rateLimit` option is provided in body.

## Tests to Add
Add unit tests in `tests/unit/admin-keys.test.ts`:
1. `should set default rate limits (60/min, 1000/hr) when rateLimit is not specified`: verify `rateLimit` in creation configuration fallback.
2. `should accept custom rateLimits when specified in request body`: verify custom rate limit options are preserved.
