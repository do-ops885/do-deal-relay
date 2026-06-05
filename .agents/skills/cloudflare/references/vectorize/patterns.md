# Vectorize Patterns

> **No dashboard UI.** Every pattern below assumes you have already created the index via `npx wrangler vectorize create <name> --dimensions=N --metric=cosine` (or in CI). There is no console-based way to inspect or modify indexes.

## Workers AI Integration

```typescript
// Generate embedding + query
const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] });
const matches = await env.VECTORIZE.query(result.data[0], { topK: 5 }); // Pass data[0]!
```

| Model                        | Dimensions        |
| ---------------------------- | ----------------- |
| `@cf/baai/bge-small-en-v1.5` | 384               |
| `@cf/baai/bge-base-en-v1.5`  | 768 (recommended) |
| `@cf/baai/bge-large-en-v1.5` | 1024              |

## OpenAI Integration

```typescript
const response = await openai.embeddings.create({
  model: "text-embedding-ada-002",
  input: query,
});
const matches = await env.VECTORIZE.query(response.data[0].embedding, {
  topK: 5,
});
```

## RAG Pattern

```typescript
// 1. Embed query
const emb = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] });

// 2. Search vectors
const matches = await env.VECTORIZE.query(emb.data[0], {
  topK: 5,
  returnMetadata: "indexed",
});

// 3. Fetch full docs from R2/D1/KV
const docs = await Promise.all(
  matches.matches.map((m) => env.R2.get(m.metadata.key).then((o) => o?.text())),
);

// 4. Generate with context
const answer = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
  prompt: `Context:\n${docs.filter(Boolean).join("\n\n")}\n\nQuestion: ${query}\n\nAnswer:`,
});
```

## Multi-Tenant

### Namespaces (< 50K tenants, fastest)

```typescript
await env.VECTORIZE.upsert([
  { id: "1", values: emb, namespace: `tenant-${id}` },
]);
await env.VECTORIZE.query(vec, { namespace: `tenant-${id}`, topK: 10 });
```

### Metadata Filter (> 50K tenants)

```bash
wrangler vectorize create-metadata-index my-index --property-name=tenantId --type=string
```

```typescript
await env.VECTORIZE.upsert([
  { id: "1", values: emb, metadata: { tenantId: id } },
]);
await env.VECTORIZE.query(vec, { filter: { tenantId: id }, topK: 10 });
```

## Hybrid Search

```typescript
const matches = await env.VECTORIZE.query(vec, {
  topK: 20,
  filter: {
    category: { $in: ["tech", "science"] },
    published: { $gte: lastMonthTimestamp },
  },
});
```

## Batch Ingestion (V2)

```typescript
const BATCH = 1000; // V2 limit for Workers API
for (let i = 0; i < vectors.length; i += BATCH) {
  await env.VECTORIZE.upsert(vectors.slice(i, i + BATCH));
}
```

## Best Practices

1. **Pass `data[0]`** not `data` or full response
2. **Batch 1,000** vectors per upsert (V2 Workers limit; 5,000 via HTTP API)
3. **Create metadata indexes** before inserting
4. **Use namespaces** for tenant isolation (faster than filters)
5. **`returnMetadata: "indexed"`** for best speed/data balance
6. **Handle 5-10s mutation delay** in async operations
7. **Create the index in CI** with `npx wrangler vectorize create` before `wrangler deploy` runs
