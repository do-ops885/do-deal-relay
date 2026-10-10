# .agents/skills/ - Canonical Skill Source

Single canonical location for every skill in this repository. Claude Code, Gemini CLI and Qwen Code consume it through symlinks; OpenCode reads the canonical path directly.

```text
.claude/skills/<name>  ->  ../../.agents/skills/<name>
.gemini/skills/<name>  ->  ../../.agents/skills/<name>
.qwen/skills/<name>    ->  ../../.agents/skills/<name>
```

## Setup and Validation

```bash
./scripts/setup-skills.sh        # create or refresh all symlinks (run once after clone)
./scripts/validate-skills.sh     # verify symlinks, frontmatter, Rationalizations, Red Flags
./scripts/skill-eval-check.sh    # hygiene sensor: structure, line limit, shared boilerplate, dead links, index drift
./scripts/skill-splitter.sh      # dry-run split plan for a SKILL.md over 250 lines (--apply to write)
```

## Authoring Conventions

Every skill is a directory with a `SKILL.md` at its root.

```text
skill-name/
  SKILL.md          # primary instructions, <= 250 lines, YAML frontmatter (name + description)
  reference/        # long-form detail extracted from SKILL.md (some upstream skills use references/)
  scripts/          # executable helpers referenced from SKILL.md
  evals/evals.json  # eval cases (recommended for every skill)
```

- `SKILL.md` must open with frontmatter containing `name` and `description`; the description is what agents match on, so state triggers and scope, not marketing.
- `## Rationalizations` is a `| Concern | Counter-Argument |` table that names the excuses an agent would use to cut corners on this specific skill and answers each one.
- `## Red Flags` is a `- [ ]` checklist of skill-specific early-warning behaviors.
- Both sections must be specific to the skill. Copy-pasted boilerplate shared with another skill is a defect and fails `./scripts/skill-eval-check.sh`.
- Every relative link inside a SKILL.md (`reference/...`, `references/...`, `scripts/...`, `evals/...`) must resolve. Dead links fail the same sensor.
- Keep the primary file small and push detail into `reference/` (progressive disclosure protects the token budget).

## Adding a Skill

1. Create `.agents/skills/<skill-name>/SKILL.md` with frontmatter, a core workflow, `## Rationalizations` and `## Red Flags`.
2. Add supporting `reference/`, `scripts/` and `evals/evals.json` as needed.
3. Register trigger keywords for it in `.agents/skills/skill-rules.json`.
4. Add a row to the index below, then run `./scripts/setup-skills.sh && ./scripts/validate-skills.sh && ./scripts/skill-eval-check.sh`.

## Skill Index

58 skills. The index is checked against the directory listing by `./scripts/skill-eval-check.sh`, so add rows when you add skills.

### Orchestration & Process

| Skill | Purpose |
| --- | --- |
| [`agent-coordination/`](agent-coordination/) | Coordination protocol for multi-agent swarms. |
| [`agentic-abstention/`](agentic-abstention/) | Abstention protocol for when environmental infeasibility makes further tool calls wasteful. |
| [`circuit-breaker/`](circuit-breaker/) | API resilience pattern for handling upstream failures gracefully. |
| [`context-hygiene/`](context-hygiene/) | Context window management patterns for coding agents. |
| [`distributed-locking/`](distributed-locking/) | TTL-based distributed locks that prevent races across workers and agents. |
| [`goap-agent/`](goap-agent/) | Goal-Oriented Action Planning execution for complex multi-step tasks. |
| [`iterative-refinement/`](iterative-refinement/) | Refinement loops with validation until quality criteria are met. |
| [`multi-agent-orchestration/`](multi-agent-orchestration/) | Supervisor plus worker patterns for tasks needing specialized roles. |
| [`parallel-execution/`](parallel-execution/) | Run independent tasks simultaneously to raise throughput. |
| [`pev-loop/`](pev-loop/) | Plan-Execute-Verify loop with atomic commits and independent verification. |
| [`self-learning-feedback/`](self-learning-feedback/) | Continuous verification, scoring and improvement of agent output. |

### Cloudflare Platform

| Skill | Purpose |
| --- | --- |
| [`agents-sdk/`](agents-sdk/) | Build AI agents on Cloudflare Workers with the Agents SDK. |
| [`agents-update/`](agents-update/) | Keep AGENTS.md a lean hub and move detail into `agents-docs/`. |
| [`architecture-diagram/`](architecture-diagram/) | Generate an architecture SVG by scanning the live project structure. |
| [`building-mcp-server-on-cloudflare/`](building-mcp-server-on-cloudflare/) | Build remote MCP servers on Workers with tools, OAuth and deployment. |
| [`cloudflare/`](cloudflare/) | Cloudflare platform index: Workers, Pages, KV, D1, R2, Workers AI, Vectorize. |
| [`cloudflare-email-service/`](cloudflare-email-service/) | Send and receive transactional email with Email Sending and Email Routing. |
| [`d1-ops/`](d1-ops/) | Operate D1 migrations across local, preview and production databases. |
| [`do-deal-relay/`](do-deal-relay/) | Product-specific agent instructions for referral codes, queries and MCP usage. |
| [`durable-objects/`](durable-objects/) | Create and review Cloudflare Durable Objects. |
| [`nlq/`](nlq/) | Natural language query interface for deal discovery. |
| [`refcli/`](refcli/) | Manage referral codes from the CLI; full URLs are always returned. |
| [`sandbox-sdk/`](sandbox-sdk/) | Build sandboxed environments for secure code execution. |
| [`turnstile-spin/`](turnstile-spin/) | Set up Cloudflare Turnstile end to end: widget creation, siteverify Worker, deploy. |
| [`web-perf/`](web-perf/) | Analyze web performance with Chrome DevTools MCP. |
| [`webhook-system/`](webhook-system/) | Event notifications with HMAC signature verification and retry logic. |

### Reliability & Security

| Skill | Purpose |
| --- | --- |
| [`console-to-logger/`](console-to-logger/) | Replace `console.*` calls with the structured logger. |
| [`crypto-utils/`](crypto-utils/) | Cryptographic helpers: hashing, signing and constant-time comparison. |
| [`error-sanitization/`](error-sanitization/) | Replace unsafe error patterns with sanitized error handling. |
| [`eu-ai-act-compliance/`](eu-ai-act-compliance/) | EU AI Act logging and compliance requirements for AI systems. |
| [`expiration-manager/`](expiration-manager/) | Time-based workflows for scheduling and tracking expirations. |
| [`guard-rails/`](guard-rails/) | Safety and quality enforcement that blocks dangerous operations. |
| [`metrics-pipeline/`](metrics-pipeline/) | Prometheus-compatible metrics collection and export. |
| [`privacy-first/`](privacy-first/) | Keep email addresses and personal data out of the codebase. |
| [`structured-logging/`](structured-logging/) | Correlation ID logging for distributed tracing. |
| [`validation-gates/`](validation-gates/) | Run and report the 9-gate deal validation pipeline. |

| [`stateful-pipeline/`](stateful-pipeline/) | Stateful data pipelines with retry, failure handling and rollback. |
| [`task-decomposition/`](task-decomposition/) | Split complex work into atomic goals with dependencies and success criteria. |
| [`trust-model/`](trust-model/) | Source classification and scoring for data trustworthiness. |


### Quality & Delivery

| Skill | Purpose |
| --- | --- |
| [`anti-ai-slop/`](anti-ai-slop/) | Audit UI, UX and copy for generic AI-generated patterns and fix them. |
| [`codeberg-api/`](codeberg-api/) | Interact with Forgejo/Codeberg repositories through the REST API. |
| [`github-readme/`](github-readme/) | Write human-focused GitHub README files. |
| [`jules-usage/`](jules-usage/) | Drive the Jules CLI: install, sessions, issue labeling and PR feedback. |
| [`pre-commit/`](pre-commit/) | Manage multi-language pre-commit hooks for code quality. |
| [`pr-resolver/`](pr-resolver/) | Automate the PR lifecycle: discover, fix CI, resolve conflicts, address reviews. |
| [`reddit-engagement/`](reddit-engagement/) | Safe Reddit community engagement for AI projects. |
| [`setup-coverage/`](setup-coverage/) | Configure test coverage reporting and upload it to Codacy. |
| [`shell-script-quality/`](shell-script-quality/) | Lint and test shell scripts with ShellCheck and BATS. |
| [`skill-creator/`](skill-creator/) | Create, modify and measure skills. |
| [`skill-evaluator/`](skill-evaluator/) | Evaluate skills: structure checks, eval review and live spot checks. |
| [`typescript-coding-standards/`](typescript-coding-standards/) | Enforce type safety, file size limits and naming conventions. |
| [`web-search-researcher/`](web-search-researcher/) | Research topics with web search for accurate, current information. |

### Codacy Analysis

| Skill | Purpose |
| --- | --- |
| [`codacy-analysis-cli/`](codacy-analysis-cli/) | Run local static analysis with the Codacy Analysis CLI. |
| [`codacy-cloud-cli/`](codacy-cloud-cli/) | Query repositories, issues, security findings, PRs, tools and patterns on Codacy Cloud. |
| [`codacy-code-review/`](codacy-code-review/) | Enrich PR reviews with Codacy quality, security, coverage and duplication data. |
| [`configure-codacy/`](configure-codacy/) | Tailor Codacy configuration to a project stack and reduce false positives. |
| [`configure-codacy-cloud/`](configure-codacy-cloud/) | Tune an existing Codacy Cloud repository configuration without local analysis. |

### Browser Automation

| Skill | Purpose |
| --- | --- |
| [`agent-browser/`](agent-browser/) | Browser automation CLI for AI agents. |
