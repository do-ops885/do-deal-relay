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
