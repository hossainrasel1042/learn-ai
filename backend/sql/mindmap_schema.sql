
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS mind_maps (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL,
  title        TEXT         NOT NULL,
  description  TEXT,
  source_type  VARCHAR(40),
  source_id    UUID,
  root_concept TEXT         NOT NULL,
  node_count   INTEGER      NOT NULL DEFAULT 0,
  graph_json   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mind_maps_user
  ON mind_maps(user_id);

CREATE INDEX IF NOT EXISTS idx_mind_maps_user_updated
  ON mind_maps(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mind_maps_graph_gin
  ON mind_maps USING GIN (graph_json jsonb_path_ops);
