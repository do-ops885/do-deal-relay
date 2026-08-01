import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../worker/types";

const { sourceSaysExpiredMock, validatedFetchMock } = vi.hoisted(() => ({
  sourceSaysExpiredMock: vi.fn(),
  validatedFetchMock: vi.fn(),
}));

vi.mock("../../worker/lib/security", () => ({
  validatedFetch: validatedFetchMock,
}));

vi.mock("../../worker/lib/source-expiry", () => ({
  sourceSaysExpired: sourceSaysExpiredMock,
}));

vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { checkAndCleanPosts, submitPost } from "../../worker/reddit";

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

interface MockStatement {
  bind: (...params: unknown[]) => MockStatement;
  run: () => Promise<{ success: boolean }>;
  all: <T>() => Promise<{ results: T[] }>;
}

function createEnv(posts: unknown[] = []): {
  env: Env;
  executed: ExecutedStatement[];
} {
  const executed: ExecutedStatement[] = [];
  const prepare = vi.fn((sql: string): MockStatement => {
    let params: unknown[] = [];
    const statement: MockStatement = {
      bind: (...values: unknown[]) => {
        params = values;
        return statement;
      },
      run: async () => {
        executed.push({ sql, params });
        return { success: true };
      },
      all: async <T>() => ({ results: posts as T[] }),
    };
    return statement;
  });

  const env = {
    DEALS_DB: { prepare },
    REDDIT_CLIENT_ID: "client-id",
    REDDIT_CLIENT_SECRET: crypto.randomUUID(),
    REDDIT_USERNAME: "relay_bot",
    REDDIT_PASSWORD: crypto.randomUUID(),
    REDDIT_SUBREDDIT: "LLM_Deals",
    REDDIT_MIN_INVALID_COMMENTS: "2",
    REDDIT_SCORE_THRESHOLD: "0",
    REDDIT_LIFECYCLE_ENABLED: "true",
  } as unknown as Env;
  return { env, executed };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function trackedPost(): Record<string, unknown> {
  return {
    fullname: "t3_abc123",
    deal_id: "deal-1",
    source_url: "https://deals.example.com/offer",
  };
}

function postInfo(score: number, author = "relay_bot"): Response {
  return jsonResponse({
    data: {
      children: [
        {
          kind: "t3",
          data: { name: "t3_abc123", author, score },
        },
      ],
    },
  });
}

function deletedPostInfo(): Response {
  return jsonResponse({
    data: {
      children: [
        {
          kind: "t3",
          data: {
            name: "t3_abc123",
            author: "[deleted]",
            score: 0,
            selftext: "[deleted]",
            removed_by_category: "deleted",
          },
        },
      ],
    },
  });
}

describe("Reddit post lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceSaysExpiredMock.mockResolvedValue(false);
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(postInfo(1));
      }
      if (url.includes("/comments/")) {
        return Promise.resolve(jsonResponse([{}, { data: { children: [] } }]));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
  });

  it("checkAndCleanPosts should skip when Reddit is not configured", async () => {
    const { env } = createEnv();
    env.REDDIT_PASSWORD = undefined;

    const result = await checkAndCleanPosts(env);

    expect(result).toEqual({
      checked: 0,
      deleted: 0,
      skipped: true,
      errors: 0,
    });
    expect(validatedFetchMock).not.toHaveBeenCalled();
  });

  it("checkAndCleanPosts should delete a post with negative score", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    let deleted = false;
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(deleted ? deletedPostInfo() : postInfo(-1));
      }
      if (url.includes("api/del")) deleted = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result.deleted).toBe(1);
    expect(executed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("status = 'deleted'"),
          params: expect.arrayContaining(["negative_score:-1", "t3_abc123"]),
        }),
      ]),
    );
    expect(sourceSaysExpiredMock).not.toHaveBeenCalled();
  });

  it("checkAndCleanPosts should use the direct source expiry trigger", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    sourceSaysExpiredMock.mockResolvedValue(true);
    let deleted = false;
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(deleted ? deletedPostInfo() : postInfo(1));
      }
      if (url.includes("api/del")) deleted = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result.deleted).toBe(1);
    expect(
      executed.some((entry) => entry.params.includes("source_expired")),
    ).toBe(true);
    expect(validatedFetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/comments/"),
      expect.anything(),
    );
  });

  it("checkAndCleanPosts should require unique established flaggers", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    const oldAccount = Date.now() / 1000 - 8 * 86_400;
    let deleted = false;
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(deleted ? deletedPostInfo() : postInfo(1));
      }
      if (url.includes("/comments/")) {
        return Promise.resolve(
          jsonResponse([
            {},
            {
              data: {
                children: [
                  { kind: "t1", data: { author: "user_a", body: "expired" } },
                  { kind: "t1", data: { author: "user_a", body: "dead" } },
                  {
                    kind: "t1",
                    data: { author: "relay_bot", body: "not working" },
                  },
                  {
                    kind: "t1",
                    data: { author: "user_b", body: "it doesn't work" },
                  },
                ],
              },
            },
          ]),
        );
      }
      if (url.includes("/user/")) {
        return Promise.resolve(
          jsonResponse({ data: { created_utc: oldAccount } }),
        );
      }
      if (url.includes("api/del")) deleted = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result.deleted).toBe(1);
    expect(
      executed.some((entry) => entry.params.includes("community_flagged:2")),
    ).toBe(true);
    const userLookups = validatedFetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/user/"),
    );
    expect(userLookups).toHaveLength(2);
  });

  it("checkAndCleanPosts should not persist deletion after Reddit rejects it", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(postInfo(-1));
      }
      return Promise.resolve(new Response(null, { status: 503 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result).toMatchObject({ checked: 1, deleted: 0, errors: 1 });
    expect(
      executed.some((entry) => entry.sql.includes("status = 'deleted'")),
    ).toBe(false);
  });

  it("checkAndCleanPosts should not trust an unconfirmed 200 deletion", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) return Promise.resolve(postInfo(-1));
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result).toMatchObject({ deleted: 0, errors: 1 });
    expect(
      executed.some((entry) => entry.sql.includes("status = 'deleted'")),
    ).toBe(false);
  });

  it("checkAndCleanPosts should not trust an empty deletion read-back", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    let deleted = false;
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(
          deleted ? jsonResponse({ data: { children: [] } }) : postInfo(-1),
        );
      }
      if (url.includes("api/del")) deleted = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result).toMatchObject({ deleted: 0, errors: 1 });
    expect(
      executed.some((entry) => entry.sql.includes("status = 'deleted'")),
    ).toBe(false);
  });

  it("checkAndCleanPosts should require a complete deletion tombstone", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    let deleted = false;
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(
          deleted ? postInfo(0, "[deleted]") : postInfo(-1),
        );
      }
      if (url.includes("api/del")) deleted = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result).toMatchObject({ deleted: 0, errors: 1 });
    expect(
      executed.some((entry) => entry.sql.includes("status = 'deleted'")),
    ).toBe(false);
  });

  it("checkAndCleanPosts should reject malformed destructive thresholds", async () => {
    const { env } = createEnv([trackedPost()]);
    env.REDDIT_SCORE_THRESHOLD = "100junk";

    await expect(checkAndCleanPosts(env)).rejects.toThrow(
      "REDDIT_SCORE_THRESHOLD must be an integer",
    );
    expect(validatedFetchMock).not.toHaveBeenCalled();
  });

  it("checkAndCleanPosts should reject a tracked post owned by another user", async () => {
    const { env, executed } = createEnv([trackedPost()]);
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      if (url.includes("api/info")) {
        return Promise.resolve(postInfo(-1, "another_user"));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await checkAndCleanPosts(env);

    expect(result).toMatchObject({ deleted: 0, errors: 1 });
    expect(
      executed.some((entry) => entry.sql.includes("status = 'deleted'")),
    ).toBe(false);
  });

  it("submitPost should persist a confirmed Reddit fullname", async () => {
    const { env, executed } = createEnv();
    validatedFetchMock.mockImplementation((url: string) => {
      if (url.includes("access_token")) {
        return Promise.resolve(jsonResponse({ access_token: "token" }));
      }
      return Promise.resolve(
        jsonResponse({ json: { errors: [], data: { name: "t3_new123" } } }),
      );
    });

    await expect(submitPost(env, "A deal", "Details", "deal-1")).resolves.toBe(
      "t3_new123",
    );
    expect(
      executed.some((entry) => entry.sql.includes("INSERT INTO reddit_posts")),
    ).toBe(true);
  });
});
