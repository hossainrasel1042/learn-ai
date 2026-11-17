
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_xp (
  user_id     UUID         PRIMARY KEY,
  total_xp    INTEGER      NOT NULL DEFAULT 0,
  level       INTEGER      NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT user_xp_total_nonneg CHECK (total_xp >= 0),
  CONSTRAINT user_xp_level_pos    CHECK (level >= 1)
);

CREATE TABLE IF NOT EXISTS daily_streaks (
  user_id          UUID         PRIMARY KEY,
  current_streak   INTEGER      NOT NULL DEFAULT 0,
  longest_streak   INTEGER      NOT NULL DEFAULT 0,
  last_active_date DATE,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT daily_streaks_curr_nonneg CHECK (current_streak >= 0),
  CONSTRAINT daily_streaks_long_nonneg CHECK (longest_streak >= 0)
);

CREATE TABLE IF NOT EXISTS xp_events (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL,
  source      TEXT         NOT NULL,
  amount      INTEGER      NOT NULL,
  metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_date
  ON xp_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_source_date
  ON xp_events(user_id, source, ((created_at AT TIME ZONE 'UTC')::date));

CREATE TABLE IF NOT EXISTS badges (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT         UNIQUE NOT NULL,
  name         TEXT         NOT NULL,
  description  TEXT         NOT NULL,
  icon         TEXT         NOT NULL,
  threshold    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id    UUID         NOT NULL,
  badge_id   UUID         NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON user_badges(user_id);

INSERT INTO badges (code, name, description, icon, threshold) VALUES
  ('first-steps',     'First Steps',     'Earn your first XP',                       'sparkles',       '{"kind":"xp_total","value":1}'),
  ('week-warrior',    'Week Warrior',    'Maintain a 7-day study streak',            'flame',          '{"kind":"streak","value":7}'),
  ('monthly-master',  'Monthly Master',  'Maintain a 30-day study streak',           'crown',          '{"kind":"streak","value":30}'),
  ('level-5',         'Apprentice',      'Reach level 5',                            'award',          '{"kind":"level","value":5}'),
  ('level-10',        'Scholar',         'Reach level 10',                           'graduation-cap',  '{"kind":"level","value":10}'),
  ('card-collector',  'Card Collector',  'Complete 100 SRS card reviews',            'layers',         '{"kind":"srs_count","value":100}'),
  ('quiz-master',     'Quiz Master',     'Finish 10 quizzes with avg score >= 80%', 'check-circle',   '{"kind":"quiz_finished_avg","value":10}'),
  ('mapper',          'Cartographer',    'Generate 5 mind maps',                     'map',            '{"kind":"mindmap_count","value":5}')
ON CONFLICT (code) DO NOTHING;
