/* tsqllint-disable set-quoted-identifier */
-- Reddit posts created by do-deal-relay and their lifecycle state.
CREATE TABLE IF NOT EXISTS reddit_posts (
  id INTEGER PRIMARY KEY,
  fullname TEXT NOT NULL UNIQUE CHECK(substr(fullname, 1, 3) = 't3_'),
  deal_id TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'deleted')),
  delete_reason TEXT,
  deleted_at INTEGER,
  last_checked_at INTEGER,
  CHECK(
    (status = 'active' AND delete_reason IS NULL AND deleted_at IS NULL)
    OR
    (status = 'deleted' AND delete_reason IS NOT NULL AND deleted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reddit_posts_status_checked
  ON reddit_posts(status, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_deal_id
  ON reddit_posts(deal_id);
