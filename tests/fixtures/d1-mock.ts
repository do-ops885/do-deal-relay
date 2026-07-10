/**
 * Shared D1 Database mock for pipeline lock operations.
 *
 * Provides an in-memory D1 mock that understands the SQL patterns
 * used by worker/lib/lock.ts (acquireLock, releaseLock, extendLock, getLockStatus).
 *
 * Usage:
 *   const storage = new Map<string, LockRow>();
 *   const db = createMockD1(storage);
 *   const env = createMockEnv({ DEALS_DB: db, ... });
 */

import { vi } from "vitest";

export interface LockRow {
  lock_name: string;
  run_id: string;
  trace_id: string;
  acquired_at: string;
  expires_at: string;
}

/** In-memory D1 mock with SQL routing for pipeline_locks operations. */
export function createMockD1(storage: Map<string, LockRow>) {
  const LOCK = "pipeline:lock";

  function stmt(sql: string, params: unknown[]) {
    return {
      first: vi.fn(async () => {
        const row = storage.get(LOCK);
        if (!row) return null;
        // getLockStatus: SELECT without acquired_at
        if (
          sql.includes("SELECT") &&
          sql.includes("run_id") &&
          sql.includes("trace_id") &&
          sql.includes("expires_at") &&
          !sql.includes("acquired_at")
        ) {
          return {
            run_id: row.run_id,
            trace_id: row.trace_id,
            expires_at: row.expires_at,
          };
        }
        // acquireLock batch: SELECT with acquired_at
        if (
          sql.includes("SELECT") &&
          sql.includes("run_id") &&
          sql.includes("trace_id") &&
          sql.includes("acquired_at")
        ) {
          return {
            run_id: row.run_id,
            trace_id: row.trace_id,
            acquired_at: row.acquired_at,
            expires_at: row.expires_at,
          };
        }
        // extendLock/releaseLock check
        if (sql.includes("SELECT") && sql.includes("trace_id")) {
          return { trace_id: row.trace_id, expires_at: row.expires_at };
        }
        return null;
      }),
      run: vi.fn(async () => {
        if (sql.includes("INSERT OR IGNORE")) {
          if (!storage.get(LOCK)) {
            storage.set(LOCK, {
              lock_name: LOCK,
              run_id: params[1] as string,
              trace_id: params[2] as string,
              acquired_at: params[3] as string,
              expires_at: params[4] as string,
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (sql.includes("UPDATE") && sql.includes("expires_at <")) {
          const existing = storage.get(LOCK);
          if (
            existing &&
            new Date(existing.expires_at) < new Date(params[5] as string)
          ) {
            storage.set(LOCK, {
              lock_name: LOCK,
              run_id: params[1] as string,
              trace_id: params[2] as string,
              acquired_at: params[3] as string,
              expires_at: params[4] as string,
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (sql.includes("UPDATE") && sql.includes("SET expires_at")) {
          const existing = storage.get(LOCK);
          if (existing && existing.trace_id === params[2]) {
            storage.set(LOCK, { ...existing, expires_at: params[1] as string });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (sql.includes("DELETE")) {
          const existing = storage.get(LOCK);
          if (existing && existing.trace_id === params[1]) storage.delete(LOCK);
          return { success: true, results: [], meta: { changes: 1 } };
        }
        if (sql.includes("SELECT")) {
          const row = storage.get(LOCK);
          if (!row) return { success: true, results: [], meta: {} };
          return {
            success: true,
            results: [
              {
                run_id: row.run_id,
                trace_id: row.trace_id,
                acquired_at: row.acquired_at,
                expires_at: row.expires_at,
              },
            ],
            meta: {},
          };
        }
        return { success: true, results: [], meta: { changes: 0 } };
      }),
    };
  }

  return {
    prepare: vi.fn((sql: string) => ({
      bind: (...p: unknown[]) => stmt(sql, p),
    })),
    batch: vi.fn(async (statements: unknown[]) => {
      const results = [];
      for (const s of statements)
        results.push(await (s as { run: () => Promise<unknown> }).run());
      return results;
    }),
  } as unknown as D1Database;
}

/**
 * Create a mock `fetch` that handles SSRF protection DNS lookups by
 * intercepting cloudflare-dns.com queries and returning a synthetic
 * public IP, while delegating all other requests to the supplied
 * `responseFor` callback.
 *
 * The `validatedFetch` wrapper in worker/lib/security.ts resolves
 * hostnames via DNS-over-HTTPS before the actual fetch.  Without this
 * shim, a simple `vi.fn().mockResolvedValue(…)` would let the DNS
 * request consume the payload meant for the real URL.
 */
export function createSSRFSafeMockFetch(
  responseFor: (
    url: string,
    init?: RequestInit,
  ) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url.url;
    // Intercept DNS-over-HTTPS queries
    if (urlStr.startsWith("https://cloudflare-dns.com/dns-query")) {
      const parsed = new URL(urlStr);
      const hostname = parsed.searchParams.get("name");
      const data = hostname ? [{ data: "1.2.3.4" }] : [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/dns-json" }),
        json: async () => ({ Answer: data, Status: 0 }),
        text: async () => JSON.stringify({ Answer: data, Status: 0 }),
      };
    }
    return responseFor(urlStr, init);
  });
}

/**
 * Seed a lock into D1 storage (simulates an existing active lock).
 * Useful for concurrency/contention tests.
 */
export function seedMockLock(
  storage: Map<string, LockRow>,
  overrides?: Partial<LockRow>,
) {
  const futureDate = new Date(Date.now() + 600000);
  storage.set("pipeline:lock", {
    lock_name: "pipeline:lock",
    run_id: "pre-existing-run",
    trace_id: "pre-existing-trace",
    acquired_at: new Date().toISOString(),
    expires_at: futureDate.toISOString(),
    ...overrides,
  });
}

/**
 * Seed an expired lock into D1 storage.
 */
export function seedExpiredMockLock(
  storage: Map<string, LockRow>,
  overrides?: Partial<LockRow>,
) {
  const pastDate = new Date(Date.now() - 600000);
  storage.set("pipeline:lock", {
    lock_name: "pipeline:lock",
    run_id: "expired-run",
    trace_id: "expired-trace",
    acquired_at: new Date(Date.now() - 1200000).toISOString(),
    expires_at: pastDate.toISOString(),
    ...overrides,
  });
}
