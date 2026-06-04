# Accuracy Guardrails - do-deal-relay

Verification rules and checks to ensure correctness across the codebase.

## Config Contract Changes
**Rule**: When changing `validateConfig()` in `worker/config.ts`, you MUST inspect all call sites where these variables are provided to the worker.

- **Concrete Trigger**: Any edit to the `validateConfig()` block.
- **Concrete Check**: `grep -r 'wrangler dev\|wrangler deploy' .github/workflows/` and verify the new environment variable is present in the workflow YAML.
- **Example**: When `EMAIL_WEBHOOK_SECRET` was added, the E2E tests failed because the variable wasn't injected in the CI workflow.

## Endpoint Response Format Changes
**Rule**: When changing the structure or content-type of an API endpoint, update all assertion layers in the test suite.

- **Concrete Trigger**: Any change to `jsonResponse()` or return types in `worker/index.ts` or `worker/routes/`.
- **Concrete Check**: Run `npm run test` and `npm run test:e2e` to verify body-shape assertions.
- **Example**: Changing the `/metrics` format from JSON to Prometheus text format requires updating all tests that expect JSON.

## Verification after Changes
**Rule**: Prefer evidence from repository state over assumptions. Always verify the effect of a change using read-only tools.

- **Trigger**: Any file modification (creation, edit, deletion).
- **Check**: Use `ls`, `cat`, or `grep` to confirm the file content or existence matches the intention.

## Schema Integrity
**Rule**: All deal data must adhere to the schema defined in `worker/types.ts`.

- **Trigger**: Modifying the deal discovery or normalization logic.
- **Check**: The `schema_validation` gate in the pipeline and unit tests in `tests/unit/validation/`.

## Skill-First Workflow
**Rule**: When a task overlaps with a loaded or available skill, follow the skill's documented workflow instead of improvising.

- **Concrete Trigger**: Any task where a relevant skill exists in `.agents/skills/` (e.g., Codacy analysis, coverage setup, code review).
- **Concrete Check**: Load the skill with `skill()` and verify the task is addressed by the skill's documented steps, CLI commands, and output-parsing patterns. If the skill's workflow is incomplete, update the skill rather than creating ad-hoc scripts.
- **Example**: Parsing Codacy JSON output should use the `codacy-analysis-cli` skill's documented `jq` commands (Step 5: Interpret results) rather than writing a throwaway Python script.

## Fix-Forward
**Rule**: Always attempt to fix pre-existing issues and warnings encountered during work. If a fix is not possible, document it as a follow-up in `plans/`.

- **Concrete Trigger**: Linter warnings, type errors, deprecated APIs, or CI issues found while working on a task — even if they are unrelated to the current task.
- **Concrete Check**: Before committing, scan modified files for warnings. Fix what is fixable. If an issue cannot be resolved (upstream bug, out-of-scope, external dependency), create a `plans/FOLLOWUP-<brief-slug>.md` with the issue description, root cause, and proposed resolution.
- **Example**: While fixing Codacy CI issues, encountering deprecated `node:crypto` usage in a neighboring file — fix it in the same commit rather than leaving it for later.
