import type { Env, Deal } from "../types";
import { logger } from "./global-logger";
import { toError } from "./sanitize-error";

const DO_RPC_TIMEOUT_MS = 1000;
const MAX_MIRROR_DOMAINS = 10;

interface DealRegistryStub {
  stageDeals(
    deals: Array<{ id: string; source: string; title: string; data: string }>,
  ): Promise<number>;
  validateDeals(dealIds: string[]): Promise<number>;
  publishDeals(dealIds: string[]): Promise<number>;
}

interface SourceRegistryStub {
  evolveTrust(source_id: string, success: boolean): Promise<number>;
}

function getDealRegistryStub(env: Env): DealRegistryStub | undefined {
  const namespace = env.DEAL_REGISTRY;
  if (!namespace) return undefined;
  try {
    const objectId = namespace.idFromName("deals");
    return namespace.get(objectId) as unknown as DealRegistryStub;
  } catch {
    return undefined;
  }
}

function getSourceRegistryStub(env: Env): SourceRegistryStub | undefined {
  const namespace = env.SOURCE_REGISTRY;
  if (!namespace) return undefined;
  try {
    const objectId = namespace.idFromName("sources");
    return namespace.get(objectId) as unknown as SourceRegistryStub;
  } catch {
    return undefined;
  }
}

function raceWithTimeout<T>(operation: Promise<T>): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`DO mirror RPC timed out after ${DO_RPC_TIMEOUT_MS}ms`));
    }, DO_RPC_TIMEOUT_MS);
  });
  timeout.catch(() => undefined);
  operation.catch(() => undefined);
  return Promise.race([operation, timeout]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });
}

/**
 * Best-effort mirror of staged deals into DealRegistry DO.
 * KV snapshot remains canonical; DO failures are logged and never throw.
 */
export async function mirrorStageToDO(env: Env, deals: Deal[]): Promise<void> {
  const stub = getDealRegistryStub(env);
  if (!stub || deals.length === 0) return;
  try {
    const inputs = deals.map((d) => ({
      id: d.id,
      source: d.source.domain,
      title: d.title,
      data: JSON.stringify(d),
    }));
    const staged = await raceWithTimeout(stub.stageDeals(inputs));
    logger.debug("DealRegistry mirror staged", {
      component: "do-mirror",
      staged,
      total: deals.length,
    });
    const validatedIds = deals
      .filter((d) => d.metadata.status === "active")
      .map((d) => d.id);
    if (validatedIds.length > 0) {
      await raceWithTimeout(stub.validateDeals(validatedIds));
    }
  } catch (error) {
    logger.warn("DealRegistry stage mirror failed (non-critical)", {
      component: "do-mirror",
      error: toError(error).message,
    });
  }
}

/**
 * Best-effort mirror of publish transition into DealRegistry DO.
 * Never throws; publish canonical path is KV + GitHub.
 */
export async function mirrorPublishToDO(
  env: Env,
  dealIds: string[],
): Promise<void> {
  const stub = getDealRegistryStub(env);
  if (!stub || dealIds.length === 0) return;
  try {
    const published = await raceWithTimeout(stub.publishDeals(dealIds));
    logger.debug("DealRegistry mirror published", {
      component: "do-mirror",
      published,
      total: dealIds.length,
    });
  } catch (error) {
    logger.warn("DealRegistry publish mirror failed (non-critical)", {
      component: "do-mirror",
      error: toError(error).message,
    });
  }
}

/**
 * Best-effort mirror of trust outcomes into SourceRegistry DO.
 * D1 remains canonical; capped to respect subrequest budget.
 */
export async function mirrorTrustToDO(
  env: Env,
  outcomes: Map<string, boolean>,
): Promise<void> {
  const stub = getSourceRegistryStub(env);
  if (!stub || outcomes.size === 0) return;
  try {
    const entries = Array.from(outcomes.entries()).slice(0, MAX_MIRROR_DOMAINS);
    await Promise.all(
      entries.map(([domain, success]) =>
        raceWithTimeout(stub.evolveTrust(domain, success)).catch((error) => {
          logger.warn("SourceRegistry mirror single-domain failed", {
            component: "do-mirror",
            domain,
            error: toError(error).message,
          });
        }),
      ),
    );
  } catch (error) {
    logger.warn("SourceRegistry trust mirror failed (non-critical)", {
      component: "do-mirror",
      error: toError(error).message,
    });
  }
}
