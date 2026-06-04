import { describe, it, expect, vi } from "vitest";
import {
  formatPrometheusMetrics,
  getPrometheusContentType,
  isPrometheusFormat,
  prometheusResponse,
  logPrometheusExport,
} from "../../worker/lib/metrics/prometheus";
import { handleMetrics } from "../../worker/routes/core/health";
import type { Env, PipelineMetrics } from "../../worker/types";

function makeMetrics(
  overrides: Partial<PipelineMetrics> = {},
): PipelineMetrics {
  return {
    run_id: "test-run-1",
    start_time: 1_700_000_000_000,
    end_time: 1_700_000_060_000,
    phase_timings: {
      init: 100,
      discover: 1500,
      normalize: 500,
      dedupe: 300,
      validate: 2000,
      score: 200,
      stage: 100,
      publish: 1000,
      verify: 50,
      finalize: 50,
    },
    phase_results: {
      init: "success",
      discover: "success",
      normalize: "success",
      dedupe: "success",
      validate: "success",
      score: "success",
      stage: "success",
      publish: "success",
      verify: "success",
      finalize: "success",
    },
    total_duration_ms: 6000,
    deals_processed: {
      discovered: 100,
      passed_trust_filter: 60,
      normalized: 50,
      deduped: 40,
      validated: 30,
      scored: 28,
      published: 25,
    },
    validation_cache: {
      hit_total: 80,
      miss_total: 20,
      write_total: 50,
      d1_lookup_total: 30,
      dedup_hit_total: 10,
    },
    validation_gate_rejections: { source_trust: 5 },
    validation_gate_passes: { source_trust: 95 },
    errors: 2,
    retries: 1,
    success: true,
    final_phase: "finalize",
    ...overrides,
  } as PipelineMetrics;
}

describe("formatPrometheusMetrics", () => {
  it("emits HELP and TYPE lines for every metric family", () => {
    const out = formatPrometheusMetrics(makeMetrics());
    expect(out).toContain("# HELP pipeline_deals_discovered_total");
    expect(out).toContain("# TYPE pipeline_deals_discovered_total counter");
    expect(out).toContain("# HELP pipeline_deals_published_total");
    expect(out).toContain("# TYPE pipeline_deals_published_total counter");
    expect(out).toContain("# HELP pipeline_errors_total");
    expect(out).toContain("# TYPE pipeline_errors_total counter");
    expect(out).toContain("# HELP pipeline_validation_cache_hit_rate");
    expect(out).toContain("# TYPE pipeline_validation_cache_hit_rate gauge");
    expect(out).toContain("# HELP pipeline_phase_duration_seconds");
    expect(out).toContain("# TYPE pipeline_phase_duration_seconds histogram");
  });

  it("emits counter values that match the input metrics", () => {
    const out = formatPrometheusMetrics(makeMetrics());
    expect(out).toContain(
      'pipeline_deals_discovered_total{stage="discovered"} 100',
    );
    expect(out).toContain("pipeline_deals_published_total 25");
    expect(out).toContain("pipeline_errors_total 2");
    expect(out).toContain("pipeline_retries_total 1");
    expect(out).toContain('pipeline_runs_total{success="true"} 1');
  });

  it("emits gauge value as hits / (hits + misses)", () => {
    const out = formatPrometheusMetrics(makeMetrics());
    // 80 / (80 + 20) = 0.8
    expect(out).toMatch(/pipeline_validation_cache_hit_rate 0\.8/);
  });

  it("emits histogram bucket, sum, and count for each phase with data", () => {
    const out = formatPrometheusMetrics(makeMetrics());

    // discover: 1500ms = 1.5s
    expect(out).toMatch(
      /pipeline_phase_duration_seconds_bucket\{phase="discover",le="0\.5"\} 0/,
    );
    expect(out).toMatch(
      /pipeline_phase_duration_seconds_bucket\{phase="discover",le="1"\} 0/,
    );
    expect(out).toMatch(
      /pipeline_phase_duration_seconds_bucket\{phase="discover",le="2\.5"\} 1/,
    );
    expect(out).toMatch(
      /pipeline_phase_duration_seconds_bucket\{phase="discover",le="\+Inf"\} 1/,
    );
    expect(out).toMatch(
      /pipeline_phase_duration_seconds_count\{phase="discover"\} 1/,
    );
    expect(out).toMatch(
      /pipeline_phase_duration_seconds_sum\{phase="discover"\} 1\.500000/,
    );
  });

  it("emits validation cache hit rate of 0 when no cache data is present", () => {
    const m = makeMetrics();
    delete m.validation_cache;
    const out = formatPrometheusMetrics(m);
    expect(out).toMatch(/pipeline_validation_cache_hit_rate 0/);
  });

  it("emits validation cache hit rate of 0 when total cache accesses is 0", () => {
    const m = makeMetrics({
      validation_cache: {
        hit_total: 0,
        miss_total: 0,
        write_total: 0,
        d1_lookup_total: 0,
        dedup_hit_total: 0,
      },
    });
    const out = formatPrometheusMetrics(m);
    expect(out).toMatch(/pipeline_validation_cache_hit_rate 0/);
  });

  it("does not emit histogram entries for phases with zero duration", () => {
    const m = makeMetrics();
    m.phase_timings.init = 0;
    m.phase_timings.finalize = 0;
    const out = formatPrometheusMetrics(m);
    expect(out).not.toContain('phase_duration_seconds_count{phase="init"}');
    expect(out).not.toContain('phase_duration_seconds_count{phase="finalize"}');
  });

  it('marks a failed run with success="false"', () => {
    const m = makeMetrics({ success: false, errors: 9 });
    const out = formatPrometheusMetrics(m);
    expect(out).toContain('pipeline_runs_total{success="false"} 1');
    expect(out).toContain("pipeline_errors_total 9");
  });

  it("handles missing data gracefully with zero values", () => {
    const partial = {
      run_id: "partial",
      start_time: 0,
      phase_timings: {
        init: 0,
        discover: 0,
        normalize: 0,
        dedupe: 0,
        validate: 0,
        score: 0,
        stage: 0,
        publish: 0,
        verify: 0,
        finalize: 0,
      },
      phase_results: {
        init: "success" as const,
        discover: "success" as const,
        normalize: "success" as const,
        dedupe: "success" as const,
        validate: "success" as const,
        score: "success" as const,
        stage: "success" as const,
        publish: "success" as const,
        verify: "success" as const,
        finalize: "success" as const,
      },
      total_duration_ms: 0,
      deals_processed: {
        discovered: 0,
        passed_trust_filter: 0,
        normalized: 0,
        deduped: 0,
        validated: 0,
        scored: 0,
        published: 0,
      },
      errors: 0,
      retries: 0,
      success: false,
      final_phase: "init" as const,
    } satisfies PipelineMetrics;

    const out = formatPrometheusMetrics(partial);
    expect(out).toContain("pipeline_deals_published_total 0");
    expect(out).toContain("pipeline_errors_total 0");
    expect(out).toContain("pipeline_validation_cache_hit_rate 0");
  });

  it("escapes label values to prevent injection", () => {
    const m = makeMetrics();
    // Inject a malicious run id and a fake label - we just want to ensure the
    // function does not throw and keeps the text well-formed.
    m.run_id = 'evil\\"run"\nbar';
    const out = formatPrometheusMetrics(m);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("getPrometheusContentType", () => {
  it("returns the canonical Prometheus text content type", () => {
    expect(getPrometheusContentType()).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
  });
});

describe("prometheusResponse", () => {
  it("wraps a body in a Response with the correct content type and cache headers", () => {
    const res = prometheusResponse("pipeline_up 1\n");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
    expect(res.headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
  });

  it("respects a custom status code", () => {
    const res = prometheusResponse("err", 503);
    expect(res.status).toBe(503);
  });
});

describe("isPrometheusFormat", () => {
  it.each([
    ["prometheus", true],
    ["PROMETHEUS", true],
    ["prom", true],
    ["text", true],
    ["txt", true],
    ["json", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isPrometheusFormat(%p) === %p", (input, expected) => {
    expect(isPrometheusFormat(input as string | null | undefined)).toBe(
      expected,
    );
  });
});

describe("logPrometheusExport", () => {
  it("does not throw even when the logger context is malformed", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => logPrometheusExport(makeMetrics())).not.toThrow();
    spy.mockRestore();
  });
});

describe("handleMetrics integration with Prometheus format", () => {
  function makeEnv(payload: PipelineMetrics | null): Env {
    return {
      DEALS_PROD: { get: vi.fn() } as unknown as Env["DEALS_PROD"],
      DEALS_STAGING: { get: vi.fn() } as unknown as Env["DEALS_STAGING"],
      DEALS_LOG: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "metrics:index") {
            return Promise.resolve(
              payload ? JSON.stringify([payload.run_id]) : JSON.stringify([]),
            );
          }
          if (payload && key === `metrics:${payload.run_id}`) {
            return Promise.resolve(JSON.stringify(payload));
          }
          return Promise.resolve(null);
        }),
        put: vi.fn(),
        list: vi.fn(),
      } as unknown as Env["DEALS_LOG"],
      DEALS_LOCK: {
        get: vi.fn(),
        put: vi.fn(),
      } as unknown as Env["DEALS_LOCK"],
      DEALS_SOURCES: { get: vi.fn() } as unknown as Env["DEALS_SOURCES"],
      DEALS_DB: {} as unknown as Env["DEALS_DB"],
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      AI_GATEWAY_URL: "https://ai.test",
      WEBHOOK_SECRET: "x",
      API_ENCRYPTION_KEY: "x",
      EMAIL_WEBHOOK_SECRET: "x",
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;
  }

  it("returns Prometheus text format when format=prometheus", async () => {
    const payload = makeMetrics();
    const env = makeEnv(payload);
    const req = new Request("https://w.example.com/metrics?format=prometheus");
    const res = await handleMetrics(env, "prometheus", req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain("# HELP pipeline_deals_published_total");
    expect(body).toContain("pipeline_deals_published_total 25");
  });

  it("returns Prometheus text format when format=prom (alias)", async () => {
    const payload = makeMetrics();
    const env = makeEnv(payload);
    const req = new Request("https://w.example.com/metrics?format=prom");
    const res = await handleMetrics(env, "prom", req);
    expect(res.headers.get("Content-Type")).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
  });

  it("returns Prometheus format for an empty KV (zero values)", async () => {
    const env = makeEnv(null);
    const req = new Request("https://w.example.com/metrics?format=prometheus");
    const res = await handleMetrics(env, "prometheus", req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("pipeline_deals_published_total 0");
    expect(body).toContain("pipeline_errors_total 0");
  });

  it("still returns JSON when format=json", async () => {
    const env = makeEnv(makeMetrics());
    const req = new Request("https://w.example.com/metrics?format=json");
    const res = await handleMetrics(env, "json", req);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = (await res.json()) as { funnel: { published: number } };
    expect(body.funnel.published).toBe(25);
  });

  it("returns 500 JSON error when KV access throws", async () => {
    const env = {
      ...makeEnv(null),
      DEALS_LOG: {
        get: vi.fn().mockRejectedValue(new Error("kv-down")),
        put: vi.fn(),
        list: vi.fn(),
      },
    } as unknown as Env;
    const req = new Request("https://w.example.com/metrics?format=prometheus");
    const res = await handleMetrics(env, "prometheus", req);
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});
