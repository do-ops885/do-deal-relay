-- ============================================================================
-- D1 Database Schema for do-deal-relay
-- EU AI Act Compliance Logging + Advanced Queries
-- ============================================================================

-- ============================================================================
-- EU AI Act Compliance Logging (Article 12)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_act_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  system_id TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  correlation_id TEXT,
  operation TEXT NOT NULL,
  operation_version TEXT NOT NULL,
  
  -- Input data (Article 12.3)
  input_source TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  input_description TEXT NOT NULL,
  input_reference_db TEXT,
  input_match TEXT,
  input_metadata TEXT, -- JSON
  
  -- Output data
  output_result TEXT NOT NULL,
  output_confidence REAL,
  output_explanation TEXT,
  output_decision_basis TEXT,
  
  -- Human oversight (Article 14)
  reviewer_id TEXT,
  reviewer_role TEXT,
  oversight_decision TEXT CHECK(oversight_decision IN ('approved', 'rejected', 'modified', 'overridden')),
  oversight_timestamp TEXT,
  oversight_notes TEXT,
  
  -- Risk and monitoring
  risk_flags TEXT, -- JSON array
  anomalies TEXT, -- JSON array
  performance_metrics TEXT, -- JSON
  
  -- Compliance metadata
  retention_until TEXT NOT NULL,
  gdpr_compliant INTEGER DEFAULT 1,
  data_minimization_applied INTEGER DEFAULT 1,
  purpose_limitation_respected INTEGER DEFAULT 1,
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for EU AI Act queries
CREATE INDEX IF NOT EXISTS idx_ai_logs_timestamp ON ai_act_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_logs_system ON ai_act_logs(system_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_operation ON ai_act_logs(operation);
CREATE INDEX IF NOT EXISTS idx_ai_logs_retention ON ai_act_logs(retention_until);

-- ============================================================================
-- Referrals Table (D1 for advanced queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT CHECK(status IN ('active', 'inactive', 'quarantined', 'expired')) DEFAULT 'quarantined',
  
  -- Metadata
  title TEXT,
  description TEXT,
  reward_type TEXT,
  reward_value TEXT,
  currency TEXT DEFAULT 'USD',
  category TEXT, -- JSON array
  tags TEXT, -- JSON array
  requirements TEXT, -- JSON array
  
  -- Timestamps
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  submitted_by TEXT,
  expires_at TEXT,
  activated_at TEXT,
  deactivated_at TEXT,
  deactivated_reason TEXT,
  
  -- Trust & Quality
  confidence_score REAL DEFAULT 0.5,
  verification_count INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  
  -- EU AI Act tracking
  ai_operation_id TEXT,
  FOREIGN KEY (ai_operation_id) REFERENCES ai_act_logs(operation_id)
);

-- Indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_referrals_domain ON referrals(domain);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_submitted ON referrals(submitted_at);
CREATE INDEX IF NOT EXISTS idx_referrals_expires ON referrals(expires_at);

-- Full-text search index (SQLite FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS referrals_fts USING fts5(
  code,
  title,
  description,
  domain,
  content='referrals',
  content_rowid='id'
);

-- ============================================================================
-- API Keys Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'user', 'readonly')) DEFAULT 'user',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  last_used_at TEXT,
  is_active INTEGER DEFAULT 1,
  rate_limit_requests_per_minute INTEGER DEFAULT 60,
  rate_limit_requests_per_hour INTEGER DEFAULT 1000,
  metadata TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ============================================================================
-- Audit Log (for all system actions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_type TEXT CHECK(actor_type IN ('user', 'api_key', 'system', 'ai_agent')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT, -- JSON
  ip_address TEXT,
  user_agent TEXT,
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);

-- ============================================================================
-- Research Results Cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  domain TEXT,
  source_type TEXT, -- producthunt, github, hackernews, reddit
  results TEXT NOT NULL, -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_research_query ON research_cache(query);
CREATE INDEX IF NOT EXISTS idx_research_domain ON research_cache(domain);
CREATE INDEX IF NOT EXISTS idx_research_expires ON research_cache(expires_at);

-- ============================================================================
-- System Metrics (for health monitoring)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metric_type TEXT CHECK(metric_type IN ('gauge', 'counter', 'histogram')),
  labels TEXT, -- JSON
  
  -- Pipeline specific
  run_id TEXT,
  phase TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_run ON system_metrics(run_id);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Active referrals with full URLs
CREATE VIEW IF NOT EXISTS v_active_referrals AS
SELECT 
  id,
  code,
  url,
  domain,
  title,
  description,
  reward_type,
  reward_value,
  currency,
  confidence_score,
  use_count,
  submitted_at
FROM referrals
WHERE status = 'active'
ORDER BY confidence_score DESC, use_count DESC;

-- Referrals expiring soon (next 30 days)
CREATE VIEW IF NOT EXISTS v_expiring_referrals AS
SELECT 
  id,
  code,
  url,
  domain,
  expires_at,
  julianday(expires_at) - julianday('now') as days_remaining
FROM referrals
WHERE expires_at IS NOT NULL 
  AND status = 'active'
  AND julianday(expires_at) - julianday('now') <= 30
ORDER BY expires_at;

-- EU AI Act compliance summary
CREATE VIEW IF NOT EXISTS v_compliance_summary AS
SELECT 
  date(timestamp) as date,
  operation,
  COUNT(*) as operation_count,
  COUNT(DISTINCT reviewer_id) as unique_reviewers,
  SUM(CASE WHEN oversight_decision IS NOT NULL THEN 1 ELSE 0 END) as human_oversight_count,
  SUM(CASE WHEN risk_flags IS NOT NULL THEN 1 ELSE 0 END) as risk_flagged_count
FROM ai_act_logs
GROUP BY date(timestamp), operation
ORDER BY date DESC;

-- API key usage statistics
CREATE VIEW IF NOT EXISTS v_api_key_usage AS
SELECT 
  ak.user_id,
  ak.role,
  COUNT(al.id) as action_count,
  MAX(al.timestamp) as last_action
FROM api_keys ak
LEFT JOIN audit_log al ON al.actor_id = ak.user_id AND al.actor_type = 'api_key'
WHERE ak.is_active = 1
GROUP BY ak.user_id, ak.role;
