/* tsqllint-disable set-quoted-identifier */
-- Alert subscriptions table for personalized deal alerts
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  saved_query_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('telegram', 'discord', 'email', 'webhook')),
  destination TEXT NOT NULL,
  threshold REAL NOT NULL DEFAULT 0.7 CHECK(threshold >= 0.0 AND threshold <= 1.0),
  frequency TEXT NOT NULL DEFAULT 'instant' CHECK(frequency IN ('instant', 'daily-digest')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (saved_query_id) REFERENCES nlq_saved_queries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_user
  ON alert_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_active_freq
  ON alert_subscriptions(active, frequency);
CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_query
  ON alert_subscriptions(saved_query_id);
