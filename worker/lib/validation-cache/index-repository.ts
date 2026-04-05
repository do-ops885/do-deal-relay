// worker/lib/validation-cache/index-repository.ts
import type { ValidationCacheEntry } from "../../types/validation-cache";

type D1Like = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export class ValidationIndexRepository {
  constructor(private readonly db: D1Like) {}

  async findByFingerprint(fingerprint: string): Promise<any | null> {
    return this.db
      .prepare(
        `
        SELECT fingerprint, normalized_url, status, reason, trust_score,
               source, trace_id, first_seen_at, last_seen_at
        FROM validation_index
        WHERE fingerprint = ?
        LIMIT 1
        `,
      )
      .bind(fingerprint)
      .first();
  }

  async upsert(entry: ValidationCacheEntry): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO validation_index (
          fingerprint, normalized_url, status, reason, trust_score,
          source, trace_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET
          normalized_url = excluded.normalized_url,
          status = excluded.status,
          reason = excluded.reason,
          trust_score = excluded.trust_score,
          source = excluded.source,
          trace_id = excluded.trace_id,
          last_seen_at = excluded.last_seen_at
        `,
      )
      .bind(
        entry.fingerprint,
        entry.normalizedUrl,
        entry.status,
        entry.reason ?? null,
        entry.trustScore ?? null,
        entry.source ?? null,
        entry.traceId ?? null,
        entry.createdAt,
        entry.createdAt,
      )
      .run();
  }
}
