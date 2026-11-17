


ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS friend_code TEXT;

COMMENT ON COLUMN public.profiles.friend_code IS
    '8-digit numeric friend code used for 1v1 battle invitations. Minted lazily on first read.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_friend_code_unique
    ON public.profiles (friend_code)
    WHERE friend_code IS NOT NULL;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_friend_code_format;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_friend_code_format
    CHECK (friend_code IS NULL OR friend_code ~ '^[0-9]{8}$');



DO $$ BEGIN
    CREATE TYPE quiz_battle_invite_status AS ENUM (
        'pending', 'accepted', 'declined', 'unavailable', 'expired'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.quiz_battle_invites (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,

    invitee_friend_code TEXT NOT NULL,

    status              quiz_battle_invite_status NOT NULL DEFAULT 'pending',

    match_id            UUID REFERENCES public.quiz_battle_matches(id) ON DELETE SET NULL,

    sender_level_score  INT,
    invitee_level_score INT,

    decided_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decline_reason      TEXT,

    expires_at          TIMESTAMPTZ NOT NULL,
    responded_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT quiz_battle_invites_distinct_players CHECK (sender_id <> invitee_id),
    CONSTRAINT quiz_battle_invites_decline_reason CHECK (
        status NOT IN ('declined', 'unavailable') OR decline_reason IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_invites_invitee_pending
    ON public.quiz_battle_invites (invitee_id, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_quiz_battle_invites_sender
    ON public.quiz_battle_invites (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_invites_expires
    ON public.quiz_battle_invites (expires_at)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_battle_invites_one_pending_pair
    ON public.quiz_battle_invites (sender_id, invitee_id)
    WHERE status = 'pending';



DO $$ BEGIN
    CREATE TYPE quiz_battle_invite_notification_kind AS ENUM (
        'invite',
        'invite_sent',
        'invite_declined',
        'invite_unavailable',
        'invite_expired',
        'invite_accepted'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.quiz_battle_invite_notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invite_id   UUID NOT NULL REFERENCES public.quiz_battle_invites(id) ON DELETE CASCADE,
    kind        quiz_battle_invite_notification_kind NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_battle_invite_notifications_user_unread
    ON public.quiz_battle_invite_notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_battle_invite_notifications_invite
    ON public.quiz_battle_invite_notifications (invite_id);
