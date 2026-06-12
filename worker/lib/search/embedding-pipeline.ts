import type { Env } from "../../types";
import type { Deal } from "../../types";
import type { DealVector, DealEmbeddingMetadata } from "./types";
import { upsertDealVectors } from "./client";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const BATCH_SIZE = 100;

function dealToEmbeddingText(deal: Deal): string {
  const parts = [
    deal.title,
    deal.description,
    deal.code,
    deal.reward.type,
    (deal.metadata.category || []).join(" "),
    (deal.metadata.tags || []).join(" "),
  ];
  return parts.filter(Boolean).join(" ");
}

function dealToVector(
  deal: Deal,
  embedding: number[],
): DealVector {
  const createdAtBucket =
    Math.floor(new Date(deal.source.discovered_at).getTime() / 300000) * 300000;

  const metadata: DealEmbeddingMetadata = {
    deal_id: deal.id,
    domain: deal.source.domain,
    category: deal.metadata.category || [],
    tags: deal.metadata.tags || [],
    status: deal.metadata.status,
    reward_type: deal.reward.type,
    created_at_bucket: createdAtBucket,
  };

  return {
    id: deal.id,
    values: embedding,
    namespace: "prod",
    metadata,
  };
}

export interface BatchEmbeddingResult {
  total: number;
  successful: number;
  failed: number;
  duration_ms: number;
}

export async function generateDealEmbeddings(
  env: Env,
  deals: Deal[],
): Promise<BatchEmbeddingResult> {
  const start = Date.now();
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const batch = deals.slice(i, i + BATCH_SIZE);
    const texts = batch.map(dealToEmbeddingText);

    try {
      if (!env.AI) {
        failed += batch.length;
        continue;
      }

      const result = (await (env.AI.run as (model: string, inputs: unknown) => Promise<unknown>)(
        EMBEDDING_MODEL,
        { text: texts },
      )) as { data?: number[][] };

      if (!Array.isArray(result.data) || result.data.length !== batch.length) {
        failed += batch.length;
        continue;
      }

      const vectors: DealVector[] = batch.map((deal, idx) => {
        const embedding = result.data![idx];
        return dealToVector(deal, embedding!);
      });

      await upsertDealVectors(env, vectors, "prod");
      successful += batch.length;
    } catch {
      failed += batch.length;
    }
  }

  return {
    total: deals.length,
    successful,
    failed,
    duration_ms: Date.now() - start,
  };
}
