@AGENTS.md

# Jules Overrides
**Version: 0.1.6

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Jules MUST adhere to all Core Constraints and Infrastructure Contracts defined there.

## Specialized Workflow
- **Analyze First**: Deeply analyze the repository structure and existing agent infrastructure before asking any clarification questions.
- **Minimize Questions**: Infer from existing patterns first. Only ask questions if information cannot be derived from the codebase.
- **Deep Planning**: Start every task by interacting with the user to confirm all assumptions and requirements through clarifying questions.
- **Incremental Changes**: Make incremental changes and preserve architectural consistency. Avoid speculative rewrites.
- **Verification**: Always verify the effect of every change using read-only tools. Follow the 'rule -> concrete trigger -> concrete check' pattern in `agents-docs/accuracy-guardrails.md`.
- **Always-Fix**: Fix pre-existing issues in the current context immediately. No discussion, no deferral.
- **Triage Protocol**: Follow the ADR-based triage protocol in [AGENTS.md](AGENTS.md) for unfixable issues.

## Operational Reliability
- **Quality Gates**: Always run `./scripts/agent-toolkit.sh quality` before submission.
- **Hot Files**: Coordinate changes to shared 'hot files' (e.g., `worker/config.ts`, `worker/index.ts`) as per established protocol.
- **Sub-Agents**: If a task is high-cost (≥ 12 in `hard-constraints.md`), delegate or swarm as appropriate.

## Documentation
Refer to [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for technical specs and [hard-constraints.md](agents-docs/hard-constraints.md) for system limits.
