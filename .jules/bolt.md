## 2026-04-03 - Parallelize KV log retrieval
**Learning:** Cloudflare Workers endpoints like /metrics (fetching up to 1000 logs) were severely bottlenecked by sequential KV .get() calls in loops. This pattern results in O(N) latency where N is the number of logs, potentially causing timeouts or hitting subrequest limits.
**Action:** Use a batching pattern with Promise.all (e.g., 25 concurrent requests) to fetch multiple KV entries. This reduces latency to O(N/batchSize) while staying safely within platform subrequest limits and avoiding throttling.

## 2026-04-06 - Parallelize deal validation pipeline
**Learning:** The deal validation pipeline was processing deals sequentially, with each deal performing multiple async operations (KV, D1, cache). For large batches, this created a significant bottleneck. Batching these operations with concurrency (batch size 10) respects the platform's 50-subrequest limit while maximizing throughput.
**Action:** Implement batched parallel processing for validation logic using `fetchInBatches`. Ensure that shared context state (like `ctx.validated`) is managed carefully and that tests provide adequate KV mocks for JSON-parsing scenarios.

## 2026-04-07 - Parallelize independent async calls in Worker routes
**Learning:** Worker route handlers often perform multiple independent asynchronous operations (e.g., fetching snapshots, status, and logs) sequentially. This results in additive latency that can be easily avoided when these operations do not depend on each other's results.
**Action:** Identify independent asynchronous operations and group them using `Promise.all` to perform them concurrently. This reduces total response latency to the duration of the slowest single operation rather than the sum of all operations.

## 2026-04-08 - Parallelize referral storage operations
**Learning:** Referral search and maintenance operations (fetching objects from index keys, deactivating expired entries) were performing sequential KV operations in loops. Using `fetchInBatches` and `executeInBatches` reduces latency from O(N) to O(N/batchSize) while ensuring stability via defensive null checks and `allSettled` handling.
**Action:** Apply `fetchInBatches` for retrieval and `executeInBatches` for bulk updates. Always include defensive null checks (e.g., `filter(r => r && r.status === status)`) when processing batched results to handle potential KV inconsistencies or race conditions.

## 2026-04-09 - Optimize Jaccard similarity computation
**Learning:** The `calculateStringSimilarity` function, used in O(N^2) deduplication and search loops, was creating five intermediate collections (3 arrays, 2 sets) per call. This caused high garbage collection pressure and redundant iterations.
**Action:** Directly calculate intersection size by iterating over the smaller set and use the Inclusion-Exclusion Principle (|A ∪ B| = |A| + |B| - |A ∩ B|) to derive union size. This reduces memory allocation from O(N) to O(1) per similarity check and eliminates redundant passes.
