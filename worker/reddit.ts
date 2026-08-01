import type { Env } from "./types";
import { VERSION } from "./version";
import { logger } from "./lib/global-logger";
import { validatedFetch } from "./lib/security";
import { toError } from "./lib/sanitize-error";
import { createTimeoutSignal } from "./lib/utils";
import { sourceSaysExpired } from "./lib/source-expiry";
import { parseBoundedIntegerConfig } from "./lib/config-utils";
import {
  collectFlagAuthors,
  MAX_REDDIT_FLAG_CANDIDATES,
} from "./lib/reddit-comments";

const DEFAULT_MIN_INVALID_COMMENTS = 2;
const DEFAULT_SCORE_THRESHOLD = 0;
const MIN_ACCOUNT_AGE_DAYS = 7;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 86_400;
const MAX_POSTS_PER_RUN = 1;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDDIT_TITLE_LENGTH = 300;
const MIN_SCORE_THRESHOLD = -100;
const MAX_SCORE_THRESHOLD = 0;
const REDDIT_FULLNAME_PATTERN = /^t3_[a-z0-9]+$/;
const REDDIT_USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{2,21}$/;

interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  subreddit: string;
}

interface TrackedRedditPost {
  fullname: string;
  deal_id: string;
  source_url: string | null;
}

interface RedditPostState {
  fullname: string;
  author: string;
  score: number;
  selftext: string | null;
  removedByCategory: string | null;
}

export interface RedditCleanupSummary {
  checked: number;
  deleted: number;
  skipped: boolean;
  errors: number;
}

function getCredentials(env: Env): RedditCredentials | null {
  if (env.REDDIT_LIFECYCLE_ENABLED !== "true") return null;
  const values = {
    clientId: env.REDDIT_CLIENT_ID?.trim(),
    clientSecret: env.REDDIT_CLIENT_SECRET?.trim(),
    username: env.REDDIT_USERNAME?.trim(),
    password: env.REDDIT_PASSWORD,
    subreddit: env.REDDIT_SUBREDDIT?.trim(),
  };

  if (
    !values.clientId ||
    !values.clientSecret ||
    !values.username ||
    !values.password ||
    !values.subreddit
  ) {
    return null;
  }
  if (!SUBREDDIT_PATTERN.test(values.subreddit)) {
    throw new Error("Invalid REDDIT_SUBREDDIT configuration");
  }
  if (!REDDIT_USERNAME_PATTERN.test(values.username)) {
    throw new Error("Invalid REDDIT_USERNAME configuration");
  }
  return {
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    username: values.username,
    password: values.password,
    subreddit: values.subreddit,
  };
}

function getUserAgent(credentials: RedditCredentials): string {
  return `cloudflare:do-deal-relay:${VERSION} (by /u/${credentials.username})`;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const { signal, cleanup } = createTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await validatedFetch(url, {
      ...init,
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `Reddit API request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as unknown;
  } finally {
    cleanup();
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getNestedRecord(
  value: unknown,
  ...keys: string[]
): Record<string, unknown> | null {
  let current = asRecord(value);
  for (const key of keys) {
    current = asRecord(current?.[key]);
    if (!current) return null;
  }
  return current;
}

function getRedditErrors(value: unknown): unknown[] {
  const json = getNestedRecord(value, "json");
  return Array.isArray(json?.errors) ? json.errors : [];
}

async function getAccessToken(credentials: RedditCredentials): Promise<string> {
  const data = await fetchJson("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getUserAgent(credentials),
    },
    body: new URLSearchParams({
      grant_type: "password",
      username: credentials.username,
      password: credentials.password,
      scope: "read submit edit",
    }),
  });
  const token = asRecord(data)?.access_token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Reddit OAuth response did not include an access token");
  }
  return token;
}

function getOAuthHeaders(
  credentials: RedditCredentials,
  token: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": getUserAgent(credentials),
  };
}

export async function submitPost(
  env: Env,
  title: string,
  text: string,
  dealId: string,
): Promise<string> {
  const credentials = getCredentials(env);
  if (!credentials) throw new Error("Reddit integration is not configured");
  const normalizedTitle = title.trim();
  if (
    normalizedTitle.length === 0 ||
    normalizedTitle.length > MAX_REDDIT_TITLE_LENGTH
  ) {
    throw new Error("Reddit title must contain between 1 and 300 characters");
  }

  const token = await getAccessToken(credentials);
  const data = await fetchJson("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      ...getOAuthHeaders(credentials, token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      api_type: "json",
      sr: credentials.subreddit,
      kind: "self",
      title: normalizedTitle,
      text,
      resubmit: "false",
      raw_json: "1",
    }),
  });
  if (getRedditErrors(data).length > 0) {
    throw new Error("Reddit rejected the post submission");
  }
  const fullname = getNestedRecord(data, "json", "data")?.name;
  if (typeof fullname !== "string" || !REDDIT_FULLNAME_PATTERN.test(fullname)) {
    throw new Error(
      "Reddit submission response did not include a post fullname",
    );
  }

  try {
    await env.DEALS_DB.prepare(
      `INSERT INTO reddit_posts (fullname, deal_id, subreddit, posted_at, status)
       VALUES (?, ?, ?, ?, 'active')`,
    )
      .bind(fullname, dealId, credentials.subreddit, Date.now())
      .run();
  } catch (error) {
    try {
      await requestRedditDeletion(credentials, token, fullname);
    } catch (cleanupError) {
      logger.error("Failed to remove untracked Reddit post", {
        component: "reddit",
        fullname,
        error_message: toError(cleanupError).message,
      });
    }
    throw error;
  }
  return fullname;
}

function getPostState(value: unknown): RedditPostState | null {
  const data = getNestedRecord(value, "data");
  const children = data?.children;
  if (!Array.isArray(children)) return null;
  const child = asRecord(children[0]);
  const post = asRecord(child?.data);
  if (
    child?.kind !== "t3" ||
    typeof post?.name !== "string" ||
    typeof post.author !== "string" ||
    typeof post.score !== "number"
  ) {
    return null;
  }
  return {
    fullname: post.name,
    author: post.author,
    score: post.score,
    selftext: typeof post.selftext === "string" ? post.selftext : null,
    removedByCategory:
      typeof post.removed_by_category === "string"
        ? post.removed_by_category
        : null,
  };
}

async function isEstablishedAccount(
  credentials: RedditCredentials,
  token: string,
  username: string,
): Promise<boolean> {
  const data = await fetchJson(
    `https://oauth.reddit.com/user/${encodeURIComponent(username)}/about?raw_json=1`,
    { headers: getOAuthHeaders(credentials, token) },
  );
  const createdUtc = getNestedRecord(data, "data")?.created_utc;
  if (typeof createdUtc !== "number") return false;
  const accountAgeDays =
    (Date.now() / MILLISECONDS_PER_SECOND - createdUtc) / SECONDS_PER_DAY;
  return accountAgeDays >= MIN_ACCOUNT_AGE_DAYS;
}

async function hasCommunityConsensus(
  post: TrackedRedditPost,
  credentials: RedditCredentials,
  token: string,
  minimum: number,
): Promise<boolean> {
  const articleId = post.fullname.replace(/^t3_/, "");
  const comments = await fetchJson(
    `https://oauth.reddit.com/comments/${articleId}?limit=100&depth=10&raw_json=1`,
    { headers: getOAuthHeaders(credentials, token) },
  );
  const candidates = collectFlagAuthors(comments, credentials.username);
  let establishedFlags = 0;
  for (const username of candidates) {
    if (await isEstablishedAccount(credentials, token, username)) {
      establishedFlags += 1;
      if (establishedFlags >= minimum) return true;
    }
  }
  return false;
}

async function requestRedditDeletion(
  credentials: RedditCredentials,
  token: string,
  fullname: string,
): Promise<void> {
  const { signal, cleanup } = createTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await validatedFetch("https://oauth.reddit.com/api/del", {
      method: "POST",
      redirect: "error",
      headers: {
        ...getOAuthHeaders(credentials, token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ id: fullname }),
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `Reddit delete request failed with status ${response.status}`,
      );
    }
  } finally {
    cleanup();
  }
}

async function confirmRedditDeletion(
  credentials: RedditCredentials,
  token: string,
  fullname: string,
): Promise<void> {
  const info = await fetchJson(
    `https://oauth.reddit.com/api/info?id=${encodeURIComponent(fullname)}&raw_json=1`,
    { headers: getOAuthHeaders(credentials, token) },
  );
  const state = getPostState(info);
  if (
    state?.fullname === fullname &&
    state.author.toLowerCase() === "[deleted]" &&
    state.selftext?.toLowerCase() === "[deleted]" &&
    state.removedByCategory?.toLowerCase() === "deleted"
  ) {
    return;
  }
  throw new Error("Reddit deletion could not be confirmed");
}

async function deletePost(
  env: Env,
  credentials: RedditCredentials,
  token: string,
  fullname: string,
  reason: string,
): Promise<void> {
  await requestRedditDeletion(credentials, token, fullname);
  await confirmRedditDeletion(credentials, token, fullname);

  const now = Date.now();
  await env.DEALS_DB.prepare(
    `UPDATE reddit_posts
     SET status = 'deleted', delete_reason = ?, deleted_at = ?, last_checked_at = ?
     WHERE fullname = ? AND status = 'active'`,
  )
    .bind(reason, now, now, fullname)
    .run();
  logger.info("Deleted expired Reddit post", {
    component: "reddit",
    fullname,
    reason,
  });
}

async function markChecked(env: Env, fullname: string): Promise<void> {
  await env.DEALS_DB.prepare(
    "UPDATE reddit_posts SET last_checked_at = ? WHERE fullname = ?",
  )
    .bind(Date.now(), fullname)
    .run();
}

export async function checkAndCleanPosts(
  env: Env,
): Promise<RedditCleanupSummary> {
  const credentials = getCredentials(env);
  if (!credentials) {
    logger.info("Reddit moderation skipped; integration is not configured", {
      component: "reddit",
    });
    return { checked: 0, deleted: 0, skipped: true, errors: 0 };
  }

  const minimumFlags = parseBoundedIntegerConfig(
    "REDDIT_MIN_INVALID_COMMENTS",
    env.REDDIT_MIN_INVALID_COMMENTS,
    DEFAULT_MIN_INVALID_COMMENTS,
    DEFAULT_MIN_INVALID_COMMENTS,
    MAX_REDDIT_FLAG_CANDIDATES,
  );
  const scoreThreshold = parseBoundedIntegerConfig(
    "REDDIT_SCORE_THRESHOLD",
    env.REDDIT_SCORE_THRESHOLD,
    DEFAULT_SCORE_THRESHOLD,
    MIN_SCORE_THRESHOLD,
    MAX_SCORE_THRESHOLD,
  );
  const posts = await env.DEALS_DB.prepare(
    `SELECT rp.fullname, rp.deal_id, COALESCE(d.source_url, d.url) AS source_url
     FROM reddit_posts rp
     LEFT JOIN deals d ON d.deal_id = rp.deal_id
     WHERE rp.status = 'active'
     ORDER BY rp.last_checked_at IS NOT NULL, rp.last_checked_at ASC
     LIMIT ?`,
  )
    .bind(MAX_POSTS_PER_RUN)
    .all<TrackedRedditPost>();
  const token = await getAccessToken(credentials);
  let deleted = 0;
  let errors = 0;

  for (const post of posts.results) {
    try {
      const info = await fetchJson(
        `https://oauth.reddit.com/api/info?id=${encodeURIComponent(post.fullname)}&raw_json=1`,
        { headers: getOAuthHeaders(credentials, token) },
      );
      const state = getPostState(info);
      if (!state) continue;
      if (
        state.fullname !== post.fullname ||
        state.author.toLowerCase() !== credentials.username.toLowerCase()
      ) {
        throw new Error("Tracked Reddit post ownership mismatch");
      }
      if (state.score < scoreThreshold) {
        await deletePost(
          env,
          credentials,
          token,
          post.fullname,
          `negative_score:${state.score}`,
        );
        deleted += 1;
        continue;
      }
      if (await sourceSaysExpired(post.source_url)) {
        await deletePost(
          env,
          credentials,
          token,
          post.fullname,
          "source_expired",
        );
        deleted += 1;
        continue;
      }
      if (await hasCommunityConsensus(post, credentials, token, minimumFlags)) {
        await deletePost(
          env,
          credentials,
          token,
          post.fullname,
          `community_flagged:${minimumFlags}`,
        );
        deleted += 1;
      }
    } catch (error) {
      errors += 1;
      logger.error("Reddit post moderation check failed", {
        component: "reddit",
        fullname: post.fullname,
        error_message: toError(error).message,
      });
    } finally {
      try {
        await markChecked(env, post.fullname);
      } catch (error) {
        errors += 1;
        logger.error("Failed to update Reddit moderation checkpoint", {
          component: "reddit",
          fullname: post.fullname,
          error_message: toError(error).message,
        });
      }
    }
  }

  return {
    checked: posts.results.length,
    deleted,
    skipped: false,
    errors,
  };
}
