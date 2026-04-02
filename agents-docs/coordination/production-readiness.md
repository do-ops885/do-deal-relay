## Production Readiness Checklist

This checklist tracks the readiness of the system for production deployment. All items must be completed before production release.

- [x] All input methods implemented (CLI, API, Extension, Bot, Email, Webhook)
- [x] All source files < 500 lines (completed)
- [x] URL preservation verified (complete links always returned)
- [x] GitHub Actions CI passing
- [x] All skills pass evaluator checks (completed)
- [ ] Security audit complete (see `plans/production-readiness.md`)
- [ ] Load testing complete (see `plans/production-readiness.md`)

### Checklist Item Descriptions

| Item                             | Description                                                                              | Priority | Blocker |
| -------------------------------- | ---------------------------------------------------------------------------------------- | -------- | ------- |
| All input methods implemented    | All 6 user input methods (CLI, API, Extension, Bot, Email, Webhook) are fully functional | High     | No      |
| All source files < 500 lines     | Codebase maintains the 500 line limit per source file                                    | High     | No      |
| URL preservation verified        | System always preserves and returns complete URLs                                        | Critical | No      |
| GitHub Actions CI passing        | Continuous integration pipeline is green                                                 | High     | No      |
| All skills pass evaluator checks | All coordination skills pass evaluation criteria                                         | High     | No      |
| Security audit complete          | Full security review and penetration testing                                             | Critical | Yes     |
| Load testing complete            | Performance testing under expected load                                                  | Medium   | Yes     |

## Tracking Warnings and Issues

**All warnings, TODOs, and issues must be tracked in `plans/` directory.**

This section defines the process for tracking and managing warnings, TODOs, and issues discovered during development.

### Tracking Process

1. When validation gates emit warnings (TODO/FIXME, security issues, HTTP URLs, etc.)
2. Create or update appropriate plan file in `plans/`
3. Document: issue, impact, solution, priority, assigned agent, ETA
4. Reference the plan file in AGENTS.md checklist items

### Documentation Requirements

Each issue tracked in the `plans/` directory must include:

- **Issue**: Clear description of the problem
- **Impact**: How it affects the system (security, performance, usability)
- **Solution**: Proposed fix or mitigation
- **Priority**: P0 (blocker), P1 (high), P2 (medium), P3 (low)
- **Assigned Agent**: Which agent is responsible
- **ETA**: Target completion date

### Example Plan Files

- `plans/production-readiness.md` - Security audit, load testing, warnings
- `plans/github-automation-plan.md` - GitHub Actions improvements
- `plans/<feature>-plan.md` - Feature-specific implementation plans

### Current Warnings and Pending Items

See `plans/production-readiness.md` for current tracking of all warnings and pending items.

## Related Documentation

- **AGENTS.md** - Master coordination hub with high-level project status
- **plans/production-readiness.md** - Detailed security audit and load testing plans
- **.agents/skills/validation-gates/** - Validation gate implementation
- **scripts/quality_gate.sh** - Quality gate script

## References

| Resource            | Location                                                                                   | Description                    |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| Master Coordination | [../AGENTS.md](../AGENTS.md)                                                               | Main project coordination file |
| Quality Gates       | [../.agents/skills/validation-gates/SKILL.md](../.agents/skills/validation-gates/SKILL.md) | Validation implementation      |
| Handoff Protocol    | [input-methods-handoff-protocol.md](input-methods-handoff-protocol.md)                     | Agent handoff procedures       |
| Swarm Config        | [referral-swarm-config.json](referral-swarm-config.json)                                   | Swarm coordination config      |
