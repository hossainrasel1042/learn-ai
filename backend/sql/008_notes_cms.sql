
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS courses (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL,
  course_no   TEXT         UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT         UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS course_materials (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT         NOT NULL,
  description TEXT,
  type        TEXT         NOT NULL,
  file_type   TEXT         NOT NULL,
  url         TEXT         NOT NULL,
  week        INTEGER,
  metadata    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_materials_course
  ON course_materials(course_id);

CREATE INDEX IF NOT EXISTS idx_course_materials_updated
  ON course_materials(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_materials_course_type
  ON course_materials(course_id, type);

CREATE TABLE IF NOT EXISTS material_tags (
  material_id UUID         NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
  tag_id      UUID         NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (material_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_material_tags_tag
  ON material_tags(tag_id);