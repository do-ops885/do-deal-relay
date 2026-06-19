# GOAP Plan: MCP Pagination, Progress Notifications & SSE Streaming

**Issues**: #290, #291, #292
**Date**: 2026-06-03
**Status**: Completed

## Context

The MCP server already had pagination infrastructure (`lib/mcp/pagination.ts`) and progress tracking (`lib/mcp/progress.ts`), but only `tools/list` and `resources/list` were wired up. All other list-returning tools returned unbounded result sets. The `withProgress` utility existed but did not persist intermediate progress to KV, so clients couldn't poll mid-operation. SSE streaming existed but lacked cancellation support and had no timeout guard.

## Architecture Decisions

### ADR-001: Cursor-Based Pagination for All List Tools

**Decision**: Use the existing `paginateList` function from `lib/mcp/pagination.ts` for all list-returning MCP tools. Cursors are opaque base64 strings encoding `{ v: lastItemId, l: pageSize }`.

**Rationale**: Cursor-based pagination (vs offset-based) is stable under concurrent insertions/deletions. The MCP spec mandates opaque cursors, and the existing `paginateList` already implements this correctly.

**Consequence**: All list tools now accept `cursor` and `limit` parameters and return `{ items, nextCursor, total, hasMore }` in their structured content.

### ADR-002: KV-Backed Progress Notifications

**Decision**: Enhance `withProgress` to write intermediate progress state to KV when `env` and `operationId` are provided. Clients poll via `check_progress` or stream via SSE.

**Rationale**: In stateless HTTP mode, the server cannot push notifications between request/response cycles. KV provides a shared state store that both the tool execution and the polling/streaming endpoint can access.

**Consequence**: Long-running tools get real-time progress visibility. The KV writes are best-effort (fire-and-forget) to avoid blocking tool execution.

### ADR-003: SSE Stream Improvements

**Decision**: Add cancellation detection, timeout guards (5 min max), and a `cancelled` event type to SSE streams.

**Rationale**: Streams can hang indefinitely if the tool doesn't complete. Cancellation requires checking KV state mid-execution. The 5-minute timeout prevents resource exhaustion from abandoned streams.

**Consequence**: Clients receive a `cancelled` event when they call `cancel_operation`, and streams auto-terminate after 5 minutes.

## Changes Made

### 1. `worker/lib/mcp/pagination.ts`
- Added `MCPListResponse<T>` interface and `toMCPListResponse()` helper for standardized pagination metadata
- Added JSDoc documentation to all exports
- No behavioral changes to existing `paginateList`

### 2. `worker/lib/mcp/utils.ts`
- Enhanced `withProgress` to accept `env` and `operationId` parameters
- Added KV persistence of intermediate progress state (best-effort, fire-and-forget)
- Updated JSDoc with full parameter documentation

### 3. `worker/lib/mcp/handlers/search.ts`
- Added `cursor` parameter to `SearchDealsInputSchema`
- Ranked results are now paginated via `paginateList` instead of slicing by `limit`
- Response includes `nextCursor` and `hasMore` fields

### 4. `worker/lib/mcp/handlers/categories.ts`
- Added `cursor` and `limit` parameters to `ListCategoriesInputSchema`
- Categories are paginated via `paginateList`
- Response includes pagination metadata

### 5. `worker/lib/mcp/handlers/logging.ts`
- Added `cursor` and `limit` parameters to `GetLogsInputSchema`
- Logs are paginated via `paginateList`
- Response includes `nextCursor` and `hasMore`

### 6. `worker/lib/mcp/handlers/discovery.ts`
- Added `cursor` parameter to `GetSimilarDealsInputSchema`
- `handleGetSimilarDeals`: similar deals and domain deals are paginated
- `handleGetDealHighlights`: added `cursor` parameter; top/expiring/recent deals are paginated independently
- Both return `nextCursor` and `hasMore`

### 7. `worker/lib/mcp/handlers/progress.ts`
- `handleCheckProgress` (no operationId): added pagination via `paginateList`
- `handleListOperations`: added `cursor` and `limit` parameters with pagination
- Both return `nextCursor` and `hasMore`
- Added `structuredContent` to all responses

### 8. `worker/lib/mcp/handlers/nlq.ts`
- Added `cursor` parameter to `NaturalLanguageQueryInputSchema`
- Query results are paginated via `paginateList`
- Response includes `nextCursor` and `hasMore`

### 9. `worker/lib/mcp/tools/deals.ts`
- Added `cursor` to `search_deals` input schema
- Updated output schema to include `nextCursor` and `hasMore`

### 10. `worker/lib/mcp/tools/user.ts`
- Added `cursor` to `natural_language_query` input schema
- Updated output schema to include `nextCursor` and `hasMore`

### 11. `worker/lib/mcp/tools/research.ts`
- Added `cursor` and `limit` to `list_categories` input schema
- Updated output schema to include pagination metadata
- Updated descriptions for all tools

### 12. `worker/lib/mcp/tools/system.ts`
- Added `cursor` and `limit` to `get_similar_deals`, `get_deal_highlights`, `get_logs`, `check_progress`, `list_operations` input schemas
- Updated all output schemas to include `nextCursor` and `hasMore`
- Updated tool descriptions

### 13. `worker/routes/mcp-stream.ts`
- Added `cancelled` event type support
- Added cancellation detection mid-execution (checks KV state)
- Added 5-minute timeout guard for SSE streams
- Improved writer.close() error handling
- Added `tool` field to error events

### 14. `tests/unit/mcp-utils.test.ts`
- Updated all `withProgress` test calls to match new 5-argument signature

## Files Modified

| File | Issue | Change Type |
|------|-------|-------------|
| `worker/lib/mcp/pagination.ts` | #290 | Enhancement |
| `worker/lib/mcp/utils.ts` | #291 | Enhancement |
| `worker/lib/mcp/handlers/search.ts` | #290 | Pagination |
| `worker/lib/mcp/handlers/categories.ts` | #290 | Pagination |
| `worker/lib/mcp/handlers/logging.ts` | #290 | Pagination |
| `worker/lib/mcp/handlers/discovery.ts` | #290 | Pagination |
| `worker/lib/mcp/handlers/progress.ts` | #290 | Pagination |
| `worker/lib/mcp/handlers/nlq.ts` | #290 | Pagination |
| `worker/lib/mcp/tools/deals.ts` | #290 | Schema |
| `worker/lib/mcp/tools/user.ts` | #290 | Schema |
| `worker/lib/mcp/tools/research.ts` | #290 | Schema |
| `worker/lib/mcp/tools/system.ts` | #290 | Schema |
| `worker/routes/mcp-stream.ts` | #291, #292 | Streaming |
| `tests/unit/mcp-utils.test.ts` | #291 | Test fix |

## Pagination Contract

All list tools now follow this pattern:

```jsonc
// Request
{
  "method": "tools/call",
  "params": {
    "name": "search_deals",
    "arguments": {
      "query": "finance",
      "limit": 10,
      "cursor": "eyJ2IjoiY29kZS0xMjM0NSIsImwiOjEwfQ=="  // optional
    }
  }
}

// Response (structuredContent)
{
  "deals": [...],
  "total": 150,
  "nextCursor": "eyJ2IjoiY29kZS01NDMyMSIsImwiOjEwfQ==",  // null if last page
  "hasMore": true
}
```

## Progress Notification Flow

1. Client calls `tools/call` with `_meta.progressToken: "my-token-123"`
2. Server stores progress in KV at `mcp:progress:{operationId}`
3. Client polls `check_progress` with `operationId` to see status
4. Or client connects to `GET /mcp/stream?operationId=xxx` for SSE updates
5. Client calls `cancel_operation` to abort; stream emits `cancelled` event

## Verification

- TypeScript compilation: 0 new errors in MCP files
- Unit tests: 22/22 pass in `tests/unit/mcp-utils.test.ts`
- Pre-existing errors in `research-agent/` are unrelated to this change
