
BEGIN;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'community_posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format(
      'ALTER TABLE community_posts DROP CONSTRAINT %I',
      constraint_record.conname
    );
  END LOOP;
END
$$;

ALTER TABLE community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN ('theory', 'lab', 'general'));

UPDATE community_posts
  SET category = LOWER(category)
  WHERE category <> LOWER(category);

ALTER TABLE community_posts
  ALTER COLUMN category SET DEFAULT 'general';

COMMIT;