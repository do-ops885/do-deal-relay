# Vectorize Configuration

> **No dashboard UI.** Cloudflare Vectorize has no web console for index lifecycle. All create/list/info/delete operations are performed via the `wrangler` CLI or the Cloudflare HTTP API. If you need a UI, build one yourself against the API.

## Prerequisites

- **Wrangler 3.71.0+** for V2 indexes (legacy V1 indexes need `--deprecated-v1`). Use `npx wrangler@latest vectorize ...` to always run the latest CLI.
- A Cloudflare account + API token with `Workers / Vectorize: Edit` scope.
- A Worker project with a `wrangler.jsonc` (or `wrangler.toml`).

## Create Index

```bash
# V2 (current, default)
npx wrangler vectorize create <index-name> --dimensions=768 --metric=cosine

# Legacy V1 (deprecated, December 2024 sunset for new indexes)
npx wrangler vectorize --deprecated-v1 create <index-name> --dimensions=768 --metric=cosine
```

**Index name rules:**

- ASCII lowercase letters and digits only
- Must start with a letter
- Max **64 bytes** (V2; V1 was 63)
- Use dashes for spaces
- Example: `production-doc-search`, `dev-recommendation-engine`

**Metric must match the embedding model:**

| Model                          | Dimensions | Recommended metric |
| ------------------------------ | ---------- | ------------------ |
| `@cf/baai/bge-small-en-v1.5`   | 384        | `cosine`           |
| `@cf/baai/bge-base-en-v1.5`    | 768        | `cosine`           |
| `@cf/baai/bge-large-en-v1.5`   | 1024       | `cosine`           |
| OpenAI `text-embedding-3-*`    | 512–3072   | `cosine`           |
| Cohere `embed-english-v3.0`    | 1024       | `cosine`           |

> **Dimensions and metric are immutable** - cannot change after creation. To change them, create a new index and migrate.

The command prints the binding snippet to paste into `wrangler.jsonc`:

```
📋 To start querying from a Worker, add the following binding configuration into 'wrangler.jsonc':

[[vectorize]]
binding = "VECTORIZE" # available in your Worker on env.VECTORIZE
index_name = "my-index"
```

## Worker Binding

```jsonc
// wrangler.jsonc
{
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "my-index" }],
}
```

```typescript
interface Env {
  VECTORIZE: Vectorize;
}
```

The binding name must be a valid JavaScript variable name (`MY_INDEX`, `PROD_SEARCH_INDEX`).

## Metadata Indexes

**Must create BEFORE inserting vectors** - existing vectors are not retroactively indexed.

```bash
wrangler vectorize create-metadata-index my-index --property-name=category --type=string
wrangler vectorize create-metadata-index my-index --property-name=price --type=number
wrangler vectorize create-metadata-index my-index --property-name=active --type=boolean
```

| Type      | Use For                                   | Indexed bytes           |
| --------- | ----------------------------------------- | ----------------------- |
| `string`  | Categories, tags, URLs                    | First 64 bytes (UTF-8)  |
| `number`  | Prices, timestamps (float64 precision)    | n/a                     |
| `boolean` | Flags                                     | n/a                     |

Max 10 metadata indexes per Vectorize index.

## CLI Commands (V2)

```bash
# Index lifecycle
npx wrangler vectorize create <name> --dimensions=N --metric=cosine|euclidean|dot-product
npx wrangler vectorize list
npx wrangler vectorize info <name>
npx wrangler vectorize delete <name>

# Metadata indexes
npx wrangler vectorize list-metadata-index <name>
npx wrangler vectorize create-metadata-index <name> --property-name=field --type=string|number|boolean
npx wrangler vectorize delete-metadata-index <name> --property-name=field

# Vector operations
npx wrangler vectorize insert <name> --file=embeddings.ndjson
npx wrangler vectorize get <name> --ids=id1,id2
npx wrangler vectorize delete-by-ids <name> --ids=id1,id2
```

## Bulk Upload (NDJSON)

```jsonl
{"id": "1", "values": [0.1, 0.2, ...], "metadata": {"category": "docs"}}
{"id": "2", "values": [0.4, 0.5, ...], "namespace": "tenant-abc"}
```

**Limits per file:** 5,000 vectors (V2), 100 MB max.

From Workers code, batch size is 1,000 vectors/call (V2). From the HTTP API, 5,000/call.

## Setup in CI (GitHub Actions)

There is no dashboard. To create indexes as part of your pipeline, run the CLI in an Actions job that uses a secret token. Example:

```yaml
name: Vectorize Index Setup
on: workflow_dispatch
jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Create index if missing
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          npx wrangler@latest vectorize list | grep -q "${{ inputs.index_name }}" \
            || npx wrangler@latest vectorize create "${{ inputs.index_name }}" \
                 --dimensions="${{ inputs.dimensions }}" \
                 --metric="${{ inputs.metric }}"
```

## Cardinality Best Practice

Bucket high-cardinality data (timestamps, IDs) before storing as metadata:

```typescript
// ❌ Millisecond timestamps → unique per write
metadata: { timestamp: Date.now() }

// ✅ 5-minute buckets → bounded cardinality
metadata: { timestamp_bucket: Math.floor(Date.now() / 300000) * 300000 }
```

## Production Checklist

1. Create index with correct dimensions + metric (immutable!)
2. Create metadata indexes FIRST
3. Test bulk upload (NDJSON) with sample data
4. Add `[[vectorize]]` binding to `wrangler.jsonc` per environment
5. Run `wrangler deploy --dry-run` to validate the binding locally
6. Deploy Worker
7. Verify queries against production endpoint
