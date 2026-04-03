## 2026-04-03 - Parallelize KV log retrieval
**Learning:** Cloudflare Workers endpoints like /metrics (fetching up to 1000 logs) were severely bottlenecked by sequential KV .get() calls in loops. This pattern results in O(N) latency where N is the number of logs, potentially causing timeouts or hitting subrequest limits.
**Action:** Use a batching pattern with Promise.all (e.g., 25 concurrent requests) to fetch multiple KV entries. This reduces latency to O(N/batchSize) while staying safely within platform subrequest limits and avoiding throttling.
