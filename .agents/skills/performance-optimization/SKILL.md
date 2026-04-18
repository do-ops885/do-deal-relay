---
name: performance-optimization
description: Guidance and patterns for identifying and fixing performance bottlenecks in the deal discovery system. Triggers include "optimize code", "fix performance", "reduce latency", "improve algorithmic complexity", or "O(N^2) detected".
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
allowed-tools: Bash(*)
---

# Performance Optimization Skill

This skill provides guidance and patterns for identifying and fixing performance bottlenecks in the deal discovery system.

## Performance Philosophy
- **Measurability**: Every optimization must be documented with a mathematical impact (e.g., O(N) vs O(N^2)).
- **Safety**: Hot path optimizations must be verified with dedicated unit tests.
- **Atomic Changes**: Keep optimizations focused on specific bottlenecks.

## Common Optimization Patterns

### 1. Algorithmic Efficiency
- **Problem**: O(N^2) loops using `filter` or `find` inside a loop over the same collection.
- **Solution**: Use `Map` or `Set` for O(1) lookups.
- **Example**:
  ```typescript
  // Before: O(N^2)
  for (const item of items) {
    const dupe = otherItems.find(i => i.id === item.id);
  }

  // After: O(N)
  const map = new Map(otherItems.map(i => [i.id, i]));
  for (const item of items) {
    const dupe = map.get(item.id);
  }
  ```

### 2. Hot Path Allocations
- **Problem**: Creating intermediate objects or arrays (e.g., `Object.entries().reduce()`) in functions called frequently.
- **Solution**: Use direct property access and simple loops.

### 3. I/O Reduction
- **Problem**: Redundant Cloudflare KV fetches or subrequests.
- **Solution**: Parallelize with `Promise.all` or remove unused fetches.

## Verification Protocol
1. **Baseline**: Run existing tests.
2. **Implementation**: Apply focused changes.
3. **Unit Tests**: Create specific tests for the optimized logic.
4. **Quality Gate**: Run `./scripts/quality_gate.sh`.
