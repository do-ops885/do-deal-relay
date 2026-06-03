# Follow-Up Plan: Issues Not Addressed in PR #396

> Created: 2026-06-03
> Reason: These issues require significant additional work or are operational incidents

---

## Issues Not Fixable in This Run

### Operational Incidents (Not Code Issues)
These are automated rollback/deployment failure issues. They require investigation of the deployment pipeline, not code changes.

| Issue | Type | Action Required |
|-------|------|-----------------|
| #387 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #385 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #383 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #382 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #381 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #379 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #378 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #377 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #376 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #375 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #373 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #372 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #370 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #369 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #367 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #357 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #353 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #351 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #347 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #346 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #345 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #339 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #338 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #337 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #335 | ROLLBACK REQUIRED | Investigate deployment failure root cause |
| #334 | ROLLBACK FAILED | Investigate deployment failure root cause |
| #333 | ROLLBACK FAILED | Investigate deployment failure root cause |
| #332 | AUTOMATED ROLLBACK | Investigate deployment failure root cause |
| #329 | AUTOMATED ROLLBACK | Investigate deployment failure root cause |
| #328 | AUTOMATED ROLLBACK | Investigate deployment failure root cause |

**Recommendation**: Create a single issue to investigate and fix the deployment pipeline. The repeated rollback failures suggest a systemic issue with the CI/CD configuration.

---

### Feature Epics (Require Significant Work)

#### Semantic Search Epic (#297)
| Issue | Feature | Complexity | Estimated Effort |
|-------|---------|------------|------------------|
| #294 | Vector embeddings integration | High | 2-3 days |
| #295 | Semantic search API endpoint | Medium | 1 day |
| #296 | Embedding generation pipeline | High | 2-3 days |
| #297 | Semantic Search Epic (full) | Very High | 5-7 days |

**Dependencies**: Requires Cloudflare Vectorize or similar vector database integration.

**Recommendation**: Defer to v0.2.0 release. This is a significant feature that requires:
1. Vector database setup (Cloudflare Vectorize)
2. Embedding generation pipeline
3. Search API with similarity scoring
4. Integration with existing deal discovery pipeline

---

### Remaining P3 Features

#### Web UI Dashboard Sub-features
While the dashboard API is implemented, the full Web UI (React/Vue frontend) is not included in this PR.

| Issue | Feature | Status |
|-------|---------|--------|
| #298 | Dashboard layout and component architecture | API implemented, UI pending |
| #299 | Deal management views | API implemented, UI pending |
| #300 | Analytics and monitoring dashboard views | API implemented, UI pending |
| #301 | Referral tracking interface | API implemented, UI pending |
| #302 | Web UI Dashboard Epic | API implemented, UI pending |

**Recommendation**: Create a separate frontend repository or use a framework like Next.js to build the dashboard UI.

---

### Dependabot PRs (Require CI Fix)

| PR | Update | Status |
|----|--------|--------|
| #395 | cloudflare/wrangler-action 3.15→4.0 | Tests failing |
| #394 | actions/checkout 4.3→6.0 | Tests failing |
| #393 | pre-commit-hooks v5→6 | Tests failing |
| #392 | protobufjs 8.4→8.5 | Tests failing |
| #391 | @types/node 25.8→25.9 | Tests failing |
| #390 | testing group (3 updates) | Tests failing |
| #389 | cloudflare group (4 updates) | Tests failing |

**Root Cause**: The dependabot PRs are failing because the test suite has pre-existing issues that are now fixed in PR #396.

**Recommendation**: After PR #396 is merged, rebase and re-trigger the dependabot PRs. The test failures should be resolved.

---

## Priority Matrix

| Priority | Issue | Action | Owner |
|----------|-------|--------|-------|
| P0 | Deployment rollback issues | Investigate CI/CD pipeline | DevOps |
| P1 | Dependabot PRs | Rebase after PR #396 merge | Automated |
| P2 | Semantic Search Epic | Plan for v0.2.0 | Product |
| P3 | Web UI Dashboard | Separate frontend project | Frontend team |

---

## Next Steps

1. **Merge PR #396** - Contains all implemented features and bug fixes
2. **Investigate deployment pipeline** - Create issue for rollback failures
3. **Rebase dependabot PRs** - After PR #396 merge
4. **Plan Semantic Search** - Create detailed design document for v0.2.0
5. **Create frontend project** - Separate repository for Web UI
