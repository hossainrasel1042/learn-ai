

DO $$ BEGIN
    CREATE TYPE quiz_battle_status AS ENUM (
        'queued', 'in_progress', 'finished', 'cancelled', 'forfeited'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


CREATE TABLE IF NOT EXISTS public.quiz_battle_profiles (
    user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    wins           INT NOT NULL DEFAULT 0,
    losses         INT NOT NULL DEFAULT 0,
    draws          INT NOT NULL DEFAULT 0,
    level_score    INT NOT NULL DEFAULT 1000,
    last_match_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_profiles_level
    ON public.quiz_battle_profiles (level_score DESC);

DROP TRIGGER IF EXISTS trg_quiz_battle_profiles_updated_at ON public.quiz_battle_profiles;
CREATE TRIGGER trg_quiz_battle_profiles_updated_at
    BEFORE UPDATE ON public.quiz_battle_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.quiz_battle_matches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    player_one          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_two          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status              quiz_battle_status NOT NULL DEFAULT 'queued',
    winner              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ended_reason        TEXT,
    level_at_match_one  INT NOT NULL,
    level_at_match_two  INT NOT NULL,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quiz_battle_matches_distinct_players CHECK (player_one <> player_two)
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_matches_course_status
    ON public.quiz_battle_matches (course_id, status);
CREATE INDEX IF NOT EXISTS idx_quiz_battle_matches_player_one
    ON public.quiz_battle_matches (player_one);
CREATE INDEX IF NOT EXISTS idx_quiz_battle_matches_player_two
    ON public.quiz_battle_matches (player_two);

ALTER TABLE public.quiz_battle_matches
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_quiz_battle_matches_updated_at ON public.quiz_battle_matches;
CREATE TRIGGER trg_quiz_battle_matches_updated_at
    BEFORE UPDATE ON public.quiz_battle_matches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.quiz_battle_questions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id     UUID NOT NULL REFERENCES public.quiz_battle_matches(id) ON DELETE CASCADE,
    position     INT NOT NULL,
    prompt       TEXT NOT NULL,
    option_a     TEXT NOT NULL,
    option_b     TEXT NOT NULL,
    option_c     TEXT NOT NULL,
    option_d     TEXT NOT NULL,
    correct      CHAR(1) NOT NULL,
    explanation  TEXT,
    tags         TEXT[] NOT NULL DEFAULT '{}',
    difficulty   VARCHAR(16),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quiz_battle_questions_position_unique UNIQUE (match_id, position),
    CONSTRAINT quiz_battle_questions_correct_valid CHECK (correct IN ('A','B','C','D'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_questions_match
    ON public.quiz_battle_questions (match_id);


CREATE TABLE IF NOT EXISTS public.quiz_battle_answers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id      UUID NOT NULL REFERENCES public.quiz_battle_matches(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id   UUID NOT NULL REFERENCES public.quiz_battle_questions(id) ON DELETE CASCADE,
    selected      CHAR(1),
    is_correct    BOOLEAN,
    time_seconds  INT,
    answered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quiz_battle_answers_unique_submission UNIQUE (match_id, user_id, question_id),
    CONSTRAINT quiz_battle_answers_selected_valid CHECK (selected IS NULL OR selected IN ('A','B','C','D'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_answers_match_user
    ON public.quiz_battle_answers (match_id, user_id);
