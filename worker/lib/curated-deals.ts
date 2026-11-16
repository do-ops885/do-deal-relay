/**
 * Curated Deal Import
 *
 * Operator-vetted referral codes are stored in KV and merged into discovery
 * candidates on every run. They then flow through the unchanged pipeline
 * (normalize → dedupe → 9 validation gates → score → stage → publish): this
 * module only supplies candidates, it never bypasses a gate.
 *
 * Storage: DEALS_SOURCES KV, key `curated:deals`, JSON array of
 * CuratedDealInput. Entries are upserted by (domain, code) so re-importing a
 * code updates it instead of duplicating it.
 */

import { z } from "zod";
import type { Deal, Env, SourceConfig } from "../types";
import { buildDeal } from "../pipeline/discover-parsers";
import { validateReferralUrl } from "./security";
import { logger } from "./global-logger";

export const CURATED_DEALS_KV_KEY = "curated:deals";
export const MAX_CURATED_DEALS = 200;
/**
 * Trust used for operator-vetted codes when the domain is not in the source
 * registry. Above the default 0.3 gate threshold and the 0.5 quarantine
 * threshold, but not 1.0: curated data is trusted, not verified.
 */
export const CURATED_DEFAULT_TRUST = 0.85;

/** Query params the normalization gate strips (and rejects as substrings). */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ref",
  "referrer",
] as const;

export const CuratedDealInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(4, "code must be at least 4 characters")
      .max(50, "code must be at most 50 characters")
      .regex(/^[A-Za-z0-9_-]+$/, "code must be alphanumeric, dash, underscore"),
    url: z.string().trim().url("url must be an absolute URL"),
    domain: z.string().trim().min(1).max(253),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    reward_type: z.enum(["cash", "credit", "percent", "item"]).optional(),
    reward_value: z.union([z.number(), z.string()]).optional(),
    reward_currency: z.string().trim().length(3).optional(),
    expiry_date: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(new Date(value).getTime()), {
        message: "expiry_date must be a parseable date",
      })
      .optional(),
    /** Optional per-entry trust override; registry trust wins when absent. */
    trust: z.number().min(0).max(1).optional(),
  })
  .strict();

export type CuratedDealInput = z.infer<typeof CuratedDealInputSchema>;

export interface CuratedImportRejection {
  index: number;
  code: string;
  reason: string;
}

export interface CuratedImportSummary {
  total: number;
  accepted: number;
  rejected: CuratedImportRejection[];
  stored: number;
}

/** Canonical apex domain: no scheme, no path, no `www.`, lowercase. */
export function normalizeCuratedDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

/**
 * Strip tracking params and trailing slash so the normalization gate has
 * nothing to reject once the deal enters the pipeline.
 */
function canonicalizeCuratedUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
    const sorted = new URLSearchParams(
      [...parsed.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    parsed.search = sorted.toString();
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Validate and canonicalize one entry for storage. Returns a rejection reason
 * when the entry cannot enter the pipeline unchanged.
 */
function prepareEntry(
  raw: unknown,
): { ok: true; entry: CuratedDealInput } | { ok: false; reason: string } {
  const parsed = CuratedDealInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  const input = parsed.data;
  const domain = normalizeCuratedDomain(input.domain);
  if (domain.length === 0) {
    return { ok: false, reason: "domain is empty after normalization" };
  }

  const url = canonicalizeCuratedUrl(input.url);
  let scheme = "";
  try {
    scheme = new URL(url).protocol;
  } catch {
    return { ok: false, reason: "url must be an absolute URL" };
  }
  if (scheme !== "https:") {
    return { ok: false, reason: "url must use https" };
  }
  if (!validateReferralUrl(url, domain)) {
    return {
      ok: false,
      reason: `url must be an https URL on ${domain} (no redirect params)`,
    };
  }

  // Gate 2 (normalization_verification) rejects any URL containing these
  // substrings. Surface it at import time instead of failing a pipeline run.
  const trackingHit = TRACKING_PARAMS.find((param) => url.includes(param));
  if (trackingHit) {
    return {
      ok: false,
      reason: `url still contains "${trackingHit}" after normalization; use the plain invite URL`,
    };
  }

  return {
    ok: true,
    entry: {
      ...input,
      code: input.code.trim().toUpperCase(),
      domain,
      url,
      ...(input.reward_currency !== undefined
        ? { reward_currency: input.reward_currency.toUpperCase() }
        : {}),
      ...(input.expiry_date !== undefined
        ? { expiry_date: new Date(input.expiry_date).toISOString() }
        : {}),
    },
  };
}

/** Read stored curated entries, dropping anything that no longer validates. */
export async function readCuratedDeals(env: Env): Promise<CuratedDealInput[]> {
  try {
    const stored = await env.DEALS_SOURCES.get<unknown>(
      CURATED_DEALS_KV_KEY,
      "json",
    );
    if (!Array.isArray(stored)) return [];
    const prepared: Array<
      { ok: true; entry: CuratedDealInput } | { ok: false; reason: string }
    > = stored.map((raw) => {
      try {
        return prepareEntry(raw);
      } catch (error) {
        // One malformed entry must not discard the rest of the batch.
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    });
    return prepared
      .filter(
        (result): result is { ok: true; entry: CuratedDealInput } => result.ok,
      )
      .map((result) => result.entry);
  } catch (error) {
    logger.warn("curated-deals: read failed", {
      component: "curated-deals",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function writeCuratedDeals(
  env: Env,
  entries: CuratedDealInput[],
): Promise<void> {
  await env.DEALS_SOURCES.put(
    CURATED_DEALS_KV_KEY,
    JSON.stringify(entries.slice(0, MAX_CURATED_DEALS)),
  );
}

/**
 * Validate, canonicalize, and upsert a batch of operator-supplied codes.
 * Per-entry failures are reported; valid entries are stored regardless.
 */
export async function importCuratedDeals(
  env: Env,
  rawEntries: unknown[],
): Promise<CuratedImportSummary> {
  const existing = await readCuratedDeals(env);
  const merged = new Map<string, CuratedDealInput>();
  const keyOf = (entry: CuratedDealInput) => `${entry.domain}:${entry.code}`;
  for (const entry of existing) merged.set(keyOf(entry), entry);

  const rejected: CuratedImportRejection[] = [];
  let accepted = 0;

  rawEntries.forEach((raw, index) => {
    const rawCode =
      typeof raw === "object" && raw !== null && "code" in raw
        ? String((raw as { code?: unknown }).code ?? "")
        : "";
    const prepared = prepareEntry(raw);
    if (!prepared.ok) {
      rejected.push({ index, code: rawCode, reason: prepared.reason });
      return;
    }
    merged.set(keyOf(prepared.entry), prepared.entry);
    accepted++;
  });

  await writeCuratedDeals(env, [...merged.values()]);

  logger.info("curated-deals: import processed", {
    component: "curated-deals",
    accepted,
    rejected: rejected.length,
    stored: merged.size,
  });

  return {
    total: rawEntries.length,
    accepted,
    rejected,
    stored: merged.size,
  };
}

/** Resolve trust for a curated entry: explicit override, registry, default. */
function resolveTrust(
  entry: CuratedDealInput,
  sources: readonly SourceConfig[],
): number {
  if (entry.trust !== undefined) return entry.trust;
  const registered = sources.find((source) => source.domain === entry.domain);
  return registered?.trust_initial ?? CURATED_DEFAULT_TRUST;
}

/**
 * Convert one curated entry to a pipeline Deal using the same builder as
 * scraped discovery, so validation sees an identical shape.
 */
export async function curatedEntryToDeal(
  entry: CuratedDealInput,
  sources: readonly SourceConfig[] = [],
): Promise<Deal> {
  const trust = resolveTrust(entry, sources);
  const rewardValue = entry.reward_value ?? 0;
  const rewardType =
    entry.reward_type ?? (typeof rewardValue === "number" ? "cash" : "credit");
  const sourceConfig: SourceConfig = {
    domain: entry.domain,
    url_patterns: [],
    trust_initial: trust,
    classification: trust >= 0.8 ? "trusted" : "probationary",
    active: true,
  };

  return buildDeal(
    {
      code: entry.code,
      url: entry.url,
      title: entry.title ?? `${entry.domain} referral code ${entry.code}`,
      description:
        entry.description ??
        `Operator-curated referral code ${entry.code} for ${entry.domain}`,
      reward_type: rewardType,
      reward_value: rewardValue,
      reward_currency: entry.reward_currency,
      ...(entry.expiry_date !== undefined
        ? { expiry_date: entry.expiry_date }
        : {}),
    },
    sourceConfig,
  );
}

/**
 * Load curated entries as Deals for a discovery run. Domains the registry
 * marks `blocked` are skipped; everything else flows through the gates.
 */
export async function loadCuratedDeals(
  env: Env,
  sources: readonly SourceConfig[],
): Promise<Deal[]> {
  const entries = await readCuratedDeals(env);
  if (entries.length === 0) return [];

  const deals: Deal[] = [];
  for (const entry of entries) {
    const registered = sources.find((source) => source.domain === entry.domain);
    if (registered?.classification === "blocked") {
      logger.info("curated-deals: skipping blocked domain", {
        component: "curated-deals",
        domain: entry.domain,
      });
      continue;
    }
    deals.push(await curatedEntryToDeal(entry, sources));
  }

  logger.info("curated-deals: loaded candidates", {
    component: "discovery",
    count: deals.length,
  });
  return deals;
}
