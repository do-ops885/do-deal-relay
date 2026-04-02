# AGENTS.md - Master Coordination Hub

**Goal**: Autonomous deal discovery with coordinated multi-agent CLI systems  
**Version**: 0.1.2  
**Architecture**: Agent-First CLI with swarm coordination + Referral Management  
**Status**: Active Development

## Quick Start

```bash
npm install                    # Install dependencies
./scripts/quality_gate.sh      # Validate all systems
npm run test:ci                # Run test suite
npm run dev                    # Start development

# CLI Tool for Referral Management
npx ts-node scripts/cli/index.ts --help
npx ts-node scripts/cli/index.ts codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
```

## Status

- [x] All input methods implemented (CLI, API, Extension, Bot, Email, Webhook)
- [x] All source files < 500 lines
- [x] URL preservation verified
- [x] GitHub Actions CI passing
- [ ] Security audit (see [production-readiness](agents-docs/coordination/production-readiness.md))

## Key Documentation

| Topic                 | Location                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Quality Standards** | [agents-docs/quality-standards.md](agents-docs/quality-standards.md)                         |
| **URL Handling**      | [agents-docs/url-handling.md](agents-docs/url-handling.md)                                   |
| **Referral System**   | [agents-docs/features/referral-system.md](agents-docs/features/referral-system.md)           |
| **Input Methods**     | [agents-docs/features/input-methods.md](agents-docs/features/input-methods.md)               |
| **Handoff Protocol**  | [agents-docs/coordination/handoff-protocol.md](agents-docs/coordination/handoff-protocol.md) |
| **Swarm Patterns**    | [agents-docs/coordination/swarm-patterns.md](agents-docs/coordination/swarm-patterns.md)     |
| **Web Research**      | [agents-docs/features/web-research.md](agents-docs/features/web-research.md)                 |
| **Project Structure** | [agents-docs/PROJECT_STRUCTURE.md](agents-docs/PROJECT_STRUCTURE.md)                         |
| **State Management**  | [agents-docs/coordination/state-management.md](agents-docs/coordination/state-management.md) |

## Coordination

**Handoff Protocol**: Use [handoff-protocol.md](agents-docs/coordination/handoff-protocol.md) for agent transitions.  
**Blocker Escalation**: 30min stuck → Escalate to [blockers.md](agents-docs/coordination/blockers.md).  
**Swarm Execution**: Load `skill parallel-execution` for parallel agent coordination.

## Issue Tracking for Future Work

When encountering improvements that are **not immediately required**:

1. **Create GitHub Issues** for:
   - Long-term enhancements
   - Low priority improvements
   - Future implementations
   - Nice-to-have features
   - Refactoring ideas

2. **Label Issues** appropriately:
   - `enhancement` - New features
   - `low-priority` - Not urgent
   - `future` - Deferred work
   - `refactor` - Code improvements
   - `tech-debt` - Technical debt

3. **Example**:

   ```bash
   gh issue create --title "Refactor: Split worker/index.ts into smaller modules" \
                   --body "File currently exceeds 500-line limit. Consider modularizing route handlers." \
                   --label "refactor,low-priority"
   ```

4. **Continue Current Task**: Do not implement future work immediately unless explicitly requested.

## API Endpoints

```
GET    /api/referrals           # List/search referrals
POST   /api/referrals           # Create new referral
GET    /api/referrals/:code     # Get specific referral
POST   /api/referrals/:code/deactivate
POST   /api/research            # Execute web research
```

## System Reference

| Resource            | Location                                                           |
| ------------------- | ------------------------------------------------------------------ |
| System Architecture | [agents-docs/SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) |
| Guard Rails         | [agents-docs/guard-rails.md](agents-docs/guard-rails.md)           |
| Execution Plan      | [agents-docs/EXECUTION_PLAN.md](agents-docs/EXECUTION_PLAN.md)     |
| Skills              | [.agents/skills/](.agents/skills/)                                 |
| API Docs            | [docs/API.md](docs/API.md)                                         |
| Quick Start         | [QUICKSTART.md](QUICKSTART.md)                                     |
| Contributing        | [CONTRIBUTING.md](CONTRIBUTING.md)                                 |
| Security            | [SECURITY.md](SECURITY.md)                                         |

**Active Agents**: See `temp/state.json`
