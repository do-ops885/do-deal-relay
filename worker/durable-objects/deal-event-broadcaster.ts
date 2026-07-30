// ============================================================================
// DealEventBroadcaster Durable Object — SSE Real-Time Deal Updates
// ============================================================================
// Provides Server-Sent Events streaming of deal lifecycle events to connected
// clients. Uses DO + SQLite for connection state, enabling cross-worker
// broadcast of deal discovery, validation, publishing, and rejection events.
//
// ADR-020 Phase 2 / NEW-FEAT-3: SSE real-time deal updates
// ============================================================================

import type { DurableObjectState } from "@cloudflare/workers-types";
import { logger } from "../lib/global-logger";

// ============================================================================
// Types
// ============================================================================

/** Deal event types that can be broadcast. */
export type DealEventType =
  | "deal_discovered"
  | "deal_validated"
  | "deal_published"
  | "deal_rejected"
  | "deal_expired"
  | "deal_health_changed";

/** Structure of a deal event pushed to SSE clients. */
export interface DealEvent {
  type: DealEventType;
  dealId: string;
  source: string;
  title: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

import type { SqlStorageValue } from "@cloudflare/workers-types";

/** Connected client state stored in SQLite. */
interface ClientRow extends Record<string, SqlStorageValue> {
  client_id: string;
  created_at: number;
  last_heartbeat: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum connected clients before rejecting new connections. */
const MAX_CLIENTS = 100;

/** Heartbeat interval in milliseconds (keeps SSE connection alive). */
const HEARTBEAT_MS = 15_000;

/** Maximum client age before cleanup (30 minutes). */
const MAX_CLIENT_AGE_MS = 30 * 60 * 1000;

/** Maximum stored events before pruning. */
const MAX_STORED_EVENTS = 500;

// ============================================================================
// DealEventBroadcaster Durable Object
// ============================================================================

/**
 * Globally-unique Durable Object providing SSE-based real-time deal
 * event streaming to connected clients.
 *
 * Usage (from Worker):
 *   const stub = env.DEAL_EVENT_BROADCASTER.getByName("events");
 *   const response = await stub.fetch(request);
 *
 *   // To push an event:
 *   await stub.broadcastEvent({ type: "deal_published", ... });
 */
export class DealEventBroadcaster {
  private readonly sql: DurableObjectState["storage"]["sql"];

  constructor(private readonly state: DurableObjectState) {
    this.sql = state.storage.sql;

    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS clients (
        client_id     TEXT PRIMARY KEY,
        created_at    INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL
      )`,
    );

    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type  TEXT NOT NULL,
        deal_id     TEXT NOT NULL,
        source      TEXT NOT NULL,
        title       TEXT NOT NULL,
        data_json   TEXT NOT NULL DEFAULT '{}',
        created_at  INTEGER NOT NULL
      )`,
    );

    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_events_created
       ON events(created_at DESC)`,
    );
  }

  // --------------------------------------------------------------------------
  // broadcastEvent (RPC)
  // --------------------------------------------------------------------------

  /**
   * Broadcast a deal event to all connected SSE clients.
   * Also persists the event for late-joining clients to catch up.
   *
   * @param event - The deal event to broadcast.
   */
  async broadcastEvent(event: DealEvent): Promise<number> {
    const now = Date.now();

    // Store event for late-joiners
    this.sql.exec(
      `INSERT INTO events (event_type, deal_id, source, title, data_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      event.type,
      event.dealId,
      event.source,
      event.title,
      JSON.stringify(event.data ?? {}),
      event.timestamp || now,
    );

    // Prune old events
    this.sql.exec(
      `DELETE FROM events WHERE id NOT IN (
        SELECT id FROM events ORDER BY created_at DESC LIMIT ?
      )`,
      MAX_STORED_EVENTS,
    );

    // Get all connected clients
    const clients = this.sql
      .exec<ClientRow>(
        `SELECT client_id FROM clients
         WHERE last_heartbeat > ?`,
        now - MAX_CLIENT_AGE_MS,
      )
      .toArray();

    logger.info("Broadcasting deal event", {
      component: "deal-event-broadcaster",
      event_type: event.type,
      deal_id: event.dealId,
      connected_clients: clients.length,
    });

    return clients.length;
  }

  // --------------------------------------------------------------------------
  // registerClient (RPC)
  // --------------------------------------------------------------------------

  /**
   * Register a new SSE client connection.
   *
   * @returns The client ID, or null if at capacity.
   */
  async registerClient(): Promise<string | null> {
    const now = Date.now();

    // Check capacity
    const activeClients = this.sql
      .exec<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM clients WHERE last_heartbeat > ?`,
        now - MAX_CLIENT_AGE_MS,
      )
      .one();

    if (Number(activeClients.cnt) >= MAX_CLIENTS) {
      return null;
    }

    const clientId = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO clients (client_id, created_at, last_heartbeat)
       VALUES (?, ?, ?)`,
      clientId,
      now,
      now,
    );

    return clientId;
  }

  // --------------------------------------------------------------------------
  // heartbeat (RPC)
  // --------------------------------------------------------------------------

  /**
   * Update a client's heartbeat timestamp to keep the connection alive.
   */
  async heartbeat(clientId: string): Promise<void> {
    this.sql.exec(
      `UPDATE clients SET last_heartbeat = ? WHERE client_id = ?`,
      Date.now(),
      clientId,
    );
  }

  // --------------------------------------------------------------------------
  // unregisterClient (RPC)
  // --------------------------------------------------------------------------

  /**
   * Remove a client when the SSE connection closes.
   */
  async unregisterClient(clientId: string): Promise<void> {
    this.sql.exec(`DELETE FROM clients WHERE client_id = ?`, clientId);
  }

  // --------------------------------------------------------------------------
  // getRecentEvents (RPC)
  // --------------------------------------------------------------------------

  /**
   * Get recent events for late-joining clients to catch up.
   *
   * @param since - Timestamp to fetch events after (default: last 5 minutes).
   * @returns Array of recent deal events.
   */
  async getRecentEvents(since?: number): Promise<DealEvent[]> {
    const cutoff = since ?? Date.now() - 5 * 60 * 1000;

    const rows = this.sql
      .exec<{
        event_type: string;
        deal_id: string;
        source: string;
        title: string;
        data_json: string;
        created_at: number;
      }>(
        `SELECT event_type, deal_id, source, title, data_json, created_at
         FROM events WHERE created_at > ?
         ORDER BY created_at DESC LIMIT 50`,
        cutoff,
      )
      .toArray();

    return rows.map((row) => ({
      type: row.event_type as DealEventType,
      dealId: row.deal_id,
      source: row.source,
      title: row.title,
      timestamp: row.created_at,
      data: JSON.parse(row.data_json),
    }));
  }

  // --------------------------------------------------------------------------
  // fetch — SSE connection handler
  // --------------------------------------------------------------------------

  /**
   * Handle incoming HTTP requests.
   * GET returns an SSE stream for deal events.
   * POST accepts RPC-style broadcastEvent calls.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // SSE stream endpoint
    if (request.method === "GET" && url.pathname.endsWith("/stream")) {
      return this.handleSSEStream(request);
    }

    // Default response for other methods
    return new Response("DealEventBroadcaster DO — use /stream for SSE", {
      status: 200,
    });
  }

  // --------------------------------------------------------------------------
  // Private: SSE stream handler
  // --------------------------------------------------------------------------

  private async handleSSEStream(request: Request): Promise<Response> {
    const clientId = await this.registerClient();
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Too many connected clients" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Send recent events to catch up
    const recentEvents = await this.getRecentEvents();

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const sseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Client-Id": clientId,
    };

    // Background task: stream events and heartbeats
    const streamTask = (async () => {
      try {
        // Send catch-up events first
        for (const event of recentEvents) {
          await writer.write(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        }

        // Send initial connected event
        await writer.write(
          encoder.encode(
            `event: connected\ndata: {"clientId":"${clientId}"}\n\n`,
          ),
        );

        // Heartbeat loop
        let lastHeartbeat = Date.now();
        let lastEventCount = recentEvents.length;

        while (true) {
          await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));

          // Update heartbeat in DO
          await this.heartbeat(clientId);
          lastHeartbeat = Date.now();

          // Check for new events since last poll
          const newEvents = await this.getRecentEvents(lastHeartbeat);
          for (const event of newEvents) {
            if (
              event.timestamp > lastHeartbeat - HEARTBEAT_MS &&
              newEvents.indexOf(event) >= lastEventCount
            ) {
              // New event — send to client
              // Note: we only send events that arrived after the heartbeat gap
              await writer.write(
                encoder.encode(
                  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                ),
              );
            }
          }
          lastEventCount = newEvents.length;

          // Send keepalive comment
          await writer.write(encoder.encode(": keepalive\n\n"));
        }
      } catch {
        // Client disconnected or stream closed
      } finally {
        await this.unregisterClient(clientId);
        await writer.close().catch(() => {});
      }
    })();

    streamTask.catch(() => {
      writer.close().catch(() => {});
    });

    return new Response(readable, { headers: sseHeaders });
  }
}
