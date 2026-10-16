#!/usr/bin/env node
/**
 * flashoffer-entry.ts — real save / load / daily-verify for one live entry.
 *
 * Source page: https://docs.qoder.com/events/flashoffer
 * Entry: Qoder "Qwen3.8-Flash: Free for a Limited Time" promo.
 *   Started 2026-09-18 10:00 SGT, original end 2026-09-30 23:59:59 SGT,
 *   EXTENDED indefinitely (end date TBA on the page). No claim required,
 *   credit rate 0.1x -> 0.0x. Entry therefore has NO expiry date and needs
 *   a daily live re-check of the source page ("daily verify if still active").
 *
 * Real usage (no mocks):
 *   - D1: real SQLite file via node:sqlite + the app's real MigrationRunner,
 *     insertDeal / insertReferralCode / getReferralCodeByString.
 *   - KV: file-backed KVNamespace shim + the app's real storeReferralInput /
 *     getReferralByCode / updateReferralStatus.
 *   - Daily verify: local gates (mirrors validateDealsBatch) + live fetch of
 *     the source page looking for still-free vs ended markers. On "ended" the
 *     entry is expired in BOTH stores, exactly like the 0 9 * * * cron path.
 *
 * State dir: $FLASHOFFER_STATE_DIR (default /tmp/opencode/flashoffer-state).
 * In production the same entry lives in real D1/KV via `wrangler deploy`;
 * the daily check is covered by the `0 9 * * *` checkDealExpirations cron.
 *
 * Run: bundle with esbuild, then node (see package.json `flashoffer` script):
 *   save | load | verify | all
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initDatabase } from "../worker/lib/d1/migrations/runner";
import { insertDeal, insertReferralCode } from "../worker/lib/d1/mutations";
import { getReferralCodeByString } from "../worker/lib/d1/referrals";
import { createD1Client } from "../worker/lib/d1/client";
import {
  storeReferralInput,
  getReferralByCode,
  updateReferralStatus,
} from "../worker/lib/referral-storage/crud";
import type { Env, ReferralInput } from "../worker/types";

// ---------------------------------------------------------------- entry data

const SOURCE_URL = "https://docs.qoder.com/events/flashoffer";
const DOMAIN = "docs.qoder.com";
const CODE = "QWEN38-FLASH";
// Synthetic selector code: the promo needs no claim code (select the model).
// The code below stands in for "select Qwen3.8-Flash", documented in notes.
const ENTRY_ID = "flashoffer-qwen38-20260918";
const DEAL_ID = "qoder-qwen38-flash-20260918";

const ACTIVE_MARKERS = ["remains free", "0.0", "qwen3.8-flash"];
const ENDED_MARKERS = [
  "promotion has ended",
  "no longer free",
  "offer has expired",
  "free period has ended",
];

function buildReferral(): ReferralInput {
  const now = new Date().toISOString();
  return {
    id: ENTRY_ID,
    code: CODE,
    url: SOURCE_URL,
    domain: DOMAIN,
    source: "manual-flashoffer",
    status: "active",
    submitted_at: now,
    submitted_by: "flashoffer-entry-script",
    metadata: {
      title: "Qwen3.8-Flash: Free for a Limited Time",
      description:
        "Qwen3.8-Flash calls consume no credits (rate 0.1x -> 0.0x) for all " +
        "individual Qoder users. Started 2026-09-18 10:00 SGT, extended past " +
        "2026-09-30 indefinitely; end date TBA on the source page.",
      reward_type: "credit",
      reward_value: 0,
      currency: "USD",
      category: ["ai-models", "developer-tools"],
      tags: ["qoder", "qwen", "free-tier", "daily-verify"],
      requirements: ["Individual Qoder account (Free plan eligible)"],
      confidence_score: 0.9,
      notes:
        "No claim code exists; CODE is a synthetic model selector. " +
        "Expiry unknown -> re-verify source page daily.",
    },
  };
}

// ---------------------------------------------------------------- file KV shim

type KVValue = { value: string; expiresAt?: number };

class FileKV {
  private file: string;
  private data = new Map<string, KVValue>();

  constructor(dir: string, name: string) {
    this.file = join(dir, `kv-${name}.json`);
    if (existsSync(this.file)) {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as Record<
        string,
        KVValue
      >;
      for (const [k, v] of Object.entries(raw)) this.data.set(k, v);
    }
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.data)));
  }

  private live(key: string): KVValue | undefined {
    const v = this.data.get(key);
    if (!v) return undefined;
    if (v.expiresAt && v.expiresAt < Date.now()) {
      this.data.delete(key);
      this.save();
      return undefined;
    }
    return v;
  }

  async get(key: string, type?: string): Promise<unknown> {
    const v = this.live(key);
    if (!v) return null;
    if (type === "json") return JSON.parse(v.value);
    return v.value;
  }

  async put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    const entry: KVValue = { value };
    if (opts?.expirationTtl)
      entry.expiresAt = Date.now() + opts.expirationTtl * 1000;
    this.data.set(key, entry);
    this.save();
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    this.save();
  }

  async list(opts?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const prefix = opts?.prefix ?? "";
    const all = [...this.data.keys()]
      .filter((k) => k.startsWith(prefix) && this.live(k) !== undefined)
      .sort();
    const limit = opts?.limit ?? 1000;
    const start = opts?.cursor ? parseInt(opts.cursor, 10) : 0;
    const page = all.slice(start, start + limit);
    const next = start + limit;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: next >= all.length,
      ...(next < all.length ? { cursor: String(next) } : {}),
    };
  }
}

// ------------------------------------------------------------- sqlite D1 shim

class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params);
  }

  private get args(): (
    null | number | bigint | string | NodeJS.ArrayBufferView
  )[] {
    return this.params as (
      null | number | bigint | string | NodeJS.ArrayBufferView
    )[];
  }

  private get isSelect(): boolean {
    return /^\s*(select|with|pragma|explain)\b/i.test(this.sql);
  }

  async first(): Promise<Record<string, unknown> | null> {
    const row = this.db.prepare(this.sql).get(...this.args) as
      Record<string, unknown> | undefined;
    return row ?? null;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    const rows = this.db.prepare(this.sql).all(...this.args) as Record<
      string,
      unknown
    >[];
    return { results: rows };
  }

  async run(): Promise<{
    results: Record<string, unknown>[];
    meta: Record<string, number>;
    success: boolean;
  }> {
    if (this.isSelect) {
      const { results } = await this.all();
      return { results, meta: { rows_read: results.length }, success: true };
    }
    const info = this.db.prepare(this.sql).run(...this.args);
    return {
      results: [],
      meta: {
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        rows_written: Number(info.changes),
      },
      success: true,
    };
  }
}

function createD1Shim(db: DatabaseSync): unknown {
  const api = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    exec: async (sql: string) => {
      db.exec(sql);
    },
    withSession: () => ({
      prepare: (sql: string) => new Statement(db, sql),
      getBookmark: () => "local-bookmark",
    }),
  };
  return api;
}

// ------------------------------------------------------------------ env setup

function openEnv() {
  const dir =
    process.env.FLASHOFFER_STATE_DIR ?? "/tmp/opencode/flashoffer-state";
  mkdirSync(dir, { recursive: true });
  const sqlite = new DatabaseSync(join(dir, "deals.db"));
  const kv = (name: string) => new FileKV(dir, name);
  const env = {
    DEALS_SOURCES: kv("sources"),
    DEALS_PROD: kv("prod"),
    DEALS_STAGING: kv("staging"),
    DEALS_LOG: kv("log"),
    DEALS_DB: createD1Shim(sqlite),
    ENVIRONMENT: "local-flashoffer",
    TRUST_THRESHOLD: "0.3",
  } as unknown as Env;
  return { env, dir };
}

// --------------------------------------------------------------------- save

async function cmdSave(env: Env): Promise<void> {
  const db = env.DEALS_DB;
  const mig = await initDatabase(db);
  console.log(`migrations applied: [${mig.applied.join(",")}]`);

  const referral = buildReferral();
  const stored = await storeReferralInput(env, referral);
  console.log(`KV saved: id=${stored.id} code=${stored.code}`);

  const now = new Date().toISOString();
  const deal = await insertDeal(db, {
    deal_id: DEAL_ID,
    title: "Qwen3.8-Flash: Free for a Limited Time",
    description:
      "Qwen3.8-Flash free for a limited time (rate 0.0x, zero credit use).",
    code: CODE,
    url: SOURCE_URL,
    domain: DOMAIN,
    source: {
      url: SOURCE_URL,
      domain: DOMAIN,
      discovered_at: now,
      trust_score: 0.9,
    },
    reward: {
      type: "credit",
      value: 0,
      currency: "USD",
      description: "0.0x rate, zero credit consumption",
    },
    metadata: {
      category: ["ai-models", "developer-tools"],
      tags: ["qoder", "qwen", "free-tier", "daily-verify"],
      normalized_at: now,
      confidence_score: 0.9,
      status: "active",
    },
    expiry: { confidence: 0.3, type: "unknown" },
    requirements: ["Individual Qoder account (Free plan eligible)"],
  });
  if (!deal.success) throw new Error(`insertDeal failed: ${deal.error}`);
  console.log(`D1 deal upserted: rowId=${deal.id} deal_id=${DEAL_ID}`);

  // Upserts return lastRowId 0 (no new row), so resolve the numeric deal id
  // with a real lookup. NOTE: worker/lib/referral-storage/dual-write.ts has
  // the same flaw — re-saving via storeReferralDual reuses the upsert rowId
  // and hits FOREIGN KEY constraint failed on referral_codes.
  const dealRow = await createD1Client(db).queryFirst<{ id: number }>(
    "SELECT id FROM deals WHERE deal_id = ?",
    [DEAL_ID],
  );
  const numericDealId = dealRow.success && dealRow.data ? dealRow.data.id : 0;
  if (!numericDealId) throw new Error("deal row missing after upsert");

  const rc = await insertReferralCode(db, {
    ...(stored as ReferralInput & { deal_id: number }),
    deal_id: numericDealId,
  });
  if (!rc.success) throw new Error(`insertReferralCode failed: ${rc.error}`);
  console.log(`D1 referral_code upserted: rowId=${rc.id} code=${CODE}`);
}

// --------------------------------------------------------------------- load

async function cmdLoad(env: Env): Promise<void> {
  const kvEntry = await getReferralByCode(env, CODE);
  const d1Entry = await getReferralCodeByString(env.DEALS_DB, CODE);
  const dealRow = await createD1Client(env.DEALS_DB).queryFirst<{
    deal_id: string;
    title: string;
    status: string;
    expiry_date: string | null;
  }>(
    "SELECT deal_id, title, status, expiry_date FROM deals WHERE deal_id = ?",
    [DEAL_ID],
  );
  const verifyStamp = await env.DEALS_SOURCES.get(
    `referral:verify:${ENTRY_ID}`,
    "json",
  );
  console.log(
    JSON.stringify(
      {
        kv: kvEntry,
        d1_referral_code: d1Entry,
        d1_deal: dealRow.success ? dealRow.data : null,
        last_daily_verify: verifyStamp,
      },
      null,
      2,
    ),
  );
  if (!kvEntry || !d1Entry) {
    throw new Error("Entry missing in KV or D1 — run `save` first.");
  }
}

// ------------------------------------------------------------------- verify

function localGates(r: ReferralInput): string[] {
  const issues: string[] = [];
  if (!r.code?.trim()) issues.push("missing code");
  try {
    const u = new URL(r.url);
    if (u.protocol !== "https:") issues.push("non-https url");
    if (u.hostname !== (r.domain ?? "").toLowerCase())
      issues.push("url/domain mismatch");
  } catch {
    issues.push("unparseable url");
  }
  const v = r.metadata?.reward_value;
  if (typeof v === "number" && v < 0) issues.push("negative reward");
  if (r.expires_at && new Date(r.expires_at) <= new Date())
    issues.push(`expired at ${r.expires_at}`);
  return issues;
}

async function fetchPageText(): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(SOURCE_URL, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)",
        Accept: "text/html,*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function cmdVerify(env: Env): Promise<void> {
  const referral = await getReferralByCode(env, CODE);
  if (!referral) throw new Error("Entry not found — run `save` first.");

  const issues = localGates(referral);
  const html = (await fetchPageText()).toLowerCase();
  const activeHits = ACTIVE_MARKERS.filter((m) => html.includes(m));
  const endedHits = ENDED_MARKERS.filter((m) => html.includes(m));
  const stillFree =
    issues.length === 0 && activeHits.length > 0 && endedHits.length === 0;
  const verdict = stillFree ? "active" : "ended-or-invalid";
  console.log(
    JSON.stringify(
      {
        code: CODE,
        verdict,
        local_gate_issues: issues,
        page_active_markers: activeHits,
        page_ended_markers: endedHits,
        page_bytes: html.length,
      },
      null,
      2,
    ),
  );

  if (!stillFree) {
    await updateReferralStatus(env, ENTRY_ID, "expired", "promotion_ended");
    await createD1Client(env.DEALS_DB).execute(
      `UPDATE referral_codes SET status = 'expired', is_active = 0,
       deactivated_at = datetime('now'), deactivated_reason = ?
       WHERE code = ?`,
      ["promotion_ended", CODE],
    );
    console.log("Entry expired in KV + D1.");
  }
  await env.DEALS_SOURCES.put(
    `referral:verify:${ENTRY_ID}`,
    JSON.stringify({
      checked_at: new Date().toISOString(),
      verdict,
      active_markers: activeHits,
      ended_markers: endedHits,
      local_gate_issues: issues,
    }),
  );
  if (!stillFree) process.exitCode = 2;
}

// --------------------------------------------------------------------- main

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "all";
  const { env, dir } = openEnv();
  console.log(`state dir: ${dir}`);
  if (cmd === "save" || cmd === "all") await cmdSave(env);
  if (cmd === "load" || cmd === "all") await cmdLoad(env);
  if (cmd === "verify" || cmd === "all") await cmdVerify(env);
  if (!["save", "load", "verify", "all"].includes(cmd)) {
    throw new Error(`unknown command: ${cmd}`);
  }
}

main().catch((error) => {
  console.error(
    `flashoffer-entry failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
