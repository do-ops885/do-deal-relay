import type { Migration } from "./types";

/**
 * Migration 14: alert deliveries idempotency guard + AI Act logs.
 * v13 created alert_subscriptions only; the queue consumer needs the
 * alert_deliveries unique guard and matcher.ts already calls
 * EUAIActLogger which requires ai_act_logs. Also adds the updated_at
 * trigger v13 omitted. Mirrors migrations/0008_alert_deliveries_aiact.sql.
 */
export const MIGRATIONS_PART_8: Migration[] = [
  {
    version: 14,
    name: "add_alert_deliveries_aiact",
    up: `
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
    `,
    down: `
      DROP INDEX IF EXISTS idx_ai_act_retention;
      DROP INDEX IF EXISTS idx_ai_act_timestamp;
      DROP INDEX IF EXISTS idx_ai_act_operation_timestamp;
      DROP TABLE IF EXISTS ai_act_logs;
      DROP TRIGGER IF EXISTS alert_subscriptions_updated_at;
      DROP INDEX IF EXISTS idx_alert_deliveries_subscription;
      DROP TABLE IF EXISTS alert_deliveries;
    `,
  },
];
