.:
AGENTS.md
CHANGELOG.md
CLAUDE.md
CONTRIBUTING.md
GEMINI.md
NOTICE
QWEN.md
README.md
SECURITY.md
VERSION
agents-docs
bot
commitlint.config.cjs
docs
extension
markdownlint.toml
opencode.json
package-lock.json
package.json
plans
playwright.config.ts
public
reports
scripts
state.json
temp
tests
tsconfig.json
typecheck_errors.txt
typecheck_full.txt
typecheck_output.txt
typecheck_output_v5.txt
typecheck_v6.txt
typecheck_v7.txt
typecheck_v8.txt
vitest.config.ts
worker
wrangler.jsonc

./agents-docs:
AGENTS_REGISTRY.md
CONTEXT.md
GUARD_RAILS.md
HARNESS.md
HOOKS.md
KNOWN_ISSUES.md
LESSONS.md
NEVER-BYPASS-SYSTEM.md
PROJECT_STRUCTURE.md
README.md
SKILLS.md
SUB-AGENTS.md
SYSTEM_REFERENCE.md
agents
coordination
features
guard-rails.md
handoffs
lessons.jsonl
quality-standards.md
url-handling.md

./agents-docs/agents:
bootstrap-agent.md
browser-agent.md
data-agent.md
discovery-agent.md
doc-agent.md
github-agent.md
notify-agent.md
publish-agent.md
scoring-agent.md
storage-agent.md
system-validation-agent.md
test-agent.md

./agents-docs/coordination:
blockers.md
handoff-log.jsonl
handoff-protocol.md
input-methods-handoff-protocol.md
input-methods-swarm-config.json
production-readiness.md
referral-handoff-protocol.md
referral-swarm-config.json
state-management.md
state.json
swarm-config.schema.json
swarm-handoff-log.jsonl
swarm-patterns.md

./agents-docs/features:
analytics-categorization.md
email-api.md
experience-feedback.md
input-methods.md
nlq-api.md
referral-system.md
web-research.md
webhook-system.md

./agents-docs/handoffs:
README.md

./bot:
README.md
api-client.ts
commands
conversations.ts
discord
telegram

./bot/commands:
admin.ts
index.ts
referral.ts
research.ts
types.ts
utils.ts

./bot/discord:
commands.ts
embeds.ts
handlers.ts
index.ts
permissions.ts
ratelimit.ts
types.ts

./bot/telegram:
index.ts

./docs:
AGENTS.md
API.md
BEST_PRACTICES.md
DEPLOYMENT.md
DEPLOYMENT_STEPS.md
FEATURE_FLAGS.md
INDEX.md
LEGAL_COMPLIANCE.md
MCP.md
MIGRATION.md
PERFORMANCE.md
QUICKSTART.md
QUICK_START_DEPLOYMENT.md
ROLLBACK_PROCEDURES.md
SECRETS_CONFIGURATION.md
SECURITY_ADVISORY.md
openapi.yaml

./extension:
README.md
background.js
content.js
icons
manifest.json
popup.html
popup.js

./extension/icons:
icon-128.svg
icon-16.svg
icon-32.svg
icon-48.svg

./plans:
GOAP_IMPROVEMENTS_2026-05-11.md
INDEX.md
PROGRESS.md
README.md
dependabot-npm-integration.md
github-automation-plan.md
jules-audit
multi-agent-workflow.md

./plans/jules-audit:
AUDIT_SNAPSHOT.md

./public:
deals-research.md
deals.json

./reports:
IMPLEMENTATION_SUMMARY.md
IMPLEMENTATION_SUMMARY_2026-04-03.md
LOAD_TEST_RESULTS.md
README.md
SWARM_ANALYSIS_2026-04-03.md
analysis
archived_plans
implementation_summary.md
load-tests

./reports/analysis:
README.md
analysis-chatbot.md
analysis-cli.md
analysis-email.md
analysis-extension.md
analysis-web-ui.md
analysis-webhook.md
codebase-audit-2026-04-04.md
feature-gap-analysis.md
pr-4-analysis.md
pr-4-closure-report.md
reddit-ai-communities-analysis.md
security-audit-report.md
self-learning-analysis.md
swarm-missing-implementations-2026-04-04.md

./reports/archived_plans:
2026-ci-cd-config-plan.md
EXECUTION_PLAN_2026.md
PRE_EXISTING_CI_ISSUES.md
PROGRESS_ARCHIVE_2026-05.md
production-readiness.md

./reports/load-tests:
2026-04-03-local.md

./scripts:
ai-commit.sh
benchmark_pipeline.ts
check-directory-organization.sh
cli
generate-release-body.sh
generate-version.sh
generate-wrangler-ci.sh
gh-labels-creator.sh
init-kv-data.sh
pre-commit-hook.sh
pre-push-hook.sh
production_sim.ts
quality_gate.sh
refcli.ts
release-pr.sh
release.sh
run-tests-ci.sh
run_act_local.sh
seed-kv.sh
setup-skill-scaffolding.py
setup-skills.sh
test_exit.sh
update-agents-registry.sh
update-docs.sh
validate-codes.sh
validate-commit-message.sh
validate-skills.sh
validate-url-preservation.ts
verify-deployment.sh
verify.sh

./scripts/cli:
commands
config.ts
index.ts
types.ts
utils.ts

./scripts/cli/commands:
auth.ts
codes.ts
research.ts
system.ts

./temp:
ai-agent-self-test.ts
cleanup-summary-001.md
codeql-setup-status.md
handoff-agents-optimization.md
handoff-audit-agent-results.md
handoff-bot.md
handoff-email.md
handoff-extension.md
handoff-node-agent-results.md
handoff-npm-agent-results.md
handoff-security-agent-results.md
handoff-setup.md
handoff-swarm-016-quality-gate.md
handoff-swarm-coordination.md
handoff-validate-001.md
handoff-webhook.md
progress-2026-04-01.md
research-ai-agent-ecosystem.md
research-eu-ai-act.md
state.json
test-referral-url.ts

./tests:
browser
e2e
fixtures
integration
load
smoke
unit

./tests/browser:
README.md
extension.spec.ts
popup_a11y.spec.ts

./tests/e2e:
README.md
api.spec.ts

./tests/fixtures:
README.md
deals.ts

./tests/integration:
api.test.ts
mcp-tools.test.ts
scheduled.test.ts
validation-fast-path.test.ts

./tests/load:
artillery
load-test.ts

./tests/load/artillery:
README.md
api-endpoints.yml
kv-processor.js
kv-storage.yml
webhook-processor.js
webhook.yml

./tests/smoke:
endpoints.test.ts

./tests/unit:
analytics
auth.test.ts
budget-allocation.test.ts
bulk
cache.test.ts
categorization
circuit-breaker.test.ts
config-threshold.test.ts
config-validation-enhanced.test.ts
crypto.test.ts
d1-queries.test.ts
dedupe.test.ts
discover.test.ts
email
experience-api.test.ts
experience-d1.test.ts
expiration.test.ts
explainability.test.ts
feature-flags
funnel-instrumentation.test.ts
funnel-metrics.test.ts
gates
github.test.ts
guard-rails.test.ts
lock.test.ts
logger.test.ts
mcp-resources.test.ts
mcp-tools.test.ts
mcp-utils.test.ts
metrics_latency.test.ts
nlq
normalize.test.ts
notify.test.ts
publish.test.ts
ranking.test.ts
rate-limit-kv
rate-limit.test.ts
research-agent.test.ts
routes-utils-security.test.ts
score.test.ts
security-auth.test.ts
security-gatekeeper.test.ts
stage.test.ts
state-machine.test.ts
storage.test.ts
utils.test.ts
validate.test.ts
validation-cache.test.ts
validation.test.ts
validation_gates_metrics.test.ts
webhook
webhook-delivery-parallel.test.ts
worker-init.test.ts

./tests/unit/analytics:
calculators-categories-sources.test.ts
calculators-deals-over-time.test.ts
calculators-value-expiry-quality.test.ts
dashboard.test.ts

./tests/unit/bulk:
export.test.ts
import.test.ts

./tests/unit/categorization:
auto-categorize.test.ts
batch-stats.test.ts
category-scores.test.ts
definitions.test.ts
tag-scores.test.ts

./tests/unit/email:
extraction-fields-types.test.ts
extraction-urls-service.test.ts
patterns-commands.test.ts
patterns-generic-services.test.ts
security-spam-utils.test.ts
security-validation.test.ts
templates-commands.test.ts
templates-responses.test.ts

./tests/unit/feature-flags:
crud.test.ts
middleware.test.ts
rollouts.test.ts

./tests/unit/gates:
duplicate-check.test.ts
freshness.test.ts
idempotency-check.test.ts
normalization-verification.test.ts
orchestration.test.ts
price-sanity.test.ts
schema-validation.test.ts
second-pass-validation.test.ts
snapshot-hash-verification.test.ts
trust-score.test.ts

./tests/unit/nlq:
handlers-get-explain.test.ts
handlers-post.test.ts
index.test.ts
service.test.ts
threshold-config.test.ts
utils.test.ts

./tests/unit/rate-limit-kv:
core.test.ts
middleware.test.ts

./tests/unit/webhook:
delivery.test.ts
incoming-auth.test.ts
incoming-events.test.ts
routes-dispatcher.test.ts
routes-handlers.test.ts
subscriptions-mutations.test.ts
subscriptions-partner.test.ts
types.test.ts

./worker:
config.ts
db
email
index.ts
lib
notify.ts
pipeline
publish.ts
routes
state-machine.ts
types
types.ts
validation
version.ts

./worker/db:
schema.sql

./worker/email:
README.md
extraction.ts
handler.ts
handlers
index.ts
patterns
patterns.ts
security.ts
templates
templates.ts
types.ts

./worker/email/handlers:
commands.ts
forwarded.ts
help.ts
incoming.ts
index.ts
parse.ts
utils.ts

./worker/email/patterns:
command.ts
index.ts
referral.ts

./worker/email/templates:
commands.ts
index.ts
responses.ts
types.ts

./worker/lib:
analytics
auth.ts
cache.ts
categorization
circuit-breaker.ts
config-utils.ts
crypto.ts
d1
error-handler.ts
eu-ai-act-logger.ts
expiration
expiration-manager.ts
explainability.ts
feature-flags.ts
github
global-logger.ts
guard-rails.ts
hmac.ts
lock.ts
logger
logger.ts
mcp
metrics
nlq
ranking.ts
rate-limit-kv.ts
rate-limit.ts
referral-storage
research-agent
storage.ts
utils.ts
validation
validation-cache
webhook
webhook-sdk.ts

./worker/lib/analytics:
calculators.ts
dashboard.ts
index.ts
types.ts

./worker/lib/categorization:
definitions.ts
index.ts
scoring.ts

./worker/lib/d1:
client.ts
experience.ts
index.ts
migrations.ts
queries.ts

./worker/lib/expiration:
finding.ts
index.ts
mark-expired.ts
notifications.ts
scheduling.ts
validation.ts

core.ts
index.ts
types.ts
workflows.ts

./worker/lib/logger:
export.ts
index.ts
legacy.ts
query.ts
structured.ts
types.ts

./worker/lib/mcp:
handlers
resources.ts
tools
types.ts
utils.ts

./worker/lib/mcp/handlers:
categories.ts
discovery.ts
experience.ts
logging.ts
nlq.ts
pipeline.ts
referrals.ts
report.ts
research.ts
search.ts
stats.ts
validation.ts

./worker/lib/mcp/tools:
deals.ts
index.ts
research.ts
system.ts
user.ts

./worker/lib/metrics:
core.ts
index.ts
stats.ts

./worker/lib/nlq:
ai
ai-enhancer.ts
entities.ts
hybrid
hybrid-classifier.ts
index.ts
intent.ts
lexer.ts
parser.ts
query-builder
types.ts

./worker/lib/nlq/ai:
entities.ts
expansion.ts
index.ts
intent.ts
types.ts

./worker/lib/nlq/hybrid:
ai-decision.ts
index.ts
rule-classifier.ts

./worker/lib/nlq/query-builder:
executor.ts
explanation.ts
index.ts
sql.ts

./worker/lib/referral-storage:
crud.ts
dual-write.ts
index.ts
search.ts
types.ts

./worker/lib/research-agent:
fetcher.ts
index.ts
orchestrator.ts
sources.ts
types.ts

./worker/lib/validation:
code-validator.ts
reward-scraper.ts
url-validator.ts

./worker/lib/validation-cache:
index-repository.ts
key.ts
repository.ts

./worker/lib/webhook:
delivery.ts
incoming.ts
index.ts
subscriptions.ts
types.ts

./worker/pipeline:
dedupe.ts
discover.ts
normalize.ts
score.ts
stage.ts
validate-fast-path.ts

./worker/routes:
bulk
core
d1
email.ts
experience.ts
mcp
nlq
referrals.ts
utils.ts
validation.ts
webhooks
webhooks-README.md
webhooks.ts

./worker/routes/bulk:
export.ts
import.ts
index.ts

./worker/routes/core:
analytics.ts
deals.ts
health.ts
index.ts
pipeline.ts
submit.ts

./worker/routes/d1:
admin.ts
deals.ts
index.ts
search.ts
stats.ts

./worker/routes/mcp:
index.ts
initialize.ts
resources.ts
tools.ts
utils.ts

./worker/routes/nlq:
handlers.ts
index.ts
service.ts
utils.ts

./worker/routes/webhooks:
incoming.ts
index.ts
subscriptions.ts
sync.ts
types.ts

./worker/types:
validation-cache.ts

./worker/validation:
gates
pipeline.ts
types.ts

./worker/validation/gates:
duplicate-check.ts
freshness.ts
idempotency-check.ts
normalization-verification.ts
price-sanity.ts
schema-validation.ts
second-pass-validation.ts
snapshot-hash-verification.ts
trust-score.ts
