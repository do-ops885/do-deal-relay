import type { PipelineMetrics, PipelinePhase } from "../../types";
import { logger } from "../global-logger";

// ============================================================================
// Prometheus Text Format Exporter
// ============================================================================

const PIPELINE_PHASES: readonly PipelinePhase[] = [
  "init",
  "discover",
  "normalize",
  "dedupe",
  "validate",
  "score",
  "stage",
  "publish",
  "verify",
  "finalize",
];

// Default histogram buckets (seconds) - aligned with common SLO targets
const HISTOGRAM_BUCKETS_SECONDS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

interface PhaseHistogramSnapshot {
  count: number;
  sumSeconds: number;
  buckets: Record<string, number>;
}

function safeNumber(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function formatCounterLine(
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string>,
): string[] {
  const labelStr = labels
    ? "{" +
      Object.entries(labels)
        .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
        .join(",") +
      "}"
    : "";
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} counter`,
    `${name}${labelStr} ${safeNumber(value)}`,
  ];
}

function formatGaugeLine(
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string>,
): string[] {
  const labelStr = labels
    ? "{" +
      Object.entries(labels)
        .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
        .join(",") +
      "}"
    : "";
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} gauge`,
    `${name}${labelStr} ${safeNumber(value)}`,
  ];
}

function buildPhaseHistogram(
  timings: Record<PipelinePhase, number> | undefined,
): PhaseHistogramSnapshot {
  const snapshot: PhaseHistogramSnapshot = {
    count: 0,
    sumSeconds: 0,
    buckets: {},
  };

  for (const bucket of HISTOGRAM_BUCKETS_SECONDS) {
    snapshot.buckets[bucket.toString()] = 0;
  }
  // +Inf bucket
  snapshot.buckets["+Inf"] = 0;

  if (!timings) {
    return snapshot;
  }

  for (const phase of PIPELINE_PHASES) {
    const durationMs = safeNumber(timings[phase]);
    if (durationMs <= 0) continue;
    const durationSeconds = durationMs / 1000;
    snapshot.count += 1;
    snapshot.sumSeconds += durationSeconds;

    for (const bucket of HISTOGRAM_BUCKETS_SECONDS) {
      if (durationSeconds <= bucket) {
        const key = bucket.toString();
        snapshot.buckets[key] = (snapshot.buckets[key] ?? 0) + 1;
      }
    }
    snapshot.buckets["+Inf"] += 1;
  }

  return snapshot;
}

function formatHistogramLines(
  name: string,
  help: string,
  histogram: PhaseHistogramSnapshot,
  baseLabels: Record<string, string>,
): string[] {
  const lines: string[] = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} histogram`,
  ];

  const allBucketKeys = [
    ...HISTOGRAM_BUCKETS_SECONDS.map((b) => b.toString()),
    "+Inf",
  ];

  let cumulative = 0;
  for (const bucketKey of allBucketKeys) {
    cumulative = Math.max(cumulative, histogram.buckets[bucketKey] ?? 0);
    const labels = {
      ...baseLabels,
      le: bucketKey,
    };
    const labelStr =
      "{" +
      Object.entries(labels)
        .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
        .join(",") +
      "}";
    lines.push(`${name}_bucket${labelStr} ${cumulative}`);
  }

  const baseLabelStr =
    "{" +
    Object.entries(baseLabels)
      .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
      .join(",") +
    "}";
  lines.push(`${name}_sum${baseLabelStr} ${histogram.sumSeconds.toFixed(6)}`);
  lines.push(`${name}_count${baseLabelStr} ${histogram.count}`);

  return lines;
}

function computeCacheHitRate(metrics: PipelineMetrics): number {
  const cache = metrics.validation_cache;
  if (!cache) return 0;
  const hits = safeNumber(cache.hit_total);
  const misses = safeNumber(cache.miss_total);
  const total = hits + misses;
  if (total <= 0) return 0;
  return hits / total;
}

function getMetricOrEmpty(metrics: PipelineMetrics): PipelineMetrics {
  return metrics ?? ({} as PipelineMetrics);
}

/**
 * Format a single PipelineMetrics snapshot into Prometheus text format.
 *
 * Emits the following metric families:
 * - pipeline_deals_discovered_total (counter, labelled by stage)
 * - pipeline_deals_published_total (counter)
 * - pipeline_errors_total (counter)
 * - pipeline_validation_cache_hit_rate (gauge)
 * - pipeline_phase_duration_seconds (histogram, labelled by phase)
 * - pipeline_runs_total (counter, labelled by success)
 * - pipeline_run_duration_seconds (gauge)
 *
 * Missing data is emitted as 0 rather than skipped, so dashboards stay stable.
 */
export function formatPrometheusMetrics(metrics: PipelineMetrics): string {
  const m = getMetricOrEmpty(metrics);
  const lines: string[] = [];
  const deals = m.deals_processed;

  // --------------------------------------------------------------------------
  // Counters
  // --------------------------------------------------------------------------
  const dealStages: Array<{
    key: keyof PipelineMetrics["deals_processed"];
    label: string;
  }> = [
    { key: "discovered", label: "discovered" },
    { key: "passed_trust_filter", label: "passed_trust_filter" },
    { key: "normalized", label: "normalized" },
    { key: "deduped", label: "deduped" },
    { key: "validated", label: "validated" },
    { key: "scored", label: "scored" },
  ];

  lines.push(
    ...formatCounterLine(
      "pipeline_deals_discovered_total",
      "Total deals observed at each pipeline stage",
      safeNumber(deals?.discovered),
      { stage: "discovered" },
    ),
  );

  for (const stage of dealStages.slice(1)) {
    const value = safeNumber(deals?.[stage.key]);
    lines.push(
      `pipeline_deals_discovered_total{stage="${stage.label}"} ${value}`,
    );
  }

  lines.push(
    ...formatCounterLine(
      "pipeline_deals_published_total",
      "Total deals published to production",
      safeNumber(deals?.published),
    ),
  );

  lines.push(
    ...formatCounterLine(
      "pipeline_errors_total",
      "Total errors observed during the run",
      safeNumber(m.errors),
    ),
  );

  lines.push(
    ...formatCounterLine(
      "pipeline_retries_total",
      "Total retries triggered during the run",
      safeNumber(m.retries),
    ),
  );

  lines.push(
    ...formatCounterLine(
      "pipeline_runs_total",
      "Total pipeline runs observed",
      1,
      { success: m.success ? "true" : "false" },
    ),
  );

  // --------------------------------------------------------------------------
  // Gauges
  // --------------------------------------------------------------------------
  lines.push(
    ...formatGaugeLine(
      "pipeline_validation_cache_hit_rate",
      "Validation cache hit rate (hits / (hits + misses))",
      computeCacheHitRate(m),
    ),
  );

  lines.push(
    ...formatGaugeLine(
      "pipeline_run_duration_seconds",
      "Total wall-clock duration of the run in seconds",
      safeNumber(m.total_duration_ms) / 1000,
    ),
  );

  // --------------------------------------------------------------------------
  // Histogram: pipeline_phase_duration_seconds
  // --------------------------------------------------------------------------
  const histogram = buildPhaseHistogram(m.phase_timings);
  for (const phase of PIPELINE_PHASES) {
    const phaseHistogram = buildPhaseHistogram({
      [phase]: m.phase_timings?.[phase] ?? 0,
    } as Record<PipelinePhase, number>);

    if (phaseHistogram.count === 0) continue;

    lines.push(
      ...formatHistogramLines(
        "pipeline_phase_duration_seconds",
        "Duration of each pipeline phase in seconds",
        phaseHistogram,
        { phase },
      ),
    );
  }

  // Also emit a single combined histogram across all phases for convenience
  if (histogram.count > 0) {
    lines.push(
      ...formatHistogramLines(
        "pipeline_phase_duration_seconds",
        "Duration of each pipeline phase in seconds (combined)",
        histogram,
        { phase: "all" },
      ),
    );
  }

  return lines.join("\n") + "\n";
}

/**
 * Convenience utility to retrieve the proper Prometheus text format Content-Type header.
 *
 * @returns The standard Prometheus text content-type string.
 */
export function getPrometheusContentType(): string {
  return PROMETHEUS_CONTENT_TYPE;
}

/**
 * Creates and returns a structured Response containing the metrics body with the correct
 * Prometheus headers and Cache-Control directives.
 *
 * @param body - The formatted metrics string.
 * @param status - The HTTP status code of the response. Defaults to 200.
 * @returns A Cloudflare Workers Response object configured for Prometheus scraping.
 */
export function prometheusResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": PROMETHEUS_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

/**
 * Helper to determine if a requested format corresponds to a Prometheus metrics scraping request.
 * Matches string values like "prometheus", "prom", "text", or "txt".
 *
 * @param format - The incoming format query parameter.
 * @returns True if the format indicates a Prometheus scraping request, false otherwise.
 */
export function isPrometheusFormat(format: string | null | undefined): boolean {
  if (!format) return false;
  const f = format.toLowerCase();
  return f === "prometheus" || f === "prom" || f === "text" || f === "txt";
}

/**
 * Logs a debug entry indicating that a Prometheus export snapshot was compiled.
 *
 * @param metrics - The pipeline metrics being exported.
 */
export function logPrometheusExport(metrics: PipelineMetrics): void {
  try {
    logger.debug("Exported Prometheus metrics snapshot", {
      component: "metrics",
      run_id: metrics?.run_id,
      success: metrics?.success,
      deals_published: safeNumber(metrics?.deals_processed?.published),
    });
  } catch {
    // Logger must never throw
  }
}

/**
 * Prometheus text exporter constants exported for routing and external layers.
 */
export const PROMETHEUS_CONSTANTS = {
  /**
   * The standard text content-type including version descriptor for Prometheus scraping clients.
   */
  CONTENT_TYPE: PROMETHEUS_CONTENT_TYPE,
  /**
   * Default duration/latency bucket upper bounds (in seconds) used for phase performance profiling.
   */
  BUCKETS_SECONDS: HISTOGRAM_BUCKETS_SECONDS,
} as const;
