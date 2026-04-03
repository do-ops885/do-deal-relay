## 2026-04-03 - [Parallelized KV Fetches for Logs]
**Learning:** Sequential KV `get` operations in loops (O(n) round-trips) significantly impact the latency of read-heavy endpoints like `/api/log` and `/metrics` in Cloudflare Workers.
**Action:** Always use `Promise.all()` to parallelize multiple independent KV fetches. For large datasets, implement batching (e.g., in groups of 25) to avoid hitting subrequest limits or memory constraints.
