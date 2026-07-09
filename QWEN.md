@AGENTS.md

# Qwen CLI Overrides
**Version**: 1.2.0 (Schema: 0.1.8)

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Qwen must adhere to all Core Constraints and Infrastructure Contracts defined there.

## Operational Focus
- **Precision**: Follow typed tool signatures in [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) exactly.
- **Strict Compliance**: Adhere strictly to the shared agent contract in [AGENTS.md](AGENTS.md).
- **Verification**: Run `./scripts/agent-toolkit.sh quality` frequently to ensure zero-regression documentation updates.
- **Unified Toolkit**: Use `./scripts/agent-toolkit.sh` for setup, doctor, quality, and docs tasks.
- **Always-Fix Policy**: Fix pre-existing issues in the current context immediately per [AGENTS.md](AGENTS.md).
- **Performance**: Adhere to the 'Zero Slop' directive in [AGENTS.md](AGENTS.md) for all commits.
- **Triage Protocol**: Follow the ADR-based triage protocol in [AGENTS.md](AGENTS.md) for unfixable issues.

## Constraints
- **Sub-Agents**: Use OpenCode sub-agents (see `agents-docs/SUB-AGENTS.md`) if complex delegation is required.
- **Direct Access**: Use standard shell commands for research; reference `agents-docs/` for all decision rules and behavioral gates.
- **Validation**: Ensure all 9 validation gates are respected in every pipeline-related task.

## Documentation
Refer to [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for technical specs and [hard-constraints.md](agents-docs/hard-constraints.md) for system limits.
