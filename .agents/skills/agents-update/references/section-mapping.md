# Section Mapping Reference

Complete mapping of AGENTS.md sections to agents-docs/ destinations.

## High Priority Sections (Migrate First)

| Section                        | Lines | Destination File                                   | Rationale                                    |
| ------------------------------ | ----- | -------------------------------------------------- | -------------------------------------------- |
| Production Readiness Checklist | 10    | `agents-docs/coordination/production-readiness.md` | Checklist doesn't change frequently          |
| Tracking Warnings and Issues   | 16    | `agents-docs/coordination/production-readiness.md` | Process documentation                        |
| URL Handling Rules             | 46    | `agents-docs/url-handling.md`                      | Critical business logic needs dedicated file |
| Handoff Coordination Protocol  | 42    | `agents-docs/coordination/handoff-protocol.md`     | Detailed process documentation               |
| Project Structure              | 34    | `agents-docs/PROJECT_STRUCTURE.md`                 | Reference material                           |

## Medium Priority Sections

| Section                    | Lines | Destination File                               | Rationale             |
| -------------------------- | ----- | ---------------------------------------------- | --------------------- |
| Referral Management System | 32    | `agents-docs/features/referral-system.md`      | Feature documentation |
| User Input Methods         | 13    | `agents-docs/features/input-methods.md`        | Feature analysis      |
| Web Research Integration   | 26    | `agents-docs/features/web-research.md`         | Feature documentation |
| State Management           | 9     | `agents-docs/coordination/state-management.md` | Reference material    |

## Consolidation Strategy

### Single File Consolidations

1. **Quality & Standards** → `agents-docs/quality-standards.md`
   - Code Quality Standards (6 lines)
   - Quality Gates (10 lines)
   - Total: ~60 lines with examples

2. **Coordination** → `agents-docs/coordination/handoff-protocol.md`
   - Handoff Coordination Protocol (42 lines)
   - Blocker escalation rules
   - Emergency procedures

3. **Swarm Patterns** → `agents-docs/coordination/swarm-patterns.md`
   - Swarm Coordination Patterns (38 lines)
   - All 5 pattern descriptions
   - Continuous verification loop

### Before/After Line Counts

| File                                             | Before | After    |
| ------------------------------------------------ | ------ | -------- |
| AGENTS.md                                        | 342    | ~120-140 |
| agents-docs/coordination/production-readiness.md | 0      | ~80      |
| agents-docs/quality-standards.md                 | 0      | ~60      |
| agents-docs/url-handling.md                      | 0      | ~50      |
| agents-docs/features/referral-system.md          | 0      | ~70      |
| agents-docs/features/input-methods.md            | 0      | ~40      |
| agents-docs/coordination/handoff-protocol.md     | 0      | ~100     |
| agents-docs/coordination/swarm-patterns.md       | 0      | ~80      |
| agents-docs/features/web-research.md             | 0      | ~50      |
| agents-docs/PROJECT_STRUCTURE.md                 | 0      | ~70      |
| agents-docs/coordination/state-management.md     | 0      | ~30      |

**Total Content Preserved**: 342 lines → 620 lines (with enhanced examples)

## Migration Checklist

- [ ] Read source section from AGENTS.md
- [ ] Create destination file with full content
- [ ] Add standalone usability (header, context)
- [ ] Include all code examples
- [ ] Replace AGENTS.md section with brief summary + link
- [ ] Verify no content lost
- [ ] Update cross-references if needed
