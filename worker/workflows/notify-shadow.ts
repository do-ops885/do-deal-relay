import type { Env } from "../types";
import type { ShadowSampleKey } from "../pipeline/discover";
import { getNotificationThreshold } from "../lib/high-value-notifier";
import { logger } from "../lib/global-logger";

/**
 * Compact dry-run outcome for the notify phase. No notification is sent
 * and no webhook fires; counts only.
 */
export interface NotifyDryRunSummary {
  checked: number;
  would_notify: number;
  threshold: number;
  by_source: Record<string, number>;
}

/**
 * Deterministic durable step name. Run id is sanitized like
 * `shadowStepName` so names stay stable cache keys (Rules of Workflows:
 * no Date.now/random in names).
 */
export function notifyStepName(run_id: string): string {
  const safeRunId = run_id.replace(/[^a-zA-Z0-9-]/g, "-");
  return `notify-dry-run-${safeRunId}`;
}

/**
 * Pure high-value candidate count over shadow sample keys. Mirrors
 * `filterHighValueDeals` (`reward_value > threshold`, strictly): null
 * rewards never notify, exactly like the main path.
 */
export function summarizeNotifyReadonly(
  keys: ShadowSampleKey[],
  threshold: number,
): NotifyDryRunSummary {
  let would_notify = 0;
  const by_source: Record<string, number> = {};
  for (const key of keys) {
    if (key.reward_value !== null && key.reward_value > threshold) {
      would_notify += 1;
    }
    const host = hostOf(key.url);
    by_source[host] = (by_source[host] ?? 0) + 1;
  }
  return { checked: keys.length, would_notify, threshold, by_source };
}

/**
 * Dry-run the notify decision for one shadow run. Resolves the threshold
 * via the shared `getNotificationThreshold` helper (same source as the
 * main path) and counts candidates purely. Never calls `notify`, never
 * sends webhooks, performs zero writes.
 */
export async function planNotifyReadonly(
  env: Env,
  keys: ShadowSampleKey[],
): Promise<NotifyDryRunSummary> {
  const threshold = getNotificationThreshold(env);
  const summary = summarizeNotifyReadonly(keys, threshold);

  logger.info("Shadow notify dry-run completed", {
    component: "workflow-shadow",
    checked: summary.checked,
    would_notify: summary.would_notify,
    threshold,
  });

  return summary;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}
