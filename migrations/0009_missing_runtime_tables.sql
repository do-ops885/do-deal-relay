-- Migration 0009: missing runtime tables (mirrors runtime v15).
-- Runtime source of truth: worker/lib/d1/migrations/schema-part-9.ts.
-- Raw SQL tree is a mirror for operators; runtime MIGRATIONS array is canonical.

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_hash TEXT NOT NULL,
    generated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    run_id TEXT,
    deal_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_generated ON snapshots(generated_at DESC);

CREATE TABLE IF NOT EXISTS system_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_type TEXT NOT NULL DEFAULT 'counter',
    labels TEXT,
    run_id TEXT,
    phase TEXT,
    duration_ms REAL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_ts ON system_metrics(metric_name, timestamp DESC);

CREATE TABLE IF NOT EXISTS validation_index (
    fingerprint TEXT PRIMARY KEY,
    normalized_url TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    trust_score REAL,
    source TEXT,
    trace_id TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_validation_index_status ON validation_index(status);

CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL COLLATE NOCASE,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT,
    submitted_at TEXT,
    submitted_by TEXT,
    expires_at TEXT,
    description TEXT,
    metadata TEXT,
    validation TEXT
);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_referrals_domain ON referrals(domain);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
