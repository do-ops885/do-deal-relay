import { describe, expect, it } from "vitest";

import {
  collectFlagAuthors,
  MAX_REDDIT_FLAG_CANDIDATES,
} from "../../worker/lib/reddit-comments";

function comment(
  author: string,
  body: string,
  replies: unknown = "",
): Record<string, unknown> {
  return { kind: "t1", data: { author, body, replies } };
}

describe("collectFlagAuthors", () => {
  it("collectFlagAuthors should find qualifying comments in nested replies", () => {
    const listing = {
      data: {
        children: [
          comment("user_a", "Looks useful", {
            data: { children: [comment("user_b", "This deal is expired.")] },
          }),
        ],
      },
    };

    expect([...collectFlagAuthors(listing, "relay_bot")]).toEqual(["user_b"]);
  });

  it("collectFlagAuthors should deduplicate users and exclude the bot", () => {
    const listing = [
      comment("user_a", "expired"),
      comment("user_a", "dead"),
      comment("RELAY_BOT", "invalid"),
      comment("[deleted]", "404"),
    ];

    expect([...collectFlagAuthors(listing, "relay_bot")]).toEqual(["user_a"]);
  });

  it("collectFlagAuthors should reject ambiguous conversational mentions", () => {
    const listing = [
      comment("user_a", "Is this deal expired?"),
      comment("user_b", "The old code was invalid but this one works"),
      comment("user_c", "I claimed this offer"),
      comment("user_d", "This deal is not working."),
    ];

    expect([...collectFlagAuthors(listing, "relay_bot")]).toEqual(["user_d"]);
  });

  it("collectFlagAuthors should cap account-age lookup candidates", () => {
    const listing = Array.from(
      { length: MAX_REDDIT_FLAG_CANDIDATES + 5 },
      (_, index) => comment(`user_${index}`, "expired"),
    );

    expect(collectFlagAuthors(listing, "relay_bot").size).toBe(
      MAX_REDDIT_FLAG_CANDIDATES,
    );
  });
});
