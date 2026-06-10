// ============================================================================
// Health & Metrics Types
// ============================================================================

export interface DashboardStats {
  stats: {
    total: number;
    active: number;
    quarantined: number;
    rejected: number;
  };
  recentActivity: {
    runs: number;
    dealsFound: number;
    errors: number;
  };
  systemHealth: {
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, boolean>;
  };
  timestamp: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  uptime_seconds?: number;
  checks: {
    kv_connection: boolean;
    last_run_success: boolean;
    snapshot_valid: boolean;
    d1_connected?: boolean;
  };
  components?: {
    kv_stores: {
      deals_prod: boolean;
      deals_staging: boolean;
      deals_log: boolean;
      deals_lock: boolean;
      deals_sources: boolean;
    };
    d1_database?: {
      connected: boolean;
      latency_ms: number;
      error?: string;
    };
    pipeline: {
      last_run: string;
      last_success: boolean;
      average_duration_ms: number;
    };
    external_services: {
      github_api: boolean;
    };
  };
  metrics?: {
    total_runs_24h: number;
    success_rate_24h: number;
    avg_deals_per_run: number;
  };
  last_run?: {
    run_id: string;
    timestamp: string;
    duration_ms: number;
    deals_count: number;
  };
}

export interface Metrics {
  deals_runs_total: number;
  deals_publish_success_total: number;
  deals_candidate_deals_total: number;
  deals_valid_deals_total: number;
  deals_duplicate_deals_total: number;
  deals_notification_total: number;
  deals_fetch_latency_ms: number;
  deals_validator_failures_total: number;
}

// ============================================================================
// GOAP World State
// ============================================================================

export interface WorldState {
  repo_created: boolean;
  discovery_files_live: boolean;
  mcp_server_deployed: boolean;
  a2a_card_live: boolean;
  deals_seeded: boolean;
  research_loop_active: boolean;
  notification_active: boolean;
  registries_published: boolean;
}

export type WorldStateKey = keyof WorldState;

export interface GOAPAction {
  name: string;
  preconditions: Partial<WorldState>;
  effects: Partial<WorldState>;
  cost: number;
}
