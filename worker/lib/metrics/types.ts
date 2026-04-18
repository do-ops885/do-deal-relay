import type { PipelineMetrics } from "../../types";

export interface MetricsData {
  pipeline: PipelineMetrics;
  lastRun: {
    run_id: string;
    timestamp: string;
    duration_ms: number;
    deals_count: number;
    status: "success" | "failure";
    error?: string;
  };
  system: {
    memory_usage: number;
    uptime: number;
    worker_version: string;
  };
}

export interface MetricSnapshot {
  timestamp: string;
  value: number;
  metadata?: Record<string, unknown>;
}
