# ADR: Comparison Caching for Pipeline Optimization

**status**: completed
**implemented**: PR #224 — perf(dedupe): introduce comparison cache infrastructure

## Context
The deal discovery pipeline performs several phases (normalization, deduplication, validation, scoring) that involve repetitive string transformations and complex comparisons.
Specifically, `calculateStringSimilarity` and `calculateUrlSimilarity` are called frequently in hot loops, especially during deduplication and similarity-based ranking. These functions perform normalization, bigram generation, and URL parsing on every call, even for the same deal.

## Decision
We will introduce a `ComparisonCache` within the `PipelineContext` to store pre-calculated fields required for these expensive operations.

1. **Normalization**: During the `normalize` phase, each deal will have a `ComparisonFields` object generated and stored in the cache.
2. **ComparisonFields**: This object will contain:
    * Normalized title (for exact matches and similarity).
    * Bigrams of the normalized title (for Jaccard similarity).
    * Parsed `URL` objects for both the deal URL and source URL.
    * Normalized URL strings.
3. **Refactoring Utilities**: Core utility functions in `worker/lib/crypto.ts` will be refactored to accept these pre-calculated fields, avoiding redundant work.
4. **Phased Adoption**: All pipeline stages (`dedupe`, `validate`, `score`) will be updated to consume the cache.

## Consequences
* **Performance**: Reduced CPU time in deduplication and scoring phases by avoiding repeated string normalization and URL parsing.
* **Memory**: Slight increase in memory usage during the pipeline run to store the cache. Since the pipeline processes a limited number of deals per run (global budget ~1000), this is well within Cloudflare Worker memory limits.
* **Maintainability**: Improved modularity by separating normalization logic from comparison logic.
* **Complexity**: `PipelineContext` becomes slightly more complex with the addition of the cache.
