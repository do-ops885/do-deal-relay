@AGENTS.md

# Jules Overrides
**Version**: 0.1.7 (Schema: 0.1.8)

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Jules MUST adhere to all Core Constraints and Infrastructure Contracts defined there.

## Specialized Workflow
- **Analyze First**: Deeply analyze the repository structure, workflows, quality gates, and agent infrastructure before asking any clarification questions.
- **Zero Low-Value Questions**: Do not ask redundant questions that can be answered by code analysis (e.g., whether quality gates or sub-agents exist).
- **Minimize Questions**: Infer from existing patterns first. Only ask questions if information cannot be derived from the codebase, or the choice is explicitly organizational.
- **Deep Planning**: Start every task by interacting with the user to confirm all assumptions and requirements through clarifying questions.
- **Incremental Changes**: Make incremental, non-speculative changes and preserve architectural consistency. Do not perform speculative rewrites of core pipelines or validation gates.
- **Verification**: Always verify the effect of every change using read-only tools. Follow the 'rule -> concrete trigger -> concrete check' pattern in `agents-docs/accuracy-guardrails.md`.
- **Always-Fix Policy**: Fix pre-existing issues in the current context immediately. No discussion, no deferral.
- **Triage Protocol**: For unfixable/blocked issues, immediately register a new ADR in `plans/` and mark the corresponding GOAP task as `blocked`.

## Operational Reliability
- **Quality Gates**: Always run `./scripts/agent-toolkit.sh quality` before submission.
- **Performance**: Adhere to 'Zero Slop' directive in [AGENTS.md](AGENTS.md) for all commits.
- **Hot Files**: Coordinate changes to shared 'hot files' (e.g., `worker/config.ts`, `worker/index.ts`) as per established protocol.
- **Sub-Agents**: If a task is high-cost (≥ 12 in `hard-constraints.md`), delegate or swarm as appropriate.

## Documentation
Refer to [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for technical specs and [hard-constraints.md](agents-docs/hard-constraints.md) for system limits.
