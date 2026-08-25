// ============================================================================
// KV Pagination - Bounded cursor pagination for Workers KV list operations
// ============================================================================

import type {
  KVNamespaceListKey,
  KVNamespaceListOptions,
  KVNamespaceListResult,
} from "@cloudflare/workers-types";

/**
 * Minimal structural view of a Workers KV namespace needed for pagination.
 * Matches Cloudflare KVNamespace while keeping the helper testable without
 * depending on generic list() instantiations.
 */
export interface KvListClient {
  list(
    options?: KVNamespaceListOptions,
  ): Promise<KVNamespaceListResult<unknown>>;
}

/**
 * Safety limits for full-namespace KV scans.
 *
 * Guards against unbounded iteration on very large or misbehaving
 * namespaces: MAX_PAGES bounds round trips to the KV API and
 * MAX_KEYS bounds total accumulated keys held in memory.
 */
export const KV_PAGINATION_LIMITS = {
  MAX_PAGES: 100,
  MAX_KEYS: 10000,
} as const;

export interface ListAllKvKeysOptions {
  prefix?: string;
  maxPages?: number;
  maxKeys?: number;
}

export interface ListAllKvKeysResult {
  keys: KVNamespaceListKey<unknown>[];
  truncated: boolean;
  pages: number;
}

/**
 * Lists every key in a KV namespace by following cursors until
 * list_complete, unlike a bare list() call which stops after one page.
 *
 * Iteration is bounded by maxPages/maxKeys (defaults to
 * KV_PAGINATION_LIMITS). When a limit is reached the returned result is
 * marked truncated instead of throwing, so callers keep first-page
 * behavior even under pathological namespace sizes.
 */
export async function listAllKvKeys(
  kv: KvListClient,
  options: ListAllKvKeysOptions = {},
): Promise<ListAllKvKeysResult> {
  const maxPages = options.maxPages ?? KV_PAGINATION_LIMITS.MAX_PAGES;
  const maxKeys = options.maxKeys ?? KV_PAGINATION_LIMITS.MAX_KEYS;

  const keys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  let pages = 0;

  const enforceKeyCap = (): boolean => {
    if (keys.length <= maxKeys) {
      return false;
    }
    keys.length = maxKeys;
    return true;
  };

  while (pages < maxPages && keys.length < maxKeys) {
    const listOptions: KVNamespaceListOptions = {};
    if (options.prefix !== undefined) {
      listOptions.prefix = options.prefix;
    }
    if (cursor !== undefined) {
      listOptions.cursor = cursor;
    }

    const page = await kv.list(listOptions);
    pages += 1;
    keys.push(...page.keys);

    if (page.list_complete !== false) {
      return { keys, truncated: enforceKeyCap(), pages };
    }

    cursor = page.cursor;
  }

  enforceKeyCap();
  return { keys, truncated: true, pages };
}
