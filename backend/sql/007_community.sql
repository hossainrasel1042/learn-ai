
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS community_posts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID         NOT NULL,
  title         TEXT         NOT NULL,
  content       TEXT         NOT NULL,
  category      TEXT         NOT NULL DEFAULT 'general'
                              CHECK (category IN ('theory', 'lab', 'general')),
  course_topic  TEXT,
  is_resolved   BOOLEAN      NOT NULL DEFAULT FALSE,
  view_count    INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created
  ON community_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_author
  ON community_posts(author_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_category
  ON community_posts(category);

CREATE TABLE IF NOT EXISTS community_comments (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID         NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id         UUID,
  parent_id         UUID         REFERENCES community_comments(id) ON DELETE CASCADE,
  content           TEXT         NOT NULL,
  is_bot_reply      BOOLEAN      NOT NULL DEFAULT FALSE,
  mentioned_user_id UUID,
  bot_metadata      JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON community_comments(post_id, created_at);

CREATE INDEX IF NOT EXISTS idx_community_comments_author
  ON community_comments(author_id);

CREATE TABLE IF NOT EXISTS user_presence (
  user_id    UUID         PRIMARY KEY,
  last_seen  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  is_online  BOOLEAN      NOT NULL DEFAULT FALSE
);