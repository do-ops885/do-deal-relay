extension/:
README.md
background.js
content.js
icons
manifest.json
popup.html
popup.js

extension/icons:
icon-128.svg
icon-16.svg
icon-32.svg
icon-48.svg

scripts/:
ai-commit.sh
benchmark_pipeline.ts
bootstrap.sh
check-ci-status.sh
check-directory-organization.sh
check-evals-freshness.sh
cli
doctor.sh
generate-changelog.sh
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
run_act_local.sh
seed-auth.ts
seed-kv.sh
seed-local-kv.sh
setup-skill-scaffolding.py
setup-skills.sh
test-trufflehog-validate.txt
test_exit.sh
update-agents-registry.sh
update-ci-status.sh
update-docs.sh
validate-codes.sh
validate-commit-message.sh
validate-dependabot.js
validate-dependabot.sh
validate-skills.sh
validate-url-preservation.ts
verify-deployment.sh
verify.sh
worker-host.sh

scripts/cli:
commands
config.ts
index.ts
types.ts
utils.ts

scripts/cli/commands:
auth.ts
codes.ts
research.ts
system.ts

tests/:
browser
e2e
fixtures
integration
load
smoke
unit

tests/browser:
README.md
extension.spec.ts
popup_a11y.spec.ts

tests/e2e:
README.md
api.spec.ts
auth.spec.ts
setup-auth.sh

tests/fixtures:
README.md
deals.ts
dependabot-invalid-ecosystem.yml
dependabot-invalid-schedule-day.yml
dependabot-missing-schedule.yml
dependabot-missing-version.yml

tests/integration:
api.test.ts
mcp-tools.test.ts
referrals.test.ts
research-api.test.ts
scheduled.test.ts
validation-fast-path.test.ts

tests/load:
artillery
load-test.ts

tests/load/artillery:
README.md
api-endpoints.yml
kv-processor.js
kv-storage.yml
webhook-processor.js
webhook.yml

tests/smoke:
endpoints.test.ts

tests/unit:
analytics
auth.test.ts
budget-allocation.test.ts
bulk
cache.test.ts
categorization
circuit-breaker.test.ts
code-validator-impl.test.ts
config-threshold.test.ts
config-validation-enhanced.test.ts
crypto.test.ts
d1-queries.test.ts
deals-route-impl.test.ts
dedupe.test.ts
dependabot-patterns.test.ts
discover.test.ts
email
error-handler.test.ts
experience-api.test.ts
experience-d1.test.ts
expiration.test.ts
explainability.test.ts
feature-flags
funnel-instrumentation.test.ts
funnel-metrics.test.ts
gates
github.test.ts
global-logger.test.ts
guard-rails.test.ts
health-endpoint.test.ts
jwt-auth.test.ts
lock.test.ts
logger.test.ts
mcp-pagination.test.ts
mcp-resources.test.ts
mcp-tools.test.ts
mcp-utils.test.ts
metrics_latency.test.ts
nlq
nlq-utils.test.ts
normalize.test.ts
notify.test.ts
prometheus-metrics.test.ts
publish.test.ts
ranking.test.ts
rate-limit-kv
rate-limit.test.ts
referral-routing.test.ts
referral-storage
research-agent-sources.test.ts
research-agent.test.ts
reward-scraper-impl.test.ts
routes-utils-security.test.ts
routes-utils.test.ts
score.test.ts
security-auth.test.ts
security-gatekeeper.test.ts
security-impl.test.ts
ssrf-bypass.test.ts
stage.test.ts
state-machine.test.ts
storage.test.ts
url-validator-impl.test.ts
utils.test.ts
validate-fast-path-types.test.ts
validate.test.ts
validation-cache.test.ts
validation.test.ts
validation_gates_metrics.test.ts
webhook
webhook-delivery-parallel.test.ts
worker-host.test.sh
worker-init.test.ts

tests/unit/analytics:
calculators-categories-sources.test.ts
calculators-deals-over-time.test.ts
calculators-value-expiry-quality.test.ts
dashboard.test.ts

tests/unit/bulk:
export.test.ts
import.test.ts

tests/unit/categorization:
auto-categorize.test.ts
batch-stats.test.ts
category-scores.test.ts
definitions.test.ts
tag-scores.test.ts

tests/unit/email:
extraction-fields-types.test.ts
extraction-urls-service.test.ts
patterns-commands.test.ts
patterns-generic-services.test.ts
security-spam-utils.test.ts
security-validation.test.ts
templates-commands.test.ts
templates-responses.test.ts

tests/unit/feature-flags:
crud.test.ts
middleware.test.ts
rollouts.test.ts

tests/unit/gates:
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

tests/unit/nlq:
handlers-get-explain.test.ts
handlers-post.test.ts
index.test.ts
query-builder
service.test.ts
threshold-config.test.ts
utils.test.ts

tests/unit/nlq/query-builder:
explanation.test.ts
index.test.ts
sql.test.ts

tests/unit/rate-limit-kv:
core.test.ts
middleware.test.ts

tests/unit/referral-storage:
dual-write.test.ts

tests/unit/webhook:
delivery.test.ts
incoming-auth.test.ts
incoming-events.test.ts
routes-dispatcher.test.ts
routes-handlers.test.ts
ssrf-protection.test.ts
subscriptions-mutations.test.ts
subscriptions-partner.test.ts
types.test.ts

worker/:
config.ts
db
email
index.ts
lib
middleware
notify.ts
pipeline
publish.ts
router.ts
routes
scheduled.ts
state-machine.ts
types
types.ts
validation
version.ts

worker/db:
schema.sql

worker/email:
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

worker/email/handlers:
commands.ts
forwarded.ts
help.ts
incoming.ts
index.ts
parse.ts
utils.ts

worker/email/patterns:
command.ts
index.ts
referral.ts

worker/email/templates:
commands.ts
index.ts
responses.ts
types.ts

worker/lib:
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
jwt.ts
lock.ts
logger
logger.ts
mcp
metrics
nlq
ranking.ts
rate-limit-kv.ts
rate-limit.ts
rbac.ts
referral-storage
refresh-tokens.ts
research-agent
search
security.ts
storage.ts
utils.ts
validation
validation-cache
webhook
webhook-sdk.ts

worker/lib/analytics:
calculators.ts
dashboard.ts
index.ts
types.ts

worker/lib/categorization:
definitions.ts
index.ts
scoring.ts

worker/lib/d1:
analytics.ts
client.ts
domain-category.ts
experience.ts
index.ts
migrations
mutations.ts
queries.ts
referrals.ts
search.ts
statistics.ts
status.ts
types.ts

worker/lib/d1/migrations:
index.ts
runner.ts
schema.ts
types.ts

worker/lib/expiration:
finding.ts
index.ts
mark-expired.ts
notifications.ts
scheduling.ts
validation.ts

worker/lib/github:
core.ts
index.ts
types.ts
workflows.ts

worker/lib/logger:
export.ts
index.ts
legacy.ts
query.ts
structured.ts
types.ts

worker/lib/mcp:
handlers
pagination.ts
progress.ts
resources.ts
tools
types.ts
utils.ts

worker/lib/mcp/handlers:
categories.ts
discovery.ts
experience.ts
logging.ts
nlq.ts
pipeline.ts
progress.ts
referrals.ts
report.ts
research.ts
search.ts
stats.ts
validation.ts

worker/lib/mcp/tools:
deals.ts
index.ts
research.ts
system.ts
user.ts

worker/lib/metrics:
core.ts
index.ts
prometheus.ts
stats.ts

worker/lib/nlq:
ai
entities.ts
hybrid
index.ts
intent.ts
lexer.ts
parser.ts
query-builder
types.ts

worker/lib/nlq/ai:
entities.ts
expansion.ts
index.ts
intent.ts
types.ts

worker/lib/nlq/hybrid:
ai-decision.ts
index.ts
rule-classifier.ts

worker/lib/nlq/query-builder:
executor.ts
explanation.ts
index.ts
sql.ts

worker/lib/referral-storage:
crud.ts
d1-queries.ts
dual-write.ts
index.ts
search.ts
types.ts

worker/lib/research-agent:
api-fetchers.ts
constants.ts
extractor.ts
fetcher.ts
helpers.ts
index.ts
orchestrator.ts
page-fetcher.ts
rate-limiter.ts
reddit-fetcher.ts
referral-extractor.ts
request-manager.ts
sources.ts
summarizer.ts
types.ts

worker/lib/search:
client.ts
embedding-pipeline.ts
types.ts

worker/lib/validation:
code-validator-types.ts
code-validator.ts
page-validation.ts
reward-scraper.ts
scrapers
url-rate-limit.ts
url-request.ts
url-validator-types.ts
url-validator.ts

worker/lib/validation/scrapers:
batch-processor.ts
change-detector.ts
html-extractor.ts
reward-scraper-core.ts
types.ts

worker/lib/validation-cache:
index-repository.ts
key.ts
repository.ts

worker/lib/webhook:
delivery.ts
incoming.ts
index.ts
subscriptions.ts
sync-executor.ts
types.ts

worker/middleware:
authorization.ts

worker/pipeline:
comparison.ts
dedupe.ts
discover.ts
normalize.ts
score.ts
stage.ts
validate-fast-path.ts

worker/routes:
admin
auth.ts
bulk
core
d1
dashboard.ts
email.ts
experience.ts
health.ts
mcp
mcp-stream.ts
nlq
referral-research.ts
referrals.ts
semantic-search.ts
utils.ts
validation.ts
webhooks
webhooks-README.md
webhooks.ts

worker/routes/admin:
keys.ts

worker/routes/bulk:
export.ts
import.ts
index.ts

worker/routes/core:
analytics.ts
deals.ts
health.ts
index.ts
pipeline.ts
submit.ts

worker/routes/d1:
admin.ts
deals.ts
index.ts
search.ts
stats.ts

worker/routes/mcp:
index.ts
initialize.ts
resources.ts
tools.ts
utils.ts

worker/routes/nlq:
handlers.ts
index.ts
service.ts
utils.ts

worker/routes/webhooks:
incoming.ts
index.ts
subscriptions.ts
sync.ts
types.ts

worker/types:
api.ts
deal.ts
health.ts
pipeline.ts
referral.ts
validation-cache.ts

worker/validation:
gates
pipeline.ts
types.ts

worker/validation/gates:
duplicate-check.ts
freshness.ts
idempotency-check.ts
normalization-verification.ts
price-sanity.ts
schema-validation.ts
second-pass-validation.ts
snapshot-hash-verification.ts
trust-score.ts
