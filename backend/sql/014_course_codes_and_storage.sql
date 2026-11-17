

ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS code TEXT;

DO $$
DECLARE
    r RECORD;
    d TEXT;
    suffix TEXT;
BEGIN
    FOR r IN
        SELECT id, course_no
        FROM public.courses
        WHERE code IS NULL
          AND course_no IS NOT NULL
    LOOP
        d := to_char(now() AT TIME ZONE 'UTC', 'DD');
        suffix := upper(substring(md5(random()::text) for 4));
        UPDATE public.courses
        SET code = lower(r.course_no) || '-' || d || '-' || suffix
        WHERE id = r.id;
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'courses'
          AND column_name  = 'code'
          AND is_nullable  = 'YES'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM public.courses WHERE code IS NULL) THEN
            ALTER TABLE public.courses ALTER COLUMN code SET NOT NULL;
        END IF;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_courses_code ON public.courses (code);

CREATE OR REPLACE FUNCTION public.courses_set_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    d TEXT;
    suffix TEXT;
BEGIN
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        d := to_char(now() AT TIME ZONE 'UTC', 'DD');
        suffix := upper(substring(md5(random()::text) for 4));
        NEW.code := lower(NEW.course_no) || '-' || d || '-' || suffix;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_set_code ON public.courses;
CREATE TRIGGER trg_courses_set_code
    BEFORE INSERT ON public.courses
    FOR EACH ROW
    EXECUTE FUNCTION public.courses_set_code();


CREATE TABLE IF NOT EXISTS public.file_objects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_key      TEXT NOT NULL UNIQUE,
    bucket          TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      BIGINT,
    checksum_sha256 TEXT,
    category        TEXT NOT NULL,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    material_id     UUID REFERENCES public.course_materials(id) ON DELETE SET NULL,
    job_id          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_objects_user     ON public.file_objects (user_id);
CREATE INDEX IF NOT EXISTS idx_file_objects_course   ON public.file_objects (course_id);
CREATE INDEX IF NOT EXISTS idx_file_objects_status   ON public.file_objects (status);
CREATE INDEX IF NOT EXISTS idx_file_objects_category ON public.file_objects (category);
CREATE INDEX IF NOT EXISTS idx_file_objects_job      ON public.file_objects (job_id);

DROP TRIGGER IF EXISTS trg_file_objects_set_updated_at ON public.file_objects;
CREATE TRIGGER trg_file_objects_set_updated_at
    BEFORE UPDATE ON public.file_objects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
