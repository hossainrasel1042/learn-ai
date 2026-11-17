
CREATE TABLE IF NOT EXISTS public.quiz_battle_notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    match_id      UUID NOT NULL REFERENCES public.quiz_battle_matches(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('matched', 'opponent_answered', 'opponent_left', 'ended')),
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_notifications_user_unread
    ON public.quiz_battle_notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_battle_notifications_match
    ON public.quiz_battle_notifications (match_id);
