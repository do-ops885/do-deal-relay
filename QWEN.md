@AGENTS.md

# Qwen CLI Overrides

## Operational Focus
- **Precision**: Follow tool signatures in `AGENTS.md` and `SYSTEM_REFERENCE.md` exactly.
- **Strict Compliance**: Adhere strictly to the shared agent contract in `AGENTS.md`.

## Constraints
- **Sub-Agents**: Use OpenCode sub-agents if complex delegation is required.
- **Verification**: Run `./scripts/quality_gate.sh` frequently to ensure zero-regression documentation updates.
- **Direct Access**: Use standard shell commands for research; reference `agents-docs/` for decision rules.
