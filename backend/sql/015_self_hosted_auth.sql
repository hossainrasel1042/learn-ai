

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS password_hash      TEXT,
    ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_login_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.password_hash IS
    'bcrypt hash of the account password. NULL means the account has no usable password.';
COMMENT ON COLUMN public.profiles.email_confirmed_at IS
    'When the account was confirmed. Accounts created in-house are active immediately.';


CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON public.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
    ON public.password_reset_tokens (expires_at);


DO $$
DECLARE
    missing integer;
BEGIN
    IF to_regclass('auth.users') IS NULL THEN
        RAISE NOTICE 'auth.users does not exist — skipping user import.';
        RETURN;
    END IF;

    INSERT INTO public.profiles (
        id, name, email, role, password_hash, email_confirmed_at, has_password
    )
    SELECT
        u.id,
        COALESCE(
            NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
            NULLIF(u.raw_user_meta_data ->> 'name', ''),
            split_part(u.email, '@', 1)
        ),
        lower(u.email),
        'user',
        u.encrypted_password,
        u.email_confirmed_at,
        TRUE
    FROM auth.users u
    WHERE u.encrypted_password IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.profiles p
           WHERE p.email = lower(u.email) AND p.id <> u.id
      )
    ON CONFLICT (id) DO UPDATE
    SET password_hash      = COALESCE(public.profiles.password_hash, EXCLUDED.password_hash),
        email_confirmed_at = COALESCE(public.profiles.email_confirmed_at, EXCLUDED.email_confirmed_at),
        has_password       = TRUE,
        name               = CASE
                                WHEN public.profiles.name IS NULL OR public.profiles.name = ''
                                    THEN EXCLUDED.name
                                ELSE public.profiles.name
                            END;

    RAISE NOTICE 'Imported Supabase auth users into public.profiles.';

    SELECT count(*) INTO missing FROM auth.users u
    WHERE u.encrypted_password IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.email = lower(u.email));

    IF missing > 0 THEN
        RAISE EXCEPTION
            'auth user import incomplete: % auth user(s) have no public.profiles row',
            missing;
    END IF;
END
$$;


ALTER TABLE public.admin_members
    DROP CONSTRAINT IF EXISTS admin_members_user_id_fkey;
ALTER TABLE public.admin_members
    ADD CONSTRAINT admin_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.course_materials
    DROP CONSTRAINT IF EXISTS course_materials_uploaded_by_fkey;
ALTER TABLE public.course_materials
    ADD CONSTRAINT course_materials_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.file_objects
    DROP CONSTRAINT IF EXISTS file_objects_user_id_fkey;
ALTER TABLE public.file_objects
    ADD CONSTRAINT file_objects_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.file_objects
    DROP CONSTRAINT IF EXISTS file_objects_uploaded_by_fkey;
ALTER TABLE public.file_objects
    ADD CONSTRAINT file_objects_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.quiz_battle_answers
    DROP CONSTRAINT IF EXISTS quiz_battle_answers_user_id_fkey;
ALTER TABLE public.quiz_battle_answers
    ADD CONSTRAINT quiz_battle_answers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_battle_matches
    DROP CONSTRAINT IF EXISTS quiz_battle_matches_player_one_fkey;
ALTER TABLE public.quiz_battle_matches
    ADD CONSTRAINT quiz_battle_matches_player_one_fkey
    FOREIGN KEY (player_one) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_battle_matches
    DROP CONSTRAINT IF EXISTS quiz_battle_matches_player_two_fkey;
ALTER TABLE public.quiz_battle_matches
    ADD CONSTRAINT quiz_battle_matches_player_two_fkey
    FOREIGN KEY (player_two) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_battle_matches
    DROP CONSTRAINT IF EXISTS quiz_battle_matches_winner_fkey;
ALTER TABLE public.quiz_battle_matches
    ADD CONSTRAINT quiz_battle_matches_winner_fkey
    FOREIGN KEY (winner) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.quiz_battle_notifications
    DROP CONSTRAINT IF EXISTS quiz_battle_notifications_user_id_fkey;
ALTER TABLE public.quiz_battle_notifications
    ADD CONSTRAINT quiz_battle_notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_battle_profiles
    DROP CONSTRAINT IF EXISTS quiz_battle_profiles_user_id_fkey;
ALTER TABLE public.quiz_battle_profiles
    ADD CONSTRAINT quiz_battle_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


DO $$
DECLARE
    admin_profile_id UUID;
    admin_email TEXT;
BEGIN
    admin_email := COALESCE(
        current_setting('learnai.admin_email', true),
        NULLIF(current_setting('admin_email', true), '')
    );

    IF admin_email IS NULL OR admin_email = '' THEN
        RAISE NOTICE 'admin_members bootstrap skipped: no admin email configured. Re-run with SET learnai.admin_email = ''you@example.com'' after registering that account.';
        RETURN;
    END IF;

    SELECT p.id INTO admin_profile_id
    FROM public.profiles p
    WHERE lower(p.email) = lower(admin_email);

    IF admin_profile_id IS NULL THEN
        RAISE NOTICE 'admin_members bootstrap skipped: no profile exists for %. Register that account first, then re-run this migration.', admin_email;
        RETURN;
    END IF;

    UPDATE public.admin_members
    SET user_id = admin_profile_id
    WHERE lower(email) = lower(admin_email)
      AND user_id <> admin_profile_id;

    INSERT INTO public.admin_members (user_id, email, role, permissions, status)
    VALUES (
        admin_profile_id,
        lower(admin_email),
        'admin',
        ARRAY['can_manage_members', 'can_manage_courses', 'can_view_audit'],
        'active'
    )
    ON CONFLICT (user_id) DO NOTHING;
END
$$;
