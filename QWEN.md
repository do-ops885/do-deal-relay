@AGENTS.md

# Qwen CLI Overrides
**Version**: 1.1.0

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Qwen must adhere to all Core Constraints and Infrastructure Contracts defined there.

## Operational Focus
- **Precision**: Follow typed tool signatures in [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) exactly.
- **Strict Compliance**: Adhere strictly to the shared agent contract in [AGENTS.md](AGENTS.md).
- **Verification**: Run `./scripts/quality_gate.sh` frequently to ensure zero-regression documentation updates.

## Constraints
- **Sub-Agents**: Use OpenCode sub-agents (see `agents-docs/SUB-AGENTS.md`) if complex delegation is required.
- **Direct Access**: Use standard shell commands for research; reference `agents-docs/` for all decision rules and behavioral gates.
- **Validation**: Ensure all 9 validation gates are respected in every pipeline-related task.

## Documentation
Refer to [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for technical specs and [hard-constraints.md](agents-docs/hard-constraints.md) for system limits.
