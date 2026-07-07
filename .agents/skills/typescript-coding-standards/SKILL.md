---
name: typescript-coding-standards
description: Enforce TypeScript coding standards including type safety, file size limits, and naming conventions.
---

# TypeScript Coding Standards Skill

## Purpose
Enforce TypeScript coding standards for the do-deal-relay codebase. Ensure type safety, code quality, and consistency across all source files.

## Standards

### Type Safety
- **No `as any` casts**: Always use proper types or `unknown` with type guards
- **No implicit any**: All function parameters and return types must be explicit
- **Use strict null checks**: Handle null/undefined explicitly
- **Prefer type guards over type assertions**: `typeof x === "string"` over `x as string`

### Code Quality
- **MAX_LINES_PER_SOURCE_FILE = 500**: Split files exceeding this limit
- **Single responsibility**: Each file should have one clear purpose
- **Naming conventions**:
  - Functions: camelCase, descriptive verbs (getX, handleY, createZ)
  - Types/Interfaces: PascalCase
  - Constants: UPPER_SNAKE_CASE for module-level, camelCase for local
  - Files: kebab-case matching export name

### Imports
- Group imports: vendor → shared → local
- Use relative imports for same-directory, `../../` for cross-module
- No circular imports

### Error Handling
- Use typed errors with meaningful messages
- Handle promise rejections with try/catch or `.catch()`
- Log errors with context via `createStructuredLogger`

### Testing Requirements
- Test files in `tests/unit/` mirroring `worker/` structure
- Test name: `{functionName} should {expected behavior}`
- Coverage target: >80% for new code

### Commit Messages
- Format: `type(scope): subject` (max 72 chars)
- Types: feat, fix, docs, chore, refactor, test, ci, security
- Body wraps at 100 chars, footer at 1000 chars

## Quality Gates
1. `npx tsc --noEmit` — typecheck
2. `npx prettier --check .` — formatting
3. `npm run lint:md` — markdown lint
4. `npm run test:unit` — unit tests

## Rationalizations
- "`as any` is fine for this stub" — `any` defeats type safety; use a typed alternative or `unknown` with a type guard. Per AGENTS.md: "Only when the value can truly be any type."
- "Implicit any is short-term cost, long-term gain" — implicit any silently bypasses the contract; declare the type or use `unknown`.
- "This single file is too large but it works" — `MAX_LINES_PER_SOURCE_FILE=500` is a hard constraint; split the file rather than waive the limit.
- "Function names are too long, abbreviate" — descriptive verbs (`getX`, `handleY`, `createZ`) make call sites self-documenting; avoid `do`, `process`, `handleData`.
- "Skip the test for a config change" — all changes must be covered by the gate suite, including TypeScript tests for new behaviour.

## Red Flags
- A PR introduces one or more new `as any` casts not previously present in the file.
- A test is removed or skipped (`it.skip`, `xit`, `describe.skip`) without a linked ADR explaining why.
- A file's `wc -l` exceeds 500 and is not being split in the same PR.
- An export is renamed without updating all import references (caught by `tsc --noEmit` only if imports are typed same; otherwise by code review).
- A new external dependency is added without checking that `package.json` is updated and `package-lock.json` is committed.
