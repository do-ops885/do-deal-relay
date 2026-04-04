/**
 * Helper to fetch or perform async operations in batches to avoid platform limits (like Cloudflare subrequests).
 *
 * @param items Items to process
 * @param mapper Async function to apply to each item
 * @param batchSize Number of concurrent requests (default 25)
 * @returns Array of non-null results
 */
export async function fetchInBatches<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R | null | undefined | void>,
  batchSize: number = 25,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item) => mapper(item)));
    for (const res of batchResults) {
      if (res !== null && res !== undefined) {
        results.push(res as R);
      }
    }
  }
  return results;
}
