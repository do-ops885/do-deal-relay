# Vectorize Gotchas

> **No dashboard UI.** There is no Cloudflare web console for Vectorize. All index lifecycle, metadata index, and bulk operations are performed via the `wrangler` CLI or the HTTP API. Plan CI accordingly.

## Critical Warnings

### Async Mutations

Insert/upsert/delete return immediately but vectors aren't queryable for 5-10 seconds.

### Batch Size Limit (V2)

**Workers API: 1,000 vectors max per call.** **HTTP API: 5,000 per call.** NDJSON file upload: 5,000 per file, 100 MB max.

```typescript
const BATCH = 1000; // V2
for (let i = 0; i < vectors.length; i += BATCH) {
  await env.VECTORIZE.upsert(vectors.slice(i, i + BATCH));
}
```

### Metadata Truncation

`returnMetadata: "indexed"` returns only first 64 bytes of strings. Use `"all"` for complete metadata (but max topK drops to 50 in V2).

### topK Limits (V2)

| returnMetadata         | returnValues | Max topK |
| ---------------------- | ------------ | -------- |
| `"none"` / `"indexed"` | `false`      | 100      |
| `"all"`                | any          | **50**   |
| any                    | `true`       | **50**   |

### Metadata Indexes First

Create BEFORE inserting - existing vectors not retroactively indexed.

```bash
# ✅ Create index FIRST
wrangler vectorize create-metadata-index my-index --property-name=category --type=string
wrangler vectorize insert my-index --file=data.ndjson
```

### Index Config Immutable

Cannot change dimensions/metric after creation. Must create new index and migrate.

## Limits (V2)

| Resource                                   | Limit                            |
| ------------------------------------------ | -------------------------------- |
| Vectors per index                          | 10,000,000                       |
| Max dimensions                             | 1536 (32-bit float)              |
| Max vector ID length                       | 64 bytes                         |
| Max index name length                      | 64 bytes                         |
| Batch upsert (Workers)                     | **1,000**                        |
| Batch upsert (HTTP API)                    | **5,000**                        |
| Max vectors in `list` page                 | 1,000                            |
| Metadata per vector                        | 10 KiB                           |
| Max metadata indexes per index             | 10                               |
| Indexed string metadata                    | **64 bytes** (first 64B UTF-8)   |
| topK with values/metadata                  | 50                               |
| topK without values/metadata               | 100                              |
| Namespaces per index                       | 50,000 (Paid) / 1,000 (Free)     |
| Max namespace name length                  | 64 bytes                         |
| Max vector upload file size                | 100 MB                           |
| Indexes per account                        | 50,000 (Paid) / 100 (Free)       |

## Common Mistakes

1. **Wrong embedding shape:** Extract `result.data[0]` from Workers AI
2. **Metadata index after data:** Re-upsert all vectors
3. **Insert vs upsert:** `insert` ignores duplicates, `upsert` overwrites
4. **Not batching:** Individual inserts ~1K/min, batched ~200K+/min
5. **Expecting a dashboard:** Vectorize has no web console - all ops are CLI or HTTP API
6. **Using old topK=20 limit:** V2 allows topK=50 with values/metadata, 100 without

## Troubleshooting

**No results?**

- Wait 5-10s after insert (mutations are async)
- Check namespace spelling (case-sensitive)
- Verify metadata index exists
- Check dimension mismatch between query vector and index
- Run `npx wrangler vectorize info <index>` to confirm `processedUpToMutation` matches your last insert

**Metadata filter not working?**

- Index must exist before data insert
- Strings >64 bytes are truncated at UTF-8 boundary
- Use dot notation for nested: `"product.category"`
- Metadata values must be string/number/boolean/null

**`wrangler deploy` fails with "index not found"?**

- Vectorize has no auto-provisioning. Create the index before deploy, e.g. via `npx wrangler vectorize create <name> --dimensions=N --metric=...`
- Run `npx wrangler vectorize list` to confirm the index exists in the right account

## Model Dimensions

- `@cf/baai/bge-small-en-v1.5`: 384
- `@cf/baai/bge-base-en-v1.5`: 768 (recommended)
- `@cf/baai/bge-large-en-v1.5`: 1024

## V1 → V2 Migration Notes

- V1 indexes (legacy `--deprecated-v1`) are capped at 200,000 vectors, max topK 20, max index name 63 bytes, max namespace name 63 bytes, max 100 indexes per account.
- V2 indexes (default) support 10M vectors, topK 50/100, 64-byte names, 50K/1K namespaces per index.
- New V1 indexes were sunset December 2024. Existing V1 indexes continue to work but should be migrated.
