/**
 * Metrics - Prometheus-compatible metrics collection
 */

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, MetricValue> = new Map();
  private histograms: Map<string, number[]> = new Map();

  counter(
    name: string,
    value: number = 1,
    labels?: Record<string, string>,
  ): void {
    const key = this.getKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, { value, timestamp: Date.now(), labels });
  }

  histogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const key = this.getKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  exportPrometheus(): string {
    let output = "";

    // Counters
    for (const [key, value] of this.counters) {
      output += `# TYPE ${key.split("{")[0]} counter\n`;
      output += `${key} ${value}\n`;
    }

    // Gauges
    for (const [key, metric] of this.gauges) {
      output += `# TYPE ${key.split("{")[0]} gauge\n`;
      output += `${key} ${metric.value}\n`;
    }

    return output;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

export const metrics = new MetricsCollector();
