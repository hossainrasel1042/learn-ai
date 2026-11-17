

DO $$ BEGIN
    CREATE TYPE admin_role AS ENUM ('admin', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE admin_status AS ENUM ('active', 'suspended', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


CREATE TABLE IF NOT EXISTS public.admin_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL CHECK (email = lower(email)),
    role            admin_role NOT NULL DEFAULT 'moderator',
    permissions     TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (permissions <@ ARRAY['can_manage_members','can_manage_courses','can_view_audit']),
    status          admin_status NOT NULL DEFAULT 'active',
    created_by      UUID REFERENCES public.admin_members(id) ON DELETE SET NULL,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_members_status ON public.admin_members (status);
CREATE INDEX IF NOT EXISTS idx_admin_members_role   ON public.admin_members (role);
CREATE INDEX IF NOT EXISTS idx_admin_members_email_lower ON public.admin_members (lower(email));

DROP TRIGGER IF EXISTS trg_admin_members_updated_at ON public.admin_members;
CREATE TRIGGER trg_admin_members_updated_at
    BEFORE UPDATE ON public.admin_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    member_id   UUID NOT NULL REFERENCES public.admin_members(id) ON DELETE CASCADE,
    event       TEXT NOT NULL,
    ip          INET,
    user_agent  TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_member
    ON public.admin_audit_log (member_id, created_at DESC);


ALTER TABLE public.course_materials
    ADD COLUMN IF NOT EXISTS uploaded_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_course_materials_uploaded_by
    ON public.course_materials (uploaded_by);


DO $$
DECLARE
    admin_email TEXT;
BEGIN
    admin_email := COALESCE(
        current_setting('learnai.admin_email', true),
        NULLIF(current_setting('admin_email', true), '')
    );

    IF admin_email IS NULL OR admin_email = '' THEN
        RAISE NOTICE 'admin_members bootstrap skipped: no admin email configured. Re-run with SET learnai.admin_email = ''you@example.com''.';
        RETURN;
    END IF;

    INSERT INTO public.admin_members (user_id, email, role, permissions, status)
    VALUES (
        '00000000-0000-0000-0000-000000000001'::uuid,
        lower(admin_email),
        'admin',
        ARRAY['can_manage_members','can_manage_courses','can_view_audit'],
        'active'
    )
    ON CONFLICT (user_id) DO NOTHING;
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE 'admin_members bootstrap row blocked: the placeholder UUID does not exist yet. Create that account, then UPDATE admin_members SET user_id = ''<REAL_UUID>'' WHERE email = ''%''.', admin_email;
END
$$;