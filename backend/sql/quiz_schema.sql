
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS quiz_sets (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL,
  title          TEXT         NOT NULL,
  description    TEXT,
  source_type    VARCHAR(40),
  source_id      UUID,
  question_count INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sets_user
  ON quiz_sets(user_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sets_user_updated
  ON quiz_sets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_set_id  UUID         NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL,
  position     INTEGER      NOT NULL,
  prompt       TEXT         NOT NULL,
  option_a     TEXT         NOT NULL,
  option_b     TEXT         NOT NULL,
  option_c     TEXT         NOT NULL,
  option_d     TEXT         NOT NULL,
  correct      CHAR(1)      NOT NULL,
  explanation  TEXT,
  tags         TEXT[]       NOT NULL DEFAULT '{}',
  difficulty   VARCHAR(16),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_set
  ON quiz_questions(quiz_set_id, position);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_set_id      UUID         NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL,
  score            INTEGER      NOT NULL,
  total            INTEGER      NOT NULL,
  correct_count    INTEGER      NOT NULL,
  wrong_topics     TEXT[]       NOT NULL DEFAULT '{}',
  srs_deck_id      UUID         REFERENCES flashcard_decks(id) ON DELETE SET NULL,
  duration_seconds INTEGER,
  started_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user
  ON quiz_attempts(user_id, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_set
  ON quiz_attempts(quiz_set_id);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  UUID         NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID         NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL,
  selected    CHAR(1)      NOT NULL,
  is_correct  BOOLEAN      NOT NULL,
  time_seconds INTEGER,
  answered_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt
  ON quiz_answers(attempt_id, answered_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'quiz_answers_attempt_question_unique'
       AND conrelid = 'public.quiz_answers'::regclass
  ) THEN
    ALTER TABLE quiz_answers
      ADD CONSTRAINT quiz_answers_attempt_question_unique UNIQUE (attempt_id, question_id);
  END IF;
END
$$;
