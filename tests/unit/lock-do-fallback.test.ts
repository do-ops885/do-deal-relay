import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  acquireLock,
  releaseLock,
  extendLock,
  getLockStatus,
} from "../../worker/lib/lock";
import type { Env } from "../../worker/types";
import { PipelineError } from "../../worker/types";
import { createMockD1, seedMockLock, type LockRow } from "../fixtures/d1-mock";

// ============================================================================
// Lock adapter — PipelineLock DO primary with automatic D1 CAS fallback.
//
// The adapter resolves env.PIPELINE_LOCK.idFromName("pipeline") and prefers
// its RPC methods. D1 CAS must run only when the binding is absent, an RPC
// rejects, or an RPC exceeds the 1000ms timeout guard — never on contention.
// ============================================================================

/** Timeout guard configured in worker/lib/lock.ts (mirrored for assertions). */
const DO_RPC_TIMEOUT_MS = 1000;
/** Small advance beyond the guard so the timer fires deterministically. */
const TIMEOUT_ADVANCE_BUFFER_MS = 1;
/** Default TTL used by the mock DO when none is supplied. */
const MOCK_DO_DEFAULT_TTL_SECONDS = 300;

interface MockDoLockState {
  run_id: string;
  trace_id: string;
  acquired_at: number;
  expires_at: number;
}

interface MockDoStore {
  lock: MockDoLockState | null;
}

function createMockDoStore(): MockDoStore {
  return { lock: null };
}

/**
 * In-memory replica of the PipelineLock Durable Object RPC semantics:
 * atomic CAS acquire, owner-guarded extend/release, epoch-ms status.
 */
function createMockDoStub(store: MockDoStore) {
  return {
    acquireLock: vi.fn(
      async (
        run_id: string,
        trace_id: string,
        ttl: number = MOCK_DO_DEFAULT_TTL_SECONDS,
      ): Promise<boolean> => {
        const now = Date.now();
        if (!store.lock || store.lock.expires_at <= now) {
          store.lock = {
            run_id,
            trace_id,
            acquired_at: now,
            expires_at: now + ttl * 1000,
          };
          return true;
        }
        return false;
      },
    ),
    extendLock: vi.fn(
      async (
        trace_id: string,
        additional_seconds: number,
      ): Promise<boolean> => {
        const now = Date.now();
        if (
          !store.lock ||
          store.lock.trace_id !== trace_id ||
          store.lock.expires_at <= now
        ) {
          return false;
        }
        store.lock.expires_at = now + additional_seconds * 1000;
        return true;
      },
    ),
    releaseLock: vi.fn(async (trace_id: string): Promise<void> => {
      if (store.lock?.trace_id === trace_id) {
        store.lock = null;
      }
    }),
    getLockStatus: vi.fn(async () => {
      const now = Date.now();
      if (!store.lock || store.lock.expires_at <= now) {
        return { locked: false };
      }
      return {
        locked: true,
        run_id: store.lock.run_id,
        trace_id: store.lock.trace_id,
        acquired_at: store.lock.acquired_at,
        expires_at: store.lock.expires_at,
      };
    }),
  };
}

type MockDoStub = ReturnType<typeof createMockDoStub>;

function createMockDoNamespace(stub: MockDoStub): DurableObjectNamespace {
  return {
    idFromName: vi.fn((name: string) => ({ name })),
    get: vi.fn(() => stub),
  } as unknown as DurableObjectNamespace;
}

function createMockEnv(
  db: D1Database,
  doNamespace?: DurableObjectNamespace,
): Env {
  return {
    DEALS_PROD: {} as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    DEALS_LOCK: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    DEALS_DB: db,
    ...(doNamespace ? { PIPELINE_LOCK: doNamespace } : {}),
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;
}

describe("Lock adapter — PipelineLock DO primary, D1 CAS fallback", () => {
  let store: MockDoStore;
  let stub: MockDoStub;
  let storage: Map<string, LockRow>;
  let db: D1Database;
  let env: Env;

  beforeEach(() => {
    store = createMockDoStore();
    stub = createMockDoStub(store);
    storage = new Map();
    db = createMockD1(storage);
    env = createMockEnv(db, createMockDoNamespace(stub));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Happy path — DO serves every operation, D1 stays idle
  // ==========================================================================
  it("should acquire via the DO and never touch D1", async () => {
    const result = await acquireLock(env, "run-001", "trace-001");

    expect(result).toBe(true);
    expect(stub.acquireLock).toHaveBeenCalledTimes(1);
    expect(stub.acquireLock).toHaveBeenCalledWith("run-001", "trace-001", 300);
    expect(db.batch).not.toHaveBeenCalled();
    expect(store.lock?.trace_id).toBe("trace-001");
  });

  it("should resolve the singleton via idFromName('pipeline')", async () => {
    await acquireLock(env, "run-001", "trace-001");

    const namespace = env.PIPELINE_LOCK as unknown as {
      idFromName: ReturnType<typeof vi.fn>;
    };
    expect(namespace.idFromName).toHaveBeenCalledWith("pipeline");
  });

  it("should renew (extend) via the DO without a D1 round-trip", async () => {
    await acquireLock(env, "run-001", "trace-001");
    const expiryBeforeExtend = store.lock!.expires_at;

    await extendLock(env, "trace-001", 600);

    expect(stub.extendLock).toHaveBeenCalledWith("trace-001", 600);
    expect(db.batch).not.toHaveBeenCalled();
    expect(store.lock!.expires_at).toBeGreaterThan(expiryBeforeExtend);
  });

  it("should release via the DO and allow immediate re-acquire", async () => {
    await acquireLock(env, "run-001", "trace-001");

    await releaseLock(env, "trace-001");

    expect(stub.releaseLock).toHaveBeenCalledWith("trace-001");
    expect(db.batch).not.toHaveBeenCalled();
    expect(store.lock).toBeNull();

    const reacquired = await acquireLock(env, "run-002", "trace-002");
    expect(reacquired).toBe(true);
    expect(store.lock?.trace_id).toBe("trace-002");
  });

  it("should map DO epoch-milliseconds to ISO strings in status output", async () => {
    const expiresAt = Date.now() + 600_000;
    store.lock = {
      run_id: "run-do",
      trace_id: "trace-do",
      acquired_at: Date.now(),
      expires_at: expiresAt,
    };

    const status = await getLockStatus(env);

    expect(status).toEqual({
      locked: true,
      run_id: "run-do",
      trace_id: "trace-do",
      expires_at: new Date(expiresAt).toISOString(),
    });
    expect(db.batch).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Contention is definitive — no D1 fallback
  // ==========================================================================
  it("should throw ConcurrencyError on DO contention without D1 fallback", async () => {
    store.lock = {
      run_id: "run-holder",
      trace_id: "trace-holder",
      acquired_at: Date.now(),
      expires_at: Date.now() + 600_000,
    };

    try {
      await acquireLock(env, "run-new", "trace-new");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).retryable).toBe(false);
      expect((error as PipelineError).message).toContain("run run-holder");
    }
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("should reject non-owner extension definitively without D1 fallback", async () => {
    store.lock = {
      run_id: "run-owner",
      trace_id: "trace-owner",
      acquired_at: Date.now(),
      expires_at: Date.now() + 600_000,
    };

    try {
      await extendLock(env, "trace-intruder", 600);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).retryable).toBe(false);
      expect((error as PipelineError).message).toContain(
        "Cannot extend lock - not owned by current trace",
      );
    }
    expect(db.batch).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Fallback triggers — DO errors route to the proven D1 CAS path
  // ==========================================================================
  it("should fall back to D1 CAS when the DO acquire RPC rejects", async () => {
    stub.acquireLock.mockRejectedValueOnce(new Error("DO evacuated"));

    const result = await acquireLock(env, "run-001", "trace-001");

    expect(result).toBe(true);
    expect(stub.acquireLock).toHaveBeenCalledTimes(1);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(storage.get("pipeline:lock")?.trace_id).toBe("trace-001");
  });

  it("should fall back to D1 CAS when the DO release RPC rejects", async () => {
    await acquireLock(env, "run-001", "trace-001");
    stub.releaseLock.mockRejectedValueOnce(new Error("DO unreachable"));

    await expect(releaseLock(env, "trace-001")).resolves.toBeUndefined();

    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("should fall back to D1 CAS when the DO extend RPC rejects", async () => {
    await acquireLock(env, "run-001", "trace-001");
    // Seed a short remaining window so the extension result is deterministic.
    seedMockLock(storage, {
      run_id: "run-001",
      trace_id: "trace-001",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const d1ExpiryBefore = new Date(
      storage.get("pipeline:lock")!.expires_at,
    ).getTime();
    stub.extendLock.mockRejectedValueOnce(new Error("DO restart"));

    await extendLock(env, "trace-001", 600);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const d1ExpiryAfter = new Date(
      storage.get("pipeline:lock")!.expires_at,
    ).getTime();
    expect(d1ExpiryAfter).toBeGreaterThan(d1ExpiryBefore);
  });

  it("should fall back to D1 status when the DO status RPC rejects", async () => {
    stub.getLockStatus.mockRejectedValueOnce(new Error("DO read failure"));
    seedMockLock(storage);

    const status = await getLockStatus(env);

    expect(status.locked).toBe(true);
    expect(status.trace_id).toBe("pre-existing-trace");
    expect(status.expires_at).toBeDefined();
  });

  // ==========================================================================
  // Timeout guard — hung DO RPCs convert into D1 fallbacks
  // ==========================================================================
  it("should fall back to D1 CAS when the DO RPC hangs past the timeout guard", async () => {
    vi.useFakeTimers();
    try {
      stub.acquireLock.mockImplementation(
        () => new Promise<boolean>(() => undefined),
      );

      const pending = acquireLock(env, "run-hang", "trace-hang");
      await vi.advanceTimersByTimeAsync(
        DO_RPC_TIMEOUT_MS + TIMEOUT_ADVANCE_BUFFER_MS,
      );

      await expect(pending).resolves.toBe(true);
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(storage.get("pipeline:lock")?.trace_id).toBe("trace-hang");
    } finally {
      vi.useRealTimers();
    }
  });

  // ==========================================================================
  // Missing binding — pure D1 CAS (the pre-ADR-022 behavior)
  // ==========================================================================
  it("should use D1 CAS directly when the PIPELINE_LOCK binding is absent", async () => {
    const envWithoutDo = createMockEnv(db);

    const result = await acquireLock(envWithoutDo, "run-001", "trace-001");

    expect(result).toBe(true);
    expect(storage.get("pipeline:lock")?.trace_id).toBe("trace-001");
  });
});
