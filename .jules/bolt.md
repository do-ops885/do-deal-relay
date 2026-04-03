# Bolt's Journal

## 2026-04-03 - [Parallelized KV Fetching for Logs]
**Learning:** Cloudflare KV operations in loops (sequential `await`) create significant latency bottlenecks. Using `Promise.all` with batching (to respect platform limits) reduces retrieval time from $O(N)$ to $O(N/batchSize)$.
**Action:** Always check for sequential `await` in loops for KV, D1, or R2 operations and refactor to use parallel batching.
