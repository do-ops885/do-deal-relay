-- Migration 0008: Alert deliveries + AI Act logs + subscriptions trigger
-- Mirrors runtime migration v14 (add_alert_deliveries_aiact) in
-- worker/lib/d1/migrations/schema-part-8.ts. Dual-write pattern:
-- every runtime version has a raw SQL mirror here.
-- v13 (0007) created alert_subscriptions only; v14 adds the idempotency
-- guard table the queue consumer needs and the ai_act_logs table backing
-- EUAIActLogger (Article 12) that matcher.ts already calls.
--
-- Dialect: SQLite (Cloudflare D1). This file is intentionally excluded
-- from Codacy static analysis (see .codacy.yml); Codacy's SQL linter
-- parses a Postgres dialect and cannot accept valid SQLite syntax such
-- as CREATE TRIGGER IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS alert_deliveries (
    alert_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL REFERENCES alert_subscriptions(id) ON DELETE CASCADE,
    deal_ids TEXT NOT NULL DEFAULT '[]',
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'skipped')),
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (alert_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_subscription
  ON alert_deliveries(subscription_id);

CREATE TRIGGER IF NOT EXISTS alert_subscriptions_updated_at
AFTER UPDATE ON alert_subscriptions
BEGIN
    UPDATE alert_subscriptions SET updated_at = strftime('%s', 'now')
    WHERE id = new.id;
END;

CREATE TABLE IF NOT EXISTS ai_act_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    system_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    correlation_id TEXT,
    operation TEXT NOT NULL,
    operation_version TEXT,
    input_source TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    input_description TEXT,
    input_reference_db TEXT,
    input_match TEXT,
    input_metadata TEXT,
    output_result TEXT NOT NULL,
    output_confidence REAL,
    output_explanation TEXT,
    output_decision_basis TEXT,
    reviewer_id TEXT,
    reviewer_role TEXT,
    oversight_decision TEXT,
    oversight_timestamp TEXT,
    oversight_notes TEXT,
    risk_flags TEXT,
    anomalies TEXT,
    performance_metrics TEXT,
    retention_until TEXT NOT NULL,
    gdpr_compliant INTEGER NOT NULL DEFAULT 1,
    data_minimization_applied INTEGER NOT NULL DEFAULT 1,
    purpose_limitation_respected INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ai_act_operation_timestamp
  ON ai_act_logs(operation, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_act_timestamp
  ON ai_act_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_act_retention
  ON ai_act_logs(retention_until);
