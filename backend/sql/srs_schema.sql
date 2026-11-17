
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS flashcard_decks (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL,
  title       TEXT         NOT NULL,
  description TEXT,
  source_type VARCHAR(40),
  source_id   UUID,
  card_count  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user
  ON flashcard_decks(user_id);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_updated
  ON flashcard_decks(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS flashcards (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id       UUID         NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  user_id       UUID         NOT NULL,
  front         TEXT         NOT NULL,
  back          TEXT         NOT NULL,
  tags          TEXT[]       NOT NULL DEFAULT '{}',

  ease_factor   REAL         NOT NULL DEFAULT 2.5,
  interval_days INTEGER      NOT NULL DEFAULT 0,
  repetitions   INTEGER      NOT NULL DEFAULT 0,
  due_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_reviewed TIMESTAMPTZ,

  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_due
  ON flashcards(user_id, due_at);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck
  ON flashcards(deck_id);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       UUID         NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  user_id       UUID         NOT NULL,
  rating        SMALLINT     NOT NULL,
  prev_interval INTEGER,
  new_interval  INTEGER,
  prev_ease     REAL,
  new_ease      REAL,
  reviewed_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card
  ON flashcard_reviews(card_id);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_time
  ON flashcard_reviews(user_id, reviewed_at DESC);
