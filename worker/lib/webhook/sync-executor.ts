import type { Env } from "../../types";
import type { SyncConfig, SyncState } from "../webhook/types";
import { getProductionSnapshot } from "../storage";
import { validatedFetch } from "../security";

const SYNC_BATCH_SIZE = 50;
const SYNC_TIMEOUT_MS = 25000;

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  cursor?: string;
  error?: string;
}

function applyFieldMapping(
  deal: Record<string, unknown>,
  mapping?: Record<string, string>,
): Record<string, unknown> {
  if (!mapping || Object.keys(mapping).length === 0) return deal;
  const mapped: Record<string, unknown> = {};
  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    if (sourceKey in deal) {
      mapped[targetKey] = deal[sourceKey];
    }
  }
  return mapped;
}

export async function executeSync(
  env: Env,
  config: SyncConfig,
  state: SyncState,
): Promise<SyncResult> {
  const partnerConfig = await getPartnerConfig(env, config.partner_id);
  if (!partnerConfig?.endpoint_url) {
    return {
      success: false,
      synced: 0,
      failed: 0,
      error: "Partner endpoint not configured",
    };
  }

  const snapshot = await getProductionSnapshot(env);
  if (!snapshot?.deals?.length) {
    return { success: true, synced: 0, failed: 0, cursor: state.cursor };
  }

  let deals = snapshot.deals;

  if (config.filters?.domains?.length) {
    deals = deals.filter((d) =>
      config.filters!.domains!.includes(d.source.domain),
    );
  }
  if (config.filters?.status?.length) {
    deals = deals.filter((d) =>
      config.filters!.status!.includes(d.metadata.status),
    );
  }

  const startIndex = state.cursor ? parseInt(state.cursor, 10) || 0 : 0;
  deals = deals.slice(startIndex);

  let synced = 0;
  let failed = 0;
  let lastCursor = state.cursor;

  for (let i = 0; i < deals.length; i += SYNC_BATCH_SIZE) {
    const batch = deals.slice(i, i + SYNC_BATCH_SIZE);
    const payload = batch.map((deal) =>
      applyFieldMapping(
        deal as unknown as Record<string, string>,
        config.field_mapping,
      ),
    );

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      const response = await validatedFetch(partnerConfig.endpoint_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deals: payload,
          sync_version: state.sync_version,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        synced += batch.length;
        lastCursor = String(startIndex + i + batch.length);
      } else {
        failed += batch.length;
      }
    } catch {
      failed += batch.length;
      break;
    }
  }

  return {
    success: failed === 0,
    synced,
    failed,
    cursor: lastCursor,
  };
}

async function getPartnerConfig(
  env: Env,
  partnerId: string,
): Promise<{ endpoint_url?: string } | null> {
  try {
    const raw = await env.DEALS_LOG.get(`webhook:partner:${partnerId}`, "json");
    return raw as { endpoint_url?: string } | null;
  } catch {
    return null;
  }
}
