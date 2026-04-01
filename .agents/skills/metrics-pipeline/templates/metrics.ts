/**
 * Metrics Pipeline Template
 *
 * Prometheus-compatible metrics collection and export.
 */

export interface MetricsConfig {
  prefix: string;
  labels: Record<string, string>;
  defaultBuckets?: number[];
}

export interface MetricValue {
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

export abstract class Metric {
  protected name: string;
  protected help: string;
  protected labels: string[];
  protected values: Map<string, MetricValue> = new Map();

  constructor(name: string, help: string, labels: string[] = []) {
    this.name = name;
    this.help = help;
    this.labels = labels;
  }

  protected getKey(labelValues: Record<string, string>): string {
    return this.labels.map((l) => `${l}=${labelValues[l] || ""}`).join(",");
  }

  abstract getType(): string;
  abstract export(): string;
}

export class Counter extends Metric {
  getType(): string {
    return "counter";
  }

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.getKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels, value, timestamp: Date.now() });
    }
  }

  export(): string {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} counter\n`;
    for (const [key, val] of this.values) {
      const labelStr = Object.entries(val.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      output += `${this.name}{${labelStr}} ${val.value}\n`;
    }
    return output;
  }
}

export class Gauge extends Metric {
  getType(): string {
    return "gauge";
  }

  set(labels: Record<string, string>, value: number): void {
    this.values.set(this.getKey(labels), {
      labels,
      value,
      timestamp: Date.now(),
    });
  }

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.getKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels, value, timestamp: Date.now() });
    }
  }

  dec(labels: Record<string, string> = {}, value = 1): void {
    this.inc(labels, -value);
  }

  export(): string {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} gauge\n`;
    for (const [key, val] of this.values) {
      const labelStr = Object.entries(val.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      output += `${this.name}{${labelStr}} ${val.value}\n`;
    }
    return output;
  }
}

export class Histogram extends Metric {
  private buckets: number[];
  private bucketCounts: Map<string, Map<number, number>> = new Map();
  private sums: Map<string, number> = new Map();
  private counts: Map<string, number> = new Map();

  constructor(
    name: string,
    help: string,
    labels: string[] = [],
    buckets: number[] = [0.1, 0.5, 1, 2, 5, 10],
  ) {
    super(name, help, labels);
    this.buckets = buckets;
  }

  getType(): string {
    return "histogram";
  }

  observe(labels: Record<string, string>, value: number): void {
    const key = this.getKey(labels);

    // Update bucket counts
    let bucketMap = this.bucketCounts.get(key);
    if (!bucketMap) {
      bucketMap = new Map();
      this.bucketCounts.set(key, bucketMap);
    }

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1);
      }
    }

    // Update sum and count
    this.sums.set(key, (this.sums.get(key) || 0) + value);
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
  }

  export(): string {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} histogram\n`;

    for (const [key, bucketMap] of this.bucketCounts) {
      for (const bucket of this.buckets) {
        const count = bucketMap.get(bucket) || 0;
        output += `${this.name}_bucket{le="${bucket}"} ${count}\n`;
      }
      output += `${this.name}_bucket{le="+Inf"} ${this.counts.get(key) || 0}\n`;
      output += `${this.name}_sum ${this.sums.get(key) || 0}\n`;
      output += `${this.name}_count ${this.counts.get(key) || 0}\n`;
    }

    return output;
  }
}

export class MetricsPipeline {
  private config: MetricsConfig;
  private metrics: Map<string, Metric> = new Map();

  constructor(config: MetricsConfig) {
    this.config = config;
  }

  counter(name: string, help: string, labels: string[] = []): Counter {
    const fullName = `${this.config.prefix}_${name}`;
    const counter = new Counter(fullName, help, labels);
    this.metrics.set(fullName, counter);
    return counter;
  }

  gauge(name: string, help: string, labels: string[] = []): Gauge {
    const fullName = `${this.config.prefix}_${name}`;
    const gauge = new Gauge(fullName, help, labels);
    this.metrics.set(fullName, gauge);
    return gauge;
  }

  histogram(
    name: string,
    help: string,
    labels: string[] = [],
    buckets?: number[],
  ): Histogram {
    const fullName = `${this.config.prefix}_${name}`;
    const histogram = new Histogram(fullName, help, labels, buckets);
    this.metrics.set(fullName, histogram);
    return histogram;
  }

  export(): string {
    return Array.from(this.metrics.values())
      .map((m) => m.export())
      .join("\n");
  }

  async push(gatewayUrl: string, options: { job: string }): Promise<void> {
    const payload = this.export();
    await fetch(`${gatewayUrl}/metrics/job/${options.job}`, {
      method: "POST",
      body: payload,
    });
  }
}

// Middleware for automatic HTTP metrics
export function createMetricsMiddleware(metrics: MetricsPipeline) {
  const requestDuration = metrics.histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "route", "status"],
  );
  const requestCount = metrics.counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "route", "status"],
  );

  return async (
    request: Request,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const start = Date.now();
    const method = request.method;
    const url = new URL(request.url);
    const route = url.pathname;

    const response = await next();

    const duration = (Date.now() - start) / 1000;
    const status = String(response.status);

    requestDuration.observe({ method, route, status }, duration);
    requestCount.inc({ method, route, status });

    return response;
  };
}
