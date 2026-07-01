# `as any` Audit Report

> **Date**: 2026-05-16
> **Scope**: Non-test source files in `worker/` and `bot/` directories
> **Status**: 7 occurrences found across 4 files

---

## Summary

| File | Line | Usage | Replaceable? | Suggested Fix |
|------|------|-------|-------------|---------------|
| `worker/lib/metrics/stats.ts` | 404 | `const res = {} as any` for phase timing stats initialization | **🔶 Might break** | Define a typed return interface instead of building with `as any` |
| `worker/lib/metrics/stats.ts` | 458 | `const res = {} as any` for phase timing stats output | **🔶 Might break** | Same as above — use typed build pattern |
| `worker/lib/mcp/handlers/experience.ts` | 44 | `(referral.metadata.experiences as any[])` | **✅ Replaceable** | Cast to `Array<{...}>` with known shape instead of `any[]` |
| `worker/lib/mcp/handlers/report.ts` | 46 | `reason as any` passed to `deactivateReferral()` | **✅ Replaceable** | Fix `deactivateReferral` type signature or use properly typed enum |
| `worker/lib/mcp/handlers/search.ts` | 89 | `deals as any` passed to `rankDeals()` | **⚠️ Risky** | Fix type mismatch between `referralToDeal` output and `rankDeals` input |
| `worker/lib/mcp/handlers/search.ts` | 90 | `(sort_by \|\| "confidence") as any` for rankDeals sortBy | **✅ Replaceable** | Use proper union type matching `RankOptions['sortBy']` |
| `worker/lib/mcp/handlers/search.ts` | 91 | `(order \|\| "desc") as any` for rankDeals order | **✅ Replaceable** | Use proper union type matching `RankOptions['order']` |

---

## Detailed Analysis

### 1. `worker/lib/metrics/stats.ts` (lines 404, 458)

```typescript
const res = {} as any;
```

**Context**: Building phase timing stats objects dynamically by iterating over phases.

**Why it's used**: The function returns `Record<PipelinePhase, Record<"success" | "failure", PhaseTimingStats>>` but builds it incrementally in a `for of` loop. TypeScript can't track the dynamic key assignment.

**Fix**: Define a const object with explicit typing:
```typescript
const res = {} as Record<PipelinePhase, Record<"success" | "failure", PhaseTimingStats>>;
```
Or refactor to use `reduce` with typed accumulator.

**Risk**: Low — both functions are internal helpers with well-defined return types.

---

### 2. `worker/lib/mcp/handlers/experience.ts` (line 44)

```typescript
const experiences = (referral.metadata.experiences as any[]) || [];
```

**Context**: Retrieving experiences array from referral metadata after a user reports success/failure with a deal.

**Why it's used**: `referral.metadata` is a loosely typed `Record<string, unknown>`, so `experiences` is `unknown` by default.

**Fix**: Define a typed experience interface and cast properly:
```typescript
interface Experience {
  success: boolean;
  comment?: string;
  timestamp: string;
  source: string;
}
const experiences = (referral.metadata.experiences as Experience[]) || [];
```

**Risk**: None — the downstream code pushes objects matching this shape.

---

### 3. `worker/lib/mcp/handlers/report.ts` (line 46)

```typescript
const result = await deactivateReferral(env, code, reason as any, undefined, comment);
```

**Context**: Passing a `reason` enum to `deactivateReferral`. The function accepts `string` but the caller passes a zod-enum constrained value.

**Why it's used**: `deactivateReferral` may have a different type signature than the enum produces.

**Fix**: Update the `deactivateReferral` function signature to accept the same enum type, or explicitly cast to `string`.

**Risk**: Low — the value is already constrained by zod schema.

---

### 4. `worker/lib/mcp/handlers/search.ts` (lines 89-91)

```typescript
const rankingResult = rankDeals(deals as any, {
  sortBy: (sort_by || "confidence") as any,
  order: (order || "desc") as any,
  ...
});
```

**Context**: Passing deals and sort options to `rankDeals()`. The `referralToDeal()` output type doesn't perfectly match `rankDeals()` input type.

**Why it's used**: Multiple type mismatches — the deals array shape, sort options enum, and order direction.

**Fix**:
- For `deals as any`: Cast to the proper Deal type that `rankDeals` expects
- For sort options: Define a shared enum type between the MCP handler and rankDeals
- For order: Use the same `'asc' | 'desc'` union type

**Risk**: Medium — needs coordinate changes in both the MCP handler and rankDeals type definitions.

---

## Replaceability Ranking

| Priority | File | Lines | Ease | Impact |
|----------|------|-------|------|--------|
| 🔴 P0 | `search.ts` | 89-91 | Medium | Removes 3 casts, improves type safety in deal search |
| 🟡 P1 | `experience.ts` | 44 | Easy | Clear improvement with proper interface |
| 🟡 P1 | `report.ts` | 46 | Easy | Clean enum type usage |
| 🟢 P2 | `stats.ts` | 404, 458 | Medium | Only internal helper functions |

---

## Recommendation

**Fix P0-P1 files now** (search.ts, experience.ts, report.ts — 5 casts).
**Defer P2** (stats.ts — 2 casts) as they're internal helper functions with well-defined return types and the fix is more involved.
