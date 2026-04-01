/**
 * Expiration Manager Template
 *
 * Time-based workflow management for scheduling and tracking.
 */

export interface ExpirationConfig {
  storage: "kv" | "do" | "memory" | StorageAdapter;
  notifyBefore?: number[]; // Milliseconds before expiration
  gracePeriod?: number;
  onNotify?: (
    id: string,
    notification: Notification,
    metadata: Record<string, unknown>,
  ) => void | Promise<void>;
  onExpire?: (
    id: string,
    metadata: Record<string, unknown>,
  ) => void | Promise<void>;
  maxRetries?: number;
  retryDelay?: number;
}

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
  }): Promise<{ keys: Array<{ name: string }> }>;
}

export interface ExpirationRecord {
  id: string;
  expiresAt: number;
  metadata: Record<string, unknown>;
  notified: number[]; // Which notifications have been sent
}

export interface Notification {
  before: number;
  expiresIn: number;
}

export class ExpirationManager {
  private config: ExpirationConfig;
  private storage: StorageAdapter;
  private timer?: number;

  constructor(config: ExpirationConfig) {
    this.config = config;
    if (typeof config.storage === "object") {
      this.storage = config.storage;
    } else {
      this.storage = this.createStorage(
        config.storage as "kv" | "do" | "memory",
      );
    }
    this.startProcessing();
  }

  private createStorage(type: "kv" | "do" | "memory"): StorageAdapter {
    if (type === "memory") {
      const store = new Map<string, string>();
      return {
        get: async (k) => store.get(k) || null,
        put: async (k, v) => {
          store.set(k, v);
        },
        delete: async (k) => {
          store.delete(k);
        },
        list: async () => ({
          keys: Array.from(store.keys()).map((k) => ({ name: k })),
        }),
      };
    }
    throw new Error(`Storage type ${type} requires configuration`);
  }

  async schedule(
    id: string,
    options: {
      expiresAt?: number;
      ttl?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const expiresAt =
      options.expiresAt || Date.now() + (options.ttl || 3600000);
    const record: ExpirationRecord = {
      id,
      expiresAt,
      metadata: options.metadata || {},
      notified: [],
    };

    await this.storage.put(`exp:${id}`, JSON.stringify(record), {
      expirationTtl: Math.ceil((expiresAt - Date.now()) / 1000) + 60,
    });
  }

  async extend(
    id: string,
    options: {
      ttl?: number;
      expiresAt?: number;
    },
  ): Promise<void> {
    const existing = await this.getRecord(id);
    if (!existing) throw new Error(`Expiration not found: ${id}`);

    const newExpiresAt =
      options.expiresAt || Date.now() + (options.ttl || 3600000);
    existing.expiresAt = newExpiresAt;

    await this.storage.put(`exp:${id}`, JSON.stringify(existing), {
      expirationTtl: Math.ceil((newExpiresAt - Date.now()) / 1000) + 60,
    });
  }

  async cancel(id: string): Promise<void> {
    await this.storage.delete(`exp:${id}`);
  }

  async getStatus(
    id: string,
  ): Promise<{
    expiresAt: number;
    remaining: number;
    notified: number[];
  } | null> {
    const record = await this.getRecord(id);
    if (!record) return null;

    return {
      expiresAt: record.expiresAt,
      remaining: record.expiresAt - Date.now(),
      notified: record.notified,
    };
  }

  async getExpiring(options: {
    before: number;
    limit?: number;
  }): Promise<ExpirationRecord[]> {
    const result: ExpirationRecord[] = [];
    const { keys } = await this.storage.list({ prefix: "exp:" });

    for (const key of keys.slice(0, options.limit || 100)) {
      const value = await this.storage.get(key.name);
      if (value) {
        const record = JSON.parse(value) as ExpirationRecord;
        if (record.expiresAt <= options.before) {
          result.push(record);
        }
      }
    }

    return result.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  private async getRecord(id: string): Promise<ExpirationRecord | null> {
    const value = await this.storage.get(`exp:${id}`);
    return value ? JSON.parse(value) : null;
  }

  private startProcessing(): void {
    // Process every minute
    const process = async () => {
      await this.processExpirations();
      this.timer = setTimeout(process, 60000) as unknown as number;
    };
    process();
  }

  private async processExpirations(): Promise<void> {
    const now = Date.now();
    const expiring = await this.getExpiring({ before: now + 60000 });

    for (const record of expiring) {
      // Check notifications
      if (this.config.notifyBefore) {
        for (const before of this.config.notifyBefore) {
          if (!record.notified.includes(before)) {
            const triggerTime = record.expiresAt - before;
            if (now >= triggerTime) {
              record.notified.push(before);
              await this.save(record);
              await this.config.onNotify?.(
                record.id,
                { before, expiresIn: record.expiresAt - now },
                record.metadata,
              );
            }
          }
        }
      }

      // Check expiration
      if (now >= record.expiresAt) {
        await this.handleExpiration(record);
      }
    }
  }

  private async handleExpiration(record: ExpirationRecord): Promise<void> {
    let retries = 0;
    const maxRetries = this.config.maxRetries || 3;

    while (retries < maxRetries) {
      try {
        await this.config.onExpire?.(record.id, record.metadata);
        await this.storage.delete(`exp:${record.id}`);
        return;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          console.error(
            `Failed to expire ${record.id} after ${maxRetries} retries`,
          );
          return;
        }
        await this.delay(this.config.retryDelay || 1000 * retries);
      }
    }
  }

  private async save(record: ExpirationRecord): Promise<void> {
    await this.storage.put(`exp:${record.id}`, JSON.stringify(record));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}

// Schedule recurring tasks
export class RecurringScheduler {
  private manager: ExpirationManager;
  private tasks: Map<string, { interval: number; fn: () => Promise<void> }> =
    new Map();

  constructor(manager: ExpirationManager) {
    this.manager = manager;
  }

  async schedule(
    id: string,
    options: { interval: number; fn: () => Promise<void> },
  ): Promise<void> {
    this.tasks.set(id, { interval: options.interval, fn: options.fn });
    await this.scheduleNext(id);
  }

  private async scheduleNext(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    await this.manager.schedule(id, {
      ttl: task.interval,
      metadata: { type: "recurring", taskId: id },
    });
  }

  async handleExpiration(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task) {
      await task.fn();
      await this.scheduleNext(id);
    }
  }
}
