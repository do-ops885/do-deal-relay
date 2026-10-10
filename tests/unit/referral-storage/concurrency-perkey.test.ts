import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Env, ReferralInput } from "../../../worker/types";
import {
  storeReferralInput,
  getReferralByCode,
  getReferralById,
  updateReferralStatus,
  deactivateReferral,
  reactivateReferral,
} from "../../../worker/lib/referral-storage/crud";
import {
  getReferralsByDomain,
  getReferralsByStatus,
  searchReferrals,
} from "../../../worker/lib/referral-storage/search";
import { REFERRAL_KEYS } from "../../../worker/lib/referral-storage/types";
import type { KVNamespace } from "@cloudflare/workers-types";

function createMockKVNamespace(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: vi
      .fn()
      .mockImplementation(
        async (key: string, opts?: string | { type?: string }) => {
          const value = store.get(key);
          if (value === undefined) return null;
          const isJson =
            typeof opts === "string" ? opts === "json" : opts?.type === "json";
          return isJson ? JSON.parse(value) : value;
        },
      ),
    put: vi.fn().mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key);
    }),
    list: vi
      .fn()
      .mockImplementation(
        async (opts?: { prefix?: string; cursor?: string }) => {
          const prefix = opts?.prefix || "";
          const matchingKeys = Array.from(store.keys())
            .filter((k) => k.startsWith(prefix))
            .map((k) => ({ name: k }));
          return { keys: matchingKeys, list_complete: true };
        },
      ),
  } as unknown as KVNamespace;
}

function createMockEnv(kv: KVNamespace): Env {
  return {
    DEALS_SOURCES: kv,
  } as unknown as Env;
}

function createReferral(
  id: string,
  code: string,
  domain: string,
  status: ReferralInput["status"] = "active",
): ReferralInput {
  return {
    id,
    code,
    url: `https://${domain}/ref/${code}`,
    domain,
    status,
    submitted_at: new Date().toISOString(),
    metadata: {
      title: `${domain} Referral`,
      category: ["general"],
    },
  };
}

describe("Referral Storage - Atomic Per-Key & Concurrency Tests", () => {
  let kv: KVNamespace;
  let env: Env;

  beforeEach(() => {
    kv = createMockKVNamespace();
    env = createMockEnv(kv);
  });

  it("should store referral indices and status as individual per-key records", async () => {
    const ref = createReferral("ref-1", "SAVE20", "example.com", "active");
    await storeReferralInput(env, ref);

    // Verify individual KV keys were created
    expect(await kv.get("referral:index:code:save20")).toBe("ref-1");
    expect(await kv.get("referral:index:domain:example.com:ref-1")).toBe(
      "ref-1",
    );
    expect(await kv.get("referral:status:active:ref-1")).toBe("ref-1");

    // Verify whole JSON blobs were NOT created/mutated
    expect(await kv.get(REFERRAL_KEYS.CODE_INDEX)).toBeNull();
    expect(await kv.get(REFERRAL_KEYS.DOMAIN_INDEX)).toBeNull();
    expect(await kv.get(REFERRAL_KEYS.ACTIVE_LIST)).toBeNull();
  });

  it("should handle concurrent storeReferralInput calls without losing updates", async () => {
    const ref1 = createReferral("ref-101", "CODE101", "shared.com", "active");
    const ref2 = createReferral("ref-102", "CODE102", "shared.com", "active");
    const ref3 = createReferral("ref-103", "CODE103", "shared.com", "active");

    // Execute concurrent stores
    await Promise.all([
      storeReferralInput(env, ref1),
      storeReferralInput(env, ref2),
      storeReferralInput(env, ref3),
    ]);

    // All codes discoverable
    expect(await getReferralByCode(env, "CODE101")).toEqual(ref1);
    expect(await getReferralByCode(env, "CODE102")).toEqual(ref2);
    expect(await getReferralByCode(env, "CODE103")).toEqual(ref3);

    // Domain query returns all 3 without any lost writes
    const domainRefs = await getReferralsByDomain(env, "shared.com");
    expect(domainRefs).toHaveLength(3);
    const domainIds = domainRefs.map((r) => r.id);
    expect(domainIds).toContain("ref-101");
    expect(domainIds).toContain("ref-102");
    expect(domainIds).toContain("ref-103");

    // Status query returns all 3
    const activeRefs = await getReferralsByStatus(env, "active");
    expect(activeRefs).toHaveLength(3);
  });

  it("should handle concurrent status updates atomically", async () => {
    const ref1 = createReferral("ref-201", "UPD201", "target.com", "active");
    const ref2 = createReferral("ref-202", "UPD202", "target.com", "active");

    await storeReferralInput(env, ref1);
    await storeReferralInput(env, ref2);

    // Concurrently deactivate ref1 and ref2
    await Promise.all([
      updateReferralStatus(env, "ref-201", "inactive", "manual"),
      updateReferralStatus(env, "ref-202", "inactive", "manual"),
    ]);

    expect(await kv.get("referral:status:active:ref-201")).toBeNull();
    expect(await kv.get("referral:status:active:ref-202")).toBeNull();
    expect(await kv.get("referral:status:inactive:ref-201")).toBe("ref-201");
    expect(await kv.get("referral:status:inactive:ref-202")).toBe("ref-202");

    const inactiveRefs = await getReferralsByStatus(env, "inactive");
    expect(inactiveRefs).toHaveLength(2);
  });

  it("should update domain index when domain changes on update", async () => {
    const ref = createReferral("ref-301", "DOM301", "old-domain.com", "active");
    await storeReferralInput(env, ref);

    expect(
      await kv.get("referral:index:domain:old-domain.com:ref-301"),
    ).toBe("ref-301");

    // Update referral with new domain
    const updatedRef: ReferralInput = {
      ...ref,
      domain: "new-domain.com",
    };
    await storeReferralInput(env, updatedRef);

    // Old domain key deleted, new domain key created
    expect(
      await kv.get("referral:index:domain:old-domain.com:ref-301"),
    ).toBeNull();
    expect(
      await kv.get("referral:index:domain:new-domain.com:ref-301"),
    ).toBe("ref-301");

    const oldRefs = await getReferralsByDomain(env, "old-domain.com");
    expect(oldRefs).toHaveLength(0);

    const newRefs = await getReferralsByDomain(env, "new-domain.com");
    expect(newRefs).toHaveLength(1);
    expect(newRefs[0]!.id).toBe("ref-301");
  });

  it("should support deactivation and reactivation helper flows", async () => {
    const ref = createReferral("ref-401", "TOGGLE", "toggle.com", "active");
    await storeReferralInput(env, ref);

    await deactivateReferral(env, "TOGGLE", "expired", undefined, "test notes");
    expect((await getReferralById(env, "ref-401"))?.status).toBe("inactive");
    expect(await kv.get("referral:status:active:ref-401")).toBeNull();
    expect(await kv.get("referral:status:inactive:ref-401")).toBe("ref-401");

    await reactivateReferral(env, "TOGGLE", "reactivated notes");
    expect((await getReferralById(env, "ref-401"))?.status).toBe("active");
    expect(await kv.get("referral:status:inactive:ref-401")).toBeNull();
    expect(await kv.get("referral:status:active:ref-401")).toBe("ref-401");
  });

  it("should fallback to legacy shared JSON blobs if per-key records are absent", async () => {
    const legacyRef = createReferral(
      "legacy-1",
      "LEGACY50",
      "legacy.com",
      "active",
    );

    // Populate ONLY legacy blob keys
    await kv.put(
      `${REFERRAL_KEYS.INPUT_PREFIX}legacy-1`,
      JSON.stringify(legacyRef),
    );
    await kv.put(
      REFERRAL_KEYS.CODE_INDEX,
      JSON.stringify({ legacy50: "legacy-1" }),
    );
    await kv.put(
      REFERRAL_KEYS.DOMAIN_INDEX,
      JSON.stringify({ "legacy.com": ["legacy-1"] }),
    );
    await kv.put(REFERRAL_KEYS.ACTIVE_LIST, JSON.stringify(["legacy-1"]));

    // Verify fallback lookups work
    const byCode = await getReferralByCode(env, "LEGACY50");
    expect(byCode).toEqual(legacyRef);

    const byDomain = await getReferralsByDomain(env, "legacy.com");
    expect(byDomain).toHaveLength(1);
    expect(byDomain[0]).toEqual(legacyRef);

    const byStatus = await getReferralsByStatus(env, "active");
    expect(byStatus).toHaveLength(1);
    expect(byStatus[0]).toEqual(legacyRef);

    const searchRes = await searchReferrals(env, { domain: "legacy.com" });
    expect(searchRes.total).toBe(1);
    expect(searchRes.referrals[0]).toEqual(legacyRef);
  });
});
