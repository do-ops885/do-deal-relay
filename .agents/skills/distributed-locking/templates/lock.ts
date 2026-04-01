/**
 * Distributed Lock Template
 *
 * Implements distributed coordination with TTL support.
 * Prevents race conditions across multiple workers.
 */

export interface LockConfig {
  backend: "kv" | "do" | "memory";
  kv?: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ): Promise<void>;
    delete(key: string): Promise<void>;
  };
  ttl: number;
  autoRenew?: boolean;
  renewalInterval?: number;
  retry?: {
    attempts: number;
    delay: number;
  };
}

export interface LockInfo {
  owner: string;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

export interface LockHandle {
  key: string;
  release: () => Promise<void>;
  renew: (ttl?: number) => Promise<void>;
}

export class DistributedLock {
  private config: LockConfig;
  private owner: string;
  private renewTimer?: number;

  constructor(config: LockConfig) {
    this.config = config;
    this.owner = crypto.randomUUID();
  }

  async acquire<T>(
    key: string,
    options: { timeout?: number; ttl?: number } = {},
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const lock = await this.tryAcquire(key, options);
    if (!lock) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(key);
    }
  }

  async tryAcquire(
    key: string,
    options: { timeout?: number; ttl?: number } = {},
  ): Promise<boolean> {
    const ttl = options.ttl || this.config.ttl;
    const lockKey = `lock:${key}`;
    const lockInfo: LockInfo = {
      owner: this.owner,
      expiresAt: Date.now() + ttl,
    };

    if (this.config.backend === "kv" && this.config.kv) {
      const existing = await this.config.kv.get(lockKey);
      if (existing) {
        const parsed = JSON.parse(existing) as LockInfo;
        if (parsed.expiresAt > Date.now()) {
          return false;
        }
      }

      await this.config.kv.put(lockKey, JSON.stringify(lockInfo), {
        expirationTtl: ttl / 1000,
      });

      if (this.config.autoRenew) {
        this.scheduleRenewal(key, ttl);
      }
      return true;
    }

    return true;
  }

  async release(key: string): Promise<void> {
    const lockKey = `lock:${key}`;

    if (this.config.backend === "kv" && this.config.kv) {
      const existing = await this.config.kv.get(lockKey);
      if (existing) {
        const parsed = JSON.parse(existing) as LockInfo;
        if (parsed.owner === this.owner) {
          await this.config.kv.delete(lockKey);
        }
      }
    }

    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
    }
  }

  async renew(key: string, ttl?: number): Promise<void> {
    const lockKey = `lock:${key}`;
    const newTtl = ttl || this.config.ttl;

    if (this.config.backend === "kv" && this.config.kv) {
      const existing = await this.config.kv.get(lockKey);
      if (existing) {
        const parsed = JSON.parse(existing) as LockInfo;
        if (parsed.owner === this.owner) {
          parsed.expiresAt = Date.now() + newTtl;
          await this.config.kv.put(lockKey, JSON.stringify(parsed), {
            expirationTtl: newTtl / 1000,
          });
        }
      }
    }
  }

  private scheduleRenewal(key: string, ttl: number): void {
    const interval = this.config.renewalInterval || ttl / 2;
    this.renewTimer = setTimeout(() => {
      this.renew(key, ttl);
      this.scheduleRenewal(key, ttl);
    }, interval) as unknown as number;
  }
}

// Leader Election Helper
export async function electLeader(
  lock: DistributedLock,
  role: string,
  onLeadership: () => Promise<void>,
  onStepDown: () => Promise<void>,
): Promise<void> {
  const acquired = await lock.tryAcquire(`leader:${role}`, { ttl: 60000 });
  if (acquired) {
    await onLeadership();
  } else {
    await onStepDown();
  }
}

// Semaphore for limiting concurrency
export class Semaphore {
  private lock: DistributedLock;
  private max: number;

  constructor(lock: DistributedLock, maxConcurrency: number) {
    this.lock = lock;
    this.max = maxConcurrency;
  }

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const current = await this.getCurrentCount(key);
    if (current >= this.max) {
      throw new Error("Semaphore limit reached");
    }

    await this.increment(key);
    try {
      return await fn();
    } finally {
      await this.decrement(key);
    }
  }

  private async getCurrentCount(key: string): Promise<number> {
    return 0; // Implement with storage backend
  }

  private async increment(key: string): Promise<void> {
    // Implement with storage backend
  }

  private async decrement(key: string): Promise<void> {
    // Implement with storage backend
  }
}
