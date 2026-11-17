
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS chat_agent;

CREATE TABLE IF NOT EXISTS chat_agent.chats (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_agent_chats_user
  ON chat_agent.chats(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_agent_chats_user_updated
  ON chat_agent.chats(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_agent.messages (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID         NOT NULL REFERENCES chat_agent.chats(id) ON DELETE CASCADE,
  role        VARCHAR(20)  NOT NULL,
  content     TEXT         NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_agent_messages_chat
  ON chat_agent.messages(chat_id, created_at);