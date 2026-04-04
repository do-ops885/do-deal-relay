## 2026-04-03 - Parallelize KV log retrieval
**Learning:** Cloudflare Workers endpoints like /metrics (fetching up to 1000 logs) were severely bottlenecked by sequential KV .get() calls in loops. This pattern results in O(N) latency where N is the number of logs, potentially causing timeouts or hitting subrequest limits.
**Action:** Use a batching pattern with Promise.all (e.g., 25 concurrent requests) to fetch multiple KV entries. This reduces latency to O(N/batchSize) while staying safely within platform subrequest limits and avoiding throttling.

## 2026-04-04 - Global KV Batching Utility
**Learning:** Sequential KV operations in loops were a recurring anti-pattern across metrics, logs, and storage modules. Local batching implementations were inconsistent and hard to maintain.
**Action:** Extracted a generic `fetchInBatches` utility to `worker/lib/utils.ts`. This unified approach ensures all batching follows the 25-subrequest safety limit and makes it trivial to optimize any new O(N) KV operation.
