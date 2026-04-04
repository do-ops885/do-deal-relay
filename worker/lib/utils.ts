import { CONFIG } from "../config";

/**
 * Fetches or performs async operations in batches to avoid platform limits
 * (like Cloudflare Workers' 50 subrequest limit per request).
 *
 * Uses Promise.allSettled for graceful handling of partial failures.
 * Failed operations are logged but don't fail the entire batch.
 *
 * @template T The type of input items
 * @template R The type of results
 * @param items Array of items to process
 * @param mapper Async function to apply to each item. Should return null/undefined for "not found" and throw for errors.
 * @param batchSize Number of concurrent operations per batch (default: CONFIG.KV_BATCH_SIZE)
 * @returns Array of successful non-null results
 *
 * @example
 * const entries = await fetchInBatches<string, LogEntry>(
 *   keys,
 *   (key) => env.DEALS_LOG.get<LogEntry>(key, "json"),
 *   25
 * );
 */
export async function fetchInBatches<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R | null | undefined>,
  batchSize: number = CONFIG.KV_BATCH_SIZE,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Use allSettled to handle partial failures gracefully
    const batchResults = await Promise.allSettled(
      batch.map((item) => mapper(item)),
    );

    batchResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const value = result.value;
        if (value !== null && value !== undefined) {
          results.push(value as R);
        }
      } else {
        // Log the error but continue processing other items
        console.error(
          `Batch operation failed for item at index ${i + index}:`,
          result.reason,
        );
      }
    });
  }

  return results;
}

/**
 * Performs async write/delete operations in batches.
 * Unlike fetchInBatches, this waits for all operations to complete
 * and returns counts of success/failure.
 *
 * @template T The type of input items
 * @param items Array of items to process
 * @param operation Async function to apply to each item (e.g., delete, put)
 * @param batchSize Number of concurrent operations per batch
 * @returns Object with success and failure counts
 *
 * @example
 * const result = await executeInBatches<KVKey>(
 *   keys,
 *   (key) => env.DEALS_STAGING.delete(key.name)
 * );
 * console.log(`Deleted ${result.success} keys, ${result.failed} failures`);
 */
export async function executeInBatches<T>(
  items: T[],
  operation: (item: T) => Promise<void | unknown>,
  batchSize: number = CONFIG.KV_BATCH_SIZE,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map((item) => operation(item)),
    );

    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        success++;
      } else {
        failed++;
        console.error("Batch operation failed:", result.reason);
      }
    });
  }

  return { success, failed };
}

/**
 * Chunks an array into smaller arrays of specified size.
 * Utility function for manual batch processing.
 *
 * @template T The type of array items
 * @param array Array to chunk
 * @param size Size of each chunk
 * @returns Array of chunks
 *
 * @example
 * const chunks = chunkArray([1, 2, 3, 4, 5], 2);
 * // Returns: [[1, 2], [3, 4], [5]]
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retries an async operation with exponential backoff.
 *
 * @template T The return type of the operation
 * @param operation The async operation to retry
 * @param maxRetries Maximum number of retry attempts
 * @param delayMs Initial delay in milliseconds
 * @returns Result of the operation
 * @throws Last error if all retries fail
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetchData(),
 *   3,
 *   1000
 * );
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = CONFIG.MAX_RETRIES,
  delayMs: number = CONFIG.RETRY_DELAY_MS,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const backoffDelay = Math.min(
          delayMs * Math.pow(2, attempt),
          CONFIG.MAX_RETRY_DELAY_MS,
        );
        console.warn(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${backoffDelay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError;
}
