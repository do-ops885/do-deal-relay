## 2026-04-03 - Parallelize KV log retrieval
**Learning:** Cloudflare Workers endpoints like /metrics (fetching up to 1000 logs) were severely bottlenecked by sequential KV .get() calls in loops. This pattern results in O(N) latency where N is the number of logs, potentially causing timeouts or hitting subrequest limits.
**Action:** Use a batching pattern with Promise.all (e.g., 25 concurrent requests) to fetch multiple KV entries. This reduces latency to O(N/batchSize) while staying safely within platform subrequest limits and avoiding throttling.

## 2026-04-06 - Parallelize deal validation pipeline
**Learning:** The deal validation pipeline was processing deals sequentially, with each deal performing multiple async operations (KV, D1, cache). For large batches, this created a significant bottleneck. Batching these operations with concurrency (batch size 10) respects the platform's 50-subrequest limit while maximizing throughput.
**Action:** Implement batched parallel processing for validation logic using `fetchInBatches`. Ensure that shared context state (like `ctx.validated`) is managed carefully and that tests provide adequate KV mocks for JSON-parsing scenarios.
