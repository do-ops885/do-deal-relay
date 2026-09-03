import { describe, it, expect, vi, type Mock } from "vitest";
import type {
  KVNamespaceListKey,
  KVNamespaceListResult,
} from "@cloudflare/workers-types";
import {
  listAllKvKeys,
  KV_PAGINATION_LIMITS,
} from "../../worker/lib/kv-pagination";

type KvKey = KVNamespaceListKey<unknown>;
type KvListResult = KVNamespaceListResult<unknown>;
type ListOptions = { prefix?: string; cursor?: string };
type ListFn = (options?: ListOptions) => Promise<KvListResult>;
type FakeKv = { list: Mock<ListFn> };

interface FakePage {
  keys: KvKey[];
  complete: boolean;
}

function key(name: string, metadata?: unknown): KvKey {
  return metadata === undefined ? { name } : { name, metadata };
}

function indexedKey(index: number): KvKey {
  return key(`key:${String(index).padStart(6, "0")}`, { i: index });
}

function done(keys: KvKey[]): FakePage {
  return { keys, complete: true };
}

function more(keys: KvKey[]): FakePage {
  return { keys, complete: false };
}

function toResult(page: FakePage, index: number): KvListResult {
  if (page.complete) {
    return { list_complete: true, keys: page.keys, cacheStatus: null };
  }
  return {
    list_complete: false,
    keys: page.keys,
    cursor: String(index + 1),
    cacheStatus: null,
  };
}

function createPagedKv(pages: FakePage[]): FakeKv {
  const list: Mock<ListFn> = vi.fn(async (options?: ListOptions) => {
    const index =
      options?.cursor === undefined ? 0 : Number.parseInt(options.cursor, 10);
    const page = pages[index] ?? { keys: [], complete: true };
    return toResult(page, index);
  });
  return { list };
}

function createPrefixedKv(names: string[], perPage: number): FakeKv {
  const matching = names
    .filter((n) => n.startsWith("apikey:"))
    .map((n) => key(n));
  const list: Mock<ListFn> = vi.fn(async (options?: ListOptions) => {
    expect(options?.prefix).toBe("apikey:");
    const start =
      options?.cursor === undefined ? 0 : Number.parseInt(options.cursor, 10);
    const slice = matching.slice(start, start + perPage);
    const complete = start + perPage >= matching.length;
    if (complete) {
      return { list_complete: true, keys: slice, cacheStatus: null };
    }
    return {
      list_complete: false,
      keys: slice,
      cursor: String(start + perPage),
      cacheStatus: null,
    };
  });
  return { list };
}

describe("listAllKvKeys", () => {
  it("accumulates keys across multiple pages until list_complete", async () => {
    const kv = createPagedKv([
      more([indexedKey(0), indexedKey(1)]),
      more([indexedKey(2), indexedKey(3)]),
      done([indexedKey(4)]),
    ]);

    const result = await listAllKvKeys(kv);

    expect(result.keys.map((k) => k.name)).toEqual([
      "key:000000",
      "key:000001",
      "key:000002",
      "key:000003",
      "key:000004",
    ]);
    expect(result.truncated).toBe(false);
    expect(result.pages).toBe(3);
    expect(kv.list).toHaveBeenCalledTimes(3);
    expect(kv.list.mock.calls[0]?.[0]).toEqual({});
    expect(kv.list.mock.calls[1]?.[0]).toEqual({ cursor: "1" });
    expect(kv.list.mock.calls[2]?.[0]).toEqual({ cursor: "2" });
  });

  it("passes prefix through on every page request", async () => {
    const kv = createPrefixedKv(
      ["apikey:aaa", "unrelated:1", "apikey:bbb", "other:2"],
      1,
    );

    const result = await listAllKvKeys(kv, { prefix: "apikey:" });

    expect(kv.list.mock.calls.every((c) => c[0]?.prefix === "apikey:")).toBe(
      true,
    );
    expect(result.keys.map((k) => k.name)).toEqual([
      "apikey:aaa",
      "apikey:bbb",
    ]);
    expect(result.truncated).toBe(false);
  });

  it("returns empty keys for an empty namespace", async () => {
    const kv = createPagedKv([done([])]);

    const result = await listAllKvKeys(kv);

    expect(result.keys).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.pages).toBe(1);
    expect(kv.list).toHaveBeenCalledTimes(1);
  });

  it("preserves metadata on returned keys", async () => {
    const kv = createPagedKv([done([key("with-meta", { owner: "test" })])]);

    const result = await listAllKvKeys(kv);

    expect(result.keys[0]?.metadata).toEqual({ owner: "test" });
  });

  it("stops at maxPages safety cap and marks result truncated", async () => {
    const kv = createPagedKv([
      more([indexedKey(0)]),
      more([indexedKey(1)]),
      more([indexedKey(2)]),
    ]);

    const result = await listAllKvKeys(kv, { maxPages: 2 });

    expect(result.truncated).toBe(true);
    expect(result.pages).toBe(2);
    expect(result.keys.map((k) => k.name)).toEqual([
      "key:000000",
      "key:000001",
    ]);
    expect(kv.list).toHaveBeenCalledTimes(2);
  });

  it("stops at maxKeys safety cap and truncates overflow on final page", async () => {
    const manyKeys = [0, 1, 2, 3, 4].map(indexedKey);
    const kv = createPagedKv([done(manyKeys)]);

    const result = await listAllKvKeys(kv, { maxKeys: 3 });

    expect(result.keys.map((k) => k.name)).toEqual([
      "key:000000",
      "key:000001",
      "key:000002",
    ]);
    expect(result.truncated).toBe(true);
  });

  it("exposes named safety limits instead of magic numbers", () => {
    expect(KV_PAGINATION_LIMITS.MAX_PAGES).toBeGreaterThan(0);
    expect(KV_PAGINATION_LIMITS.MAX_KEYS).toBeGreaterThan(0);
  });
});
