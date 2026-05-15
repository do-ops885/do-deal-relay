# ADR-001: Batch Source Registry Updates in Discovery Phase

## Status
Proposed

## Context
The discovery phase (`worker/pipeline/discover.ts`) iterates over configured sources and their associated URL patterns. Currently, the system calls `recordSourceValidation` for every pattern fetched.

Each call to `recordSourceValidation` performs a KV `get` and a KV `put` on the source registry. With N sources and M patterns each, this results in O(N*M) subrequests. Cloudflare Workers have a limit of 50 subrequests per request, which can easily be exceeded as the source registry grows.

Furthermore, the `discover` function updates `discovery_count` and `last_discovery` on the source objects in-memory but never calls `updateSourceRegistry` to persist these changes, leading to lost metadata.

## Decision
We will transition to an in-memory mutation pattern for the source registry during the discovery phase:

1. Remove the use of `recordSourceValidation` in `discoverFromSource`.
2. Directly increment `validation_success_count` and `validation_failure_count` on the `SourceConfig` objects passed to `discoverFromSource`.
3. Call `updateSourceRegistry(env, sources)` exactly once at the end of the `discover` function after all sources have been processed.

## Consequences

### Positive
- **Reduced Subrequests**: KV write operations for registry persistence are reduced from O(N*M) to O(1) per discovery run.
- **Improved Performance**: Significant reduction in latency by avoiding multiple round-trips to KV storage.
- **Data Consistency**: Ensures that all discovery metadata (counts, timestamps, and validation results) are correctly persisted to the source registry.
- **Scalability**: Allows the system to support a much larger number of sources without hitting platform limits.

### Negative / Risks
- **Atomicity**: If the worker execution is terminated before the final `updateSourceRegistry` call, the metadata for that specific run will be lost. However, since this is non-critical diagnostic metadata and not the deal data itself, this risk is acceptable.
- **Memory Usage**: The source registry remains in memory, but given its small size (configuration data), this has negligible impact.
