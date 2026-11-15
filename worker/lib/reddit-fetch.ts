import { parseTrustedEgressHosts } from "./egress-policy";
import { validatedFetch } from "./security";
import { createTimeoutSignal } from "./utils";

export const REDDIT_EGRESS_HOSTS = parseTrustedEgressHosts(
  "www.reddit.com,oauth.reddit.com",
);

export async function validatedRedditFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const { signal, cleanup } = createTimeoutSignal(timeoutMs);
  try {
    return await validatedFetch(
      url,
      { ...init, redirect: "error", signal },
      REDDIT_EGRESS_HOSTS,
    );
  } finally {
    cleanup();
  }
}
