@AGENTS.md

# Gemini CLI Overrides
**Version**: 1.1.0

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Gemini must adhere to all Core Constraints and Infrastructure Contracts defined there.

## Context Advantage
- **Large Window**: Gemini can ingest full agent specs and codebase files. Use this for deep structural analysis.
- **System Integrity**: Always cross-reference `wrangler.jsonc` and `worker/config.ts` when modifying infra-related docs.

## Behavioral Constraints
- **Sequential Execution**: No native sub-agent support. Use sequential task decomposition in `plans/`.
- **Manual Skills**: No `skill` command. Read `.agents/skills/*.md` files directly.
- **Verbose Output**: Leverage large context for detailed test failure and gate rejection analysis.
- **Verification**: Explicitly document the "reasoning" behind configuration changes in PR descriptions.

## Reference
Refer to [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for typed tool signatures and validation gate semantics.
