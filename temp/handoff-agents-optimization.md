# AGENTS.md Optimization Handoff

**Task**: Reduce AGENTS.md from 342 lines to <140 lines by moving content to agents-docs/
**Reference**: https://github.com/d-o-hub/rust-self-learning-memory/blob/main/.agents/skills/agents-update/SKILL.md

## Source File
- `/workspaces/do-deal-relay/AGENTS.md` (342 lines)

## Target Structure

**AGENTS.md Goal**: Quick reference only (<140 lines)
- Header with goal/version
- Quick Start (brief)
- Essential links table
- Status only

**Content Destinations**:
| Section | Destination |
|---------|-------------|
| Production Readiness Checklist | agents-docs/coordination/production-readiness.md |
| Tracking Warnings and Issues | agents-docs/coordination/production-readiness.md |
| Code Quality Standards | agents-docs/quality-standards.md |
| URL Handling Rules (CRITICAL) | agents-docs/url-handling.md |
| Recent Updates / Referral System | agents-docs/features/referral-system.md |
| User Input Methods Analysis | agents-docs/features/input-methods.md |
| Handoff Coordination Protocol | agents-docs/coordination/handoff-protocol.md |
| Swarm Coordination Patterns | agents-docs/coordination/swarm-patterns.md |
| Web Research Integration | agents-docs/features/web-research.md |
| Project Structure | agents-docs/PROJECT_STRUCTURE.md |
| State Management | agents-docs/coordination/state-management.md |
| Quality Gates | agents-docs/quality-gates.md |
| Next Steps & References | Keep condensed in AGENTS.md |

## Key Rules
1. NEVER delete - always move content with full examples
2. AGENTS.md ≤ 140 lines target
3. Create destination files if they don't exist
4. Preserve all cross-references
5. Include code examples in moved content

## Agent Assignments

- **Agent 1**: Coordination & Checklists → agents-docs/coordination/
- **Agent 2**: Quality Standards → agents-docs/quality-standards.md
- **Agent 3**: URL Handling → agents-docs/url-handling.md
- **Agent 4**: Referral System → agents-docs/features/
- **Agent 5**: Handoff & Swarm → agents-docs/coordination/
- **Agent 6**: Web Research → agents-docs/features/
- **Agent 7**: Structure & State → agents-docs/ structure files

## Success Criteria
- [ ] AGENTS.md ≤ 140 lines
- [ ] All sections have destination files
- [ ] Content moved, not deleted
- [ ] Cross-references updated
- [ ] Examples preserved
