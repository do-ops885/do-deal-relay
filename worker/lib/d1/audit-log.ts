/**
 * D1 Audit Log Helpers — Single and batch insert for audit events.
 *
 * Uses D1 batch API for atomic multi-row inserts. The audit_log table
 * is defined in migration 7 (schema-part-4.ts).
 */

import type { D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

export interface AuditEvent {
  id: string;
  userId?: string;
  action: string;
  resource?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

// ============================================================================
// SQL
// ============================================================================

const INSERT_SQL = `INSERT INTO audit_log (id, user_id, action, resource, resource_type, resource_id, details, ip_address, user_agent, correlation_id, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))`;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Log a single audit event.
 */
export async function logAuditEvent(
  db: D1Database,
  event: AuditEvent,
): Promise<void> {
  await db
    .prepare(INSERT_SQL)
    .bind(
      event.id,
      event.userId ?? null,
      event.action,
      event.resource ?? null,
      event.resourceType ?? null,
      event.resourceId ?? null,
      event.details ? JSON.stringify(event.details) : null,
      event.ipAddress ?? null,
      event.userAgent ?? null,
      event.correlationId ?? null,
    )
    .run();
}

/**
 * Batch-insert multiple audit events in a single D1 batch call.
 * Empty arrays are a no-op.
 */
export async function logAuditEventsBatch(
  db: D1Database,
  events: AuditEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const stmt = db.prepare(INSERT_SQL);

  await db.batch(
    events.map((e) =>
      stmt.bind(
        e.id,
        e.userId ?? null,
        e.action,
        e.resource ?? null,
        e.resourceType ?? null,
        e.resourceId ?? null,
        e.details ? JSON.stringify(e.details) : null,
        e.ipAddress ?? null,
        e.userAgent ?? null,
        e.correlationId ?? null,
      ),
    ),
  );
}
