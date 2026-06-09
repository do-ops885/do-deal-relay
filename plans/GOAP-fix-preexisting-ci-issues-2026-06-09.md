# GOAP Plan: Fix Pre-existing CI Issues (2026-06-09)

**Status**: active
**Created**: 2026-06-09
**Issue**: CodeQL (5 high) and Codacy (12 issues) failures on PR #445
**Orchestrator**: GOAP skill with parallel agent swarm

---

## Issue Analysis

### CodeQL (5 High Severity)
1. `page-fetcher.ts` - Incomplete multi-character sanitization (`<style>`, `<script>`)
2. `html-extractor.ts` - Incomplete multi-character sanitization (`<style>`, `<script>`)
3. `html-extractor.ts` - Bad HTML filtering regexp (doesn't match `</script>`)

### Codacy (12 Issues)
**Failures (3):**
- `api-fetchers.ts:267` - User-controlled URLs passed to HTTP client
- `reddit-fetcher.ts:157` - User-controlled URLs passed to HTTP client
- `reward-scraper-core.ts:24` - User-controlled URLs passed to HTTP client

**Warnings (9):**
- `runner.ts:11` - Unused private class member
- `page-fetcher.ts:96,97,123,124` - Implicit any types + assignment in expression
- `referral-extractor.ts:110,111` - Implicit any types + assignment in expression
- `code-validator.ts:5` - Unused imports
- `batch-processor.ts:24` - Non-serializable expression

---

## Execution Plan

**Strategy**: Parallel swarm (3 agents)

### Agent 1: CodeQL Security Fixes
- Fix HTML sanitization in `page-fetcher.ts` and `html-extractor.ts`
- Fix regex pattern for `</script>` matching

### Agent 2: Codacy Security Fixes
- Add URL validation/sanitization before HTTP client calls
- Fix in `api-fetchers.ts`, `reddit-fetcher.ts`, `reward-scraper-core.ts`

### Agent 3: Codacy Code Quality Fixes
- Remove unused imports/variables
- Fix implicit any types
- Fix assignment-in-expression patterns
- Fix non-serializable expression

### Quality Gate
- Run `npm run lint` after each agent
- Run `npm run build` to verify
