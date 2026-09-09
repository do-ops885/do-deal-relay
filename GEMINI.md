@AGENTS.md

# Gemini CLI Overrides
**Version**: 1.2.0 (Schema: 0.1.8)

## Behavioral Contract
Extends [AGENTS.md](AGENTS.md). Gemini must adhere to all Core Constraints and Infrastructure Contracts defined there.

## Tool Signature Mapping
MCP tools are canonically named in code; agents MUST use canonical tool names when executing tool calls:
- **`search_deals`** (Alias: `get_deals`): Search referral deals by domain, category, status, query, or threshold parameters.
- **`get_deal`** (Alias: `get_deal_by_code`): Retrieve full details for a single referral code.
- **`add_referral`** (Alias: `submit_deal`): Submit a new referral code into staging/quarantine.

## Hard Stop & Non-Bypassable Conditions
1. **Protected Branch Protection**: Direct pushes to `main` or `develop` are forbidden.
2. **Secret Leakage**: Hardcoded credentials, tokens, or private keys are strictly forbidden.
3. **Pipeline Rewrite**: Speculative rewrites of the 9-gate validation pipeline or SSRF `validatedFetch` security controls are strictly forbidden.

## Context Advantage
- **Large Window**: Gemini can ingest full agent specs and codebase files. Use this for deep structural analysis.
- **System Integrity**: Always cross-reference `wrangler.jsonc` and `worker/config.ts` when modifying infra-related docs.

## Behavioral Constraints
- **Sequential Execution**: No native sub-agent support. Use sequential task decomposition in `plans/`.
- **Manual Skills**: No `skill` command. Read `.agents/skills/*.md` files directly.
- **Verbose Output**: Leverage large context for detailed test failure and gate rejection analysis.
- **Verification**: Explicitly document the "reasoning" behind configuration changes in PR descriptions.
- **Unified Toolkit**: Use `./scripts/agent-toolkit.sh` for setup, doctor, quality, and docs tasks.
- **Always-Fix Policy**: Fix pre-existing issues in the current context immediately per [AGENTS.md](AGENTS.md).
- **Performance**: Adhere to the 'Zero Slop' directive in [AGENTS.md](AGENTS.md) for all commits.
- **Triage Protocol**: For unfixable/blocked issues, register a new ADR in `plans/` and mark the corresponding GOAP task as `blocked`.
- **Analyze-First**: Analyze repository structure, CI/CD setup, quality gates, and agent infrastructure deeply before asking ANY questions.
- **No Low-Value Questions**: Do not ask redundant questions that can be answered by the codebase itself.
- **Incremental & Non-Speculative**: Make small, incremental changes. Never speculatively rewrite core pipeline logic or validation gates.

## Reference
Refer to [SYSTEM_REFERENCE.md](agents-docs/SYSTEM_REFERENCE.md) for typed tool signatures and validation gate semantics.
