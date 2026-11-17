# Database Schema — LearnAI

PostgreSQL with the `pgvector` extension. Two schemas hold application tables:

| Schema | Tables | Contents |
|---|---|---|
| `public` | 31 | Identity, courses and content, community, quizzes, spaced repetition, mind maps, gamification, admin RBAC, quiz battle |
| `chat_agent` | 2 | LangGraph chat threads and messages |

**Total: 33 tables.**

---

## How the schema is built

Migrations live in `backend/sql/` and are applied in filename order by the deploy job. They are plain SQL — no ORM, no migration runner, no `schema_migrations` bookkeeping table. The running Postgres instance is the source of truth; this document describes what is deployed there.

| Migration | Creates |
|---|---|
| `006_chat_agent.sql` | `chat_agent.chats`, `chat_agent.messages` |
| `007_community.sql` | `community_posts`, `community_comments`, `user_presence` |
| `008_notes_cms.sql` | `courses`, `tags`, `course_materials`, `material_tags`, `notes` |
| `009_community_category_lowercase.sql` | Normalises `community_posts.category` to lowercase |
| `010_profiles.sql` | `public.profiles` |
| `011_admin_rbac.sql` | `public.admin_members`, `public.admin_audit_log` |
| `012_quiz_battle.sql` | `public.quiz_battle_profiles`, `_matches`, `_questions`, `_answers` |
| `013_battle_notifications.sql` | `public.quiz_battle_notifications` |
| `014_course_codes_and_storage.sql` | `public.file_objects`, adds course-code columns |
| `015_self_hosted_auth.sql` | `public.password_reset_tokens`, self-hosted auth columns on `profiles` |
| `016_battle_friend_invites.sql` | `public.quiz_battle_invites`, `public.quiz_battle_invite_notifications`, `profiles.friend_code` |
| `gamification_schema.sql` | `user_xp`, `daily_streaks`, `xp_events`, `badges`, `user_badges` |
| `mindmap_schema.sql` | `mind_maps` |
| `quiz_schema.sql` | `quiz_sets`, `quiz_questions`, `quiz_attempts`, `quiz_answers` |
| `srs_schema.sql` | `flashcard_decks`, `flashcards`, `flashcard_reviews` |

> **Known issue.** `quiz_schema.sql` is not idempotent: it adds the constraint `quiz_answers_attempt_question_unique` without `IF NOT EXISTS`. Re-running it against an already-migrated database fails with SQLSTATE `42P07`. This is pre-existing and unrelated to the migration order above.

---

## Identity & Auth

Schema `public`.

### `public.admin_audit_log`

Append-only audit trail of admin actions.

- **Migration:** `011_admin_rbac.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | bigint | no | `serial` |
| `member_id` | uuid | no |  |
| `event` | text | no |  |
| `ip` | inet | yes |  |
| `user_agent` | text | yes |  |
| `metadata` | jsonb | no | `'{}'` |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Foreign keys**

- `member_id` → `public.admin_members.id`

**Indexes**

- `idx_admin_audit_log_member` — (member_id, created_at DESC)

### `public.admin_members`

Admin console members, their role and their permissions.

- **Migration:** `011_admin_rbac.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `email` | text | no |  |
| `role` | admin_role | no | `'moderator'` |
| `permissions` | text[] | no | `'{}'` |
| `status` | admin_status | no | `'active'` |
| `created_by` | uuid | yes |  |
| `last_login_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `user_id`
- check: `email = lower(email)`
- check: `permissions <@ ARRAY['can_manage_members', 'can_manage_courses', 'can_view_audit']`

**Foreign keys**

- `created_by` → `public.admin_members.id`
- `user_id` → `public.profiles.id`

**Indexes**

- `idx_admin_members_email_lower` — (lower(email))
- `idx_admin_members_role` — (role)
- `idx_admin_members_status` — (status)

### `public.password_reset_tokens`

Single-use password reset tokens. Only the SHA-256 hash is stored.

> **Unused.** Reset tokens are no longer written to this table. They live in
> Redis with a TTL (`learnai:otp:link:<email>` and `learnai:otp:token:<hash>`)
> so nothing is persisted to the database. The table is kept — dropping it is a
> destructive change to a shared schema and is out of scope for the OTP work.

- **Migration:** `015_self_hosted_auth.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `token_hash` | text | no |  |
| `expires_at` | timestamp with time zone | no |  |
| `used_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `token_hash`

**Foreign keys**

- `user_id` → `public.profiles.id`

**Indexes**

- `idx_password_reset_tokens_expires` — (expires_at)
- `idx_password_reset_tokens_user` — (user_id)

### `public.profiles`

User identity. Replaces the previous Supabase `auth.users` table.

- **Migration:** `010_profiles.sql, 015_self_hosted_auth.sql, 016_battle_friend_invites.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no |  |
| `name` | text | no |  |
| `email` | text | no |  |
| `role` | text | no | `'user'` |
| `avatar_url` | text | yes |  |
| `has_password` | boolean | no | `false` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |
| `password_hash` | text | yes |  |
| `email_confirmed_at` | timestamp with time zone | yes |  |
| `last_login_at` | timestamp with time zone | yes |  |
| `friend_code` | text | yes |  |

`friend_code` is the **8-digit numeric code** used for 1v1 battle invitations. It is
minted lazily on the first read and can be replaced by the user; replacing it
invalidates the old one. Invitations are bound to the resolved user id, so a
replacement does not break an invitation that is already pending.

`email_confirmed_at` is the **verification gate**. `NULL` means the account has
not proved it owns the address, and `POST /signin` answers `403` for it — no
session cookie is set. A non-null value means the account is usable. Accounts
created outside the signup form (the bootstrap admin, admin-created members)
carry an explicit timestamp and are verified by construction.

The column's **type did not change** — the semantics did. A row written by
`profiles.insert()` with no explicit value used to be stamped `now()`; since
the verification feature it is stamped `NULL` for a signup and an explicit
timestamp only for a pre-verified account.

`profiles.insert()` distinguishes the three cases with an `UNVERIFIED`
sentinel mapped to a **separate boolean SQL parameter**, not to a null: a null
cannot carry the distinction, because `CASE WHEN $7 IS NULL THEN now()` would
map the sentinel to `now()` and mark every signup as verified. Passing `null`
still means "stamp `now()`", which is the safe default for callers that do not
care.

Pre-existing accounts were marked verified once, before the gate was
deployed:

```sql
UPDATE public.profiles SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;
```

**Constraints**

- primary key: `id`
- unique: `email`
- check: `friend_code IS NULL OR friend_code ~ '^[0-9]{8}$'`

**Indexes**

- `idx_profiles_email` — (email)
- `idx_profiles_friend_code_unique` — (friend_code) WHERE (friend_code IS NOT NULL) — UNIQUE

---

## Courses & Content

Schema `public`.

### `public.course_materials`

Uploaded learning material per course (PDF / slides / code).

- **Migration:** `008_notes_cms.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `course_id` | uuid | no |  |
| `title` | text | no |  |
| `description` | text | yes |  |
| `type` | text | no |  |
| `file_type` | text | no |  |
| `url` | text | no |  |
| `week` | integer | yes |  |
| `metadata` | jsonb | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |
| `uploaded_by` | uuid | yes |  |

**Constraints**

- primary key: `id`

**Foreign keys**

- `course_id` → `public.courses.id`
- `uploaded_by` → `public.profiles.id`

**Indexes**

- `idx_course_materials_course` — (course_id)
- `idx_course_materials_course_type` — (course_id, type)
- `idx_course_materials_updated` — (updated_at DESC)
- `idx_course_materials_uploaded_by` — (uploaded_by)

### `public.courses`

Course catalogue. The join key for materials, tags and RAG chunks.

- **Migration:** `008_notes_cms.sql, 014_course_codes_and_storage.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `name` | text | no |  |
| `course_no` | text | no |  |
| `description` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |
| `code` | text | no |  |

**Constraints**

- primary key: `id`
- unique: `course_no`

**Indexes**

- `uniq_courses_code` — (code)

### `public.file_objects`

Object-storage registry for every uploaded file, with processing state.

- **Migration:** `014_course_codes_and_storage.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `object_key` | text | no |  |
| `bucket` | text | no |  |
| `original_name` | text | no |  |
| `mime_type` | text | yes |  |
| `size_bytes` | bigint | yes |  |
| `checksum_sha256` | text | yes |  |
| `category` | text | no |  |
| `user_id` | uuid | yes |  |
| `course_id` | uuid | yes |  |
| `material_id` | uuid | yes |  |
| `job_id` | text | yes |  |
| `status` | text | no | `'pending'` |
| `error_message` | text | yes |  |
| `metadata` | jsonb | no | `'{}'` |
| `uploaded_by` | uuid | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `object_key`

**Foreign keys**

- `course_id` → `public.courses.id`
- `material_id` → `public.course_materials.id`
- `uploaded_by` → `public.profiles.id`
- `user_id` → `public.profiles.id`

**Indexes**

- `idx_file_objects_category` — (category)
- `idx_file_objects_course` — (course_id)
- `idx_file_objects_job` — (job_id)
- `idx_file_objects_status` — (status)
- `idx_file_objects_user` — (user_id)

### `public.material_tags`

Many-to-many join between `course_materials` and `tags`.

- **Migration:** `008_notes_cms.sql`
- **Primary key:** `material_id`, `material_id`, `tag_id`, `tag_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `material_id` **(PK)** | uuid | no |  |
| `tag_id` **(PK)** | uuid | no |  |

**Constraints**

- primary key: `material_id,material_id,tag_id,tag_id`

**Foreign keys**

- `material_id` → `public.course_materials.id`
- `tag_id` → `public.tags.id`

**Indexes**

- `idx_material_tags_tag` — (tag_id)

### `public.notes`

User-authored notes.

- **Migration:** `008_notes_cms.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `title` | text | no |  |
| `original_image_url` | text | yes |  |
| `extracted_text` | text | yes |  |
| `latex_content` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Indexes**

- `idx_notes_user_created` — (user_id, created_at DESC)

### `public.tags`

Free-form labels applied to materials.

- **Migration:** `008_notes_cms.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `name` | text | no |  |

**Constraints**

- primary key: `id`
- unique: `name`

---

## Community

Schema `public`.

### `public.community_comments`

Replies on community posts.

- **Migration:** `007_community.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `post_id` | uuid | no |  |
| `author_id` | uuid | yes |  |
| `parent_id` | uuid | yes |  |
| `content` | text | no |  |
| `is_bot_reply` | boolean | no | `false` |
| `mentioned_user_id` | uuid | yes |  |
| `bot_metadata` | jsonb | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Foreign keys**

- `parent_id` → `public.community_comments.id`
- `post_id` → `public.community_posts.id`

**Indexes**

- `idx_community_comments_author` — (author_id)
- `idx_community_comments_post` — (post_id, created_at)

### `public.community_posts`

Community discussion threads.

- **Migration:** `007_community.sql, 009_community_category_lowercase.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `author_id` | uuid | no |  |
| `title` | text | no |  |
| `content` | text | no |  |
| `category` | text | no | `'general'` |
| `course_topic` | text | yes |  |
| `is_resolved` | boolean | no | `false` |
| `view_count` | integer | no | `0` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- check: `category = ANY (ARRAY['theory', 'lab', 'general'])`

**Indexes**

- `idx_community_posts_author` — (author_id)
- `idx_community_posts_category` — (category)
- `idx_community_posts_created` — (created_at DESC)

### `public.user_presence`

Online / last-seen presence per user.

- **Migration:** `007_community.sql`
- **Primary key:** `user_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` **(PK)** | uuid | no |  |
| `last_seen` | timestamp with time zone | no | `now()` |
| `is_online` | boolean | no | `false` |

**Constraints**

- primary key: `user_id`

---

## Quiz

Schema `public`.

### `public.quiz_answers`

One answered question inside an attempt.

- **Migration:** `quiz_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `attempt_id` | uuid | no |  |
| `question_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `selected` | character | no |  |
| `is_correct` | boolean | no |  |
| `time_seconds` | integer | yes |  |
| `answered_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `attempt_id,attempt_id,question_id,question_id`

**Foreign keys**

- `attempt_id` → `public.quiz_attempts.id`
- `question_id` → `public.quiz_questions.id`

**Indexes**

- `idx_quiz_answers_attempt` — (attempt_id, answered_at)
- `quiz_answers_attempt_question_unique` — (attempt_id, question_id)

### `public.quiz_attempts`

One run of a quiz set by a user.

- **Migration:** `quiz_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `quiz_set_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `score` | integer | no |  |
| `total` | integer | no |  |
| `correct_count` | integer | no |  |
| `wrong_topics` | text[] | no | `'{}'` |
| `srs_deck_id` | uuid | yes |  |
| `duration_seconds` | integer | yes |  |
| `started_at` | timestamp with time zone | no | `now()` |
| `finished_at` | timestamp with time zone | yes |  |

**Constraints**

- primary key: `id`

**Foreign keys**

- `quiz_set_id` → `public.quiz_sets.id`
- `srs_deck_id` → `public.flashcard_decks.id`

**Indexes**

- `idx_quiz_attempts_set` — (quiz_set_id)
- `idx_quiz_attempts_user` — (user_id, finished_at DESC)

### `public.quiz_questions`

Questions inside a quiz set.

- **Migration:** `quiz_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `quiz_set_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `position` | integer | no |  |
| `prompt` | text | no |  |
| `option_a` | text | no |  |
| `option_b` | text | no |  |
| `option_c` | text | no |  |
| `option_d` | text | no |  |
| `correct` | character | no |  |
| `explanation` | text | yes |  |
| `tags` | text[] | no | `'{}'` |
| `difficulty` | varchar(16) | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Foreign keys**

- `quiz_set_id` → `public.quiz_sets.id`

**Indexes**

- `idx_quiz_questions_set` — (quiz_set_id, "position")

### `public.quiz_sets`

A named collection of quiz questions.

- **Migration:** `quiz_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `title` | text | no |  |
| `description` | text | yes |  |
| `source_type` | varchar(40) | yes |  |
| `source_id` | uuid | yes |  |
| `question_count` | integer | no | `0` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Indexes**

- `idx_quiz_sets_user` — (user_id)
- `idx_quiz_sets_user_updated` — (user_id, updated_at DESC)

---

## Spaced Repetition

Schema `public`.

### `public.flashcard_decks`

Named collection of flashcards (SRS).

- **Migration:** `srs_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `title` | text | no |  |
| `description` | text | yes |  |
| `source_type` | varchar(40) | yes |  |
| `source_id` | uuid | yes |  |
| `card_count` | integer | no | `0` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Indexes**

- `idx_flashcard_decks_user` — (user_id)
- `idx_flashcard_decks_user_updated` — (user_id, updated_at DESC)

### `public.flashcard_reviews`

History of every SRS review.

- **Migration:** `srs_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `card_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `rating` | smallint | no |  |
| `prev_interval` | integer | yes |  |
| `new_interval` | integer | yes |  |
| `prev_ease` | real | yes |  |
| `new_ease` | real | yes |  |
| `reviewed_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Foreign keys**

- `card_id` → `public.flashcards.id`

**Indexes**

- `idx_flashcard_reviews_card` — (card_id)
- `idx_flashcard_reviews_user_time` — (user_id, reviewed_at DESC)

### `public.flashcards`

Individual SRS cards and their SM-2 scheduling state.

- **Migration:** `srs_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `deck_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `front` | text | no |  |
| `back` | text | no |  |
| `tags` | text[] | no | `'{}'` |
| `ease_factor` | real | no | `2.5` |
| `interval_days` | integer | no | `0` |
| `repetitions` | integer | no | `0` |
| `due_at` | timestamp with time zone | no | `now()` |
| `last_reviewed` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Foreign keys**

- `deck_id` → `public.flashcard_decks.id`

**Indexes**

- `idx_flashcards_deck` — (deck_id)
- `idx_flashcards_due` — (user_id, due_at)

---

## Mind Maps

Schema `public`.

### `public.mind_maps`

AI-generated concept graphs.

- **Migration:** `mindmap_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `title` | text | no |  |
| `description` | text | yes |  |
| `source_type` | varchar(40) | yes |  |
| `source_id` | uuid | yes |  |
| `root_concept` | text | no |  |
| `node_count` | integer | no | `0` |
| `graph_json` | jsonb | no | `'{}'` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Indexes**

- `idx_mind_maps_graph_gin` — (graph_json jsonb_path_ops)
- `idx_mind_maps_user` — (user_id)
- `idx_mind_maps_user_updated` — (user_id, updated_at DESC)

---

## Gamification

Schema `public`.

### `public.badges`

Badge definitions.

- **Migration:** `gamification_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `code` | text | no |  |
| `name` | text | no |  |
| `description` | text | no |  |
| `icon` | text | no |  |
| `threshold` | jsonb | no | `'{}'` |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `code`

### `public.daily_streaks`

Per-day streak markers driving the daily-streak badge.

- **Migration:** `gamification_schema.sql`
- **Primary key:** `user_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` **(PK)** | uuid | no |  |
| `current_streak` | integer | no | `0` |
| `longest_streak` | integer | no | `0` |
| `last_active_date` | date | yes |  |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `user_id`
- check: `current_streak >= 0`
- check: `longest_streak >= 0`

### `public.user_badges`

Badges earned per user.

- **Migration:** `gamification_schema.sql`
- **Primary key:** `user_id`, `user_id`, `badge_id`, `badge_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` **(PK)** | uuid | no |  |
| `badge_id` **(PK)** | uuid | no |  |
| `earned_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `user_id,user_id,badge_id,badge_id`

**Foreign keys**

- `badge_id` → `public.badges.id`

**Indexes**

- `idx_user_badges_user` — (user_id)

### `public.user_xp`

Current XP and level per user.

- **Migration:** `gamification_schema.sql`
- **Primary key:** `user_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` **(PK)** | uuid | no |  |
| `total_xp` | integer | no | `0` |
| `level` | integer | no | `1` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `user_id`
- check: `level >= 1`
- check: `total_xp >= 0`

### `public.xp_events`

Append-only XP ledger. Every award writes one row here.

- **Migration:** `gamification_schema.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `source` | text | no |  |
| `amount` | integer | no |  |
| `metadata` | jsonb | no | `'{}'` |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Indexes**

- `idx_xp_events_user_date` — (user_id, created_at DESC)
- `idx_xp_events_user_source_date` — (user_id, source, (((created_at AT TIME ZONE 'UTC'::text))::date))

---

## Quiz Battle

Schema `public`.

### `public.quiz_battle_answers`

Answers submitted inside a battle match.

- **Migration:** `012_quiz_battle.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `match_id` | uuid | no |  |
| `user_id` | uuid | no |  |
| `question_id` | uuid | no |  |
| `selected` | character | yes |  |
| `is_correct` | boolean | yes |  |
| `time_seconds` | integer | yes |  |
| `answered_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `match_id,match_id,match_id,user_id,user_id,user_id,question_id,question_id,question_id`
- check: `(selected IS NULL) OR (selected = ANY (ARRAY['A', 'B', 'C', 'D']))`

**Foreign keys**

- `match_id` → `public.quiz_battle_matches.id`
- `question_id` → `public.quiz_battle_questions.id`
- `user_id` → `public.profiles.id`

**Indexes**

- `idx_quiz_battle_answers_match_user` — (match_id, user_id)
- `quiz_battle_answers_unique_submission` — (match_id, user_id, question_id)

### `public.quiz_battle_matches`

One head-to-head battle between two players.

- **Migration:** `012_quiz_battle.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `course_id` | uuid | no |  |
| `player_one` | uuid | no |  |
| `player_two` | uuid | no |  |
| `status` | quiz_battle_status | no | `'queued'` |
| `winner` | uuid | yes |  |
| `ended_reason` | text | yes |  |
| `level_at_match_one` | integer | no |  |
| `level_at_match_two` | integer | no |  |
| `started_at` | timestamp with time zone | yes |  |
| `finished_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- check: `player_one <> player_two`

**Foreign keys**

- `course_id` → `public.courses.id`
- `player_one` → `public.profiles.id`
- `player_two` → `public.profiles.id`
- `winner` → `public.profiles.id`

**Indexes**

- `idx_quiz_battle_matches_course_status` — (course_id, status)
- `idx_quiz_battle_matches_player_one` — (player_one)
- `idx_quiz_battle_matches_player_two` — (player_two)

### `public.quiz_battle_notifications`

In-app notifications for battle invites and results.

- **Migration:** `013_battle_notifications.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `match_id` | uuid | no |  |
| `kind` | text | no |  |
| `payload` | jsonb | no | `'{}'` |
| `read_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- check: `kind = ANY (ARRAY['matched', 'opponent_answered', 'opponent_left', 'ended'])`

**Foreign keys**

- `match_id` → `public.quiz_battle_matches.id`
- `user_id` → `public.profiles.id`

**Indexes**

- `idx_quiz_battle_notifications_match` — (match_id)
- `idx_quiz_battle_notifications_user_unread` — (user_id, created_at DESC) WHERE (read_at IS NULL)

> **Why a pre-match invitation does not live here.** `match_id` is `NOT NULL` and
> `kind` is restricted to the four match-scoped values above, so this table cannot
> hold a "play with a friend" invitation — there is no match yet. Widening either
> constraint would also break the frontend's `Record<BattleNotification['kind'], string>`
> label map. The invitation therefore uses its own tables, below.

### `public.quiz_battle_invites`

A "play with a friend" invitation, before it becomes a match.

- **Migration:** `016_battle_friend_invites.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `sender_id` | uuid | no |  |
| `invitee_id` | uuid | no |  |
| `course_id` | uuid | no |  |
| `invitee_friend_code` | text | no |  |
| `status` | quiz_battle_invite_status | no | `'pending'` |
| `match_id` | uuid | yes |  |
| `sender_level_score` | integer | yes |  |
| `invitee_level_score` | integer | yes |  |
| `decided_by` | uuid | yes |  |
| `decline_reason` | text | yes |  |
| `expires_at` | timestamp with time zone | no |  |
| `responded_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

`invitee_friend_code` is **audit only** — the invitation is bound to `invitee_id`, so
regenerating the invitee's friend code does not break an invitation that is already
pending.

`match_id` is nullable: it is only known after the match is created, so it is
written in a follow-up `UPDATE` once the accept succeeds.

**Constraints**

- primary key: `id`
- check: `sender_id <> invitee_id`
- check: `status NOT IN ('declined', 'unavailable') OR decline_reason IS NOT NULL`

**Foreign keys**

- `sender_id` → `public.profiles.id` (ON DELETE CASCADE)
- `invitee_id` → `public.profiles.id` (ON DELETE CASCADE)
- `course_id` → `public.courses.id` (ON DELETE CASCADE)
- `match_id` → `public.quiz_battle_matches.id` (ON DELETE SET NULL)
- `decided_by` → `public.profiles.id` (ON DELETE SET NULL)

**Indexes**

- `idx_quiz_battle_invites_invitee_pending` — (invitee_id, created_at DESC) WHERE (status = 'pending')
- `idx_quiz_battle_invites_sender` — (sender_id, created_at DESC)
- `idx_quiz_battle_invites_expires` — (expires_at) WHERE (status = 'pending')
- `idx_quiz_battle_invites_one_pending_pair` — (sender_id, invitee_id) WHERE (status = 'pending') — UNIQUE. At most one pending invitation per pair.

**Enum `quiz_battle_invite_status`**

`pending`, `accepted`, `declined`, `unavailable`, `expired`

### `public.quiz_battle_invite_notifications`

Bell entries for the "play with a friend" invitation flow.

- **Migration:** `016_battle_friend_invites.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `invite_id` | uuid | no |  |
| `kind` | quiz_battle_invite_notification_kind | no |  |
| `payload` | jsonb | no | `'{}'` |
| `read_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

A bell entry is a **historical** record ("a friend wants to battle"). Whether the
"No play" / "Let's play" buttons are still actionable depends on the invitation's
*current* status, so the read query joins `quiz_battle_invites` and returns it
alongside the entry as `inviteStatus`.

**Foreign keys**

- `user_id` → `public.profiles.id` (ON DELETE CASCADE)
- `invite_id` → `public.quiz_battle_invites.id` (ON DELETE CASCADE)

**Indexes**

- `idx_quiz_battle_invite_notifications_user_unread` — (user_id, created_at DESC) WHERE (read_at IS NULL)
- `idx_quiz_battle_invite_notifications_invite` — (invite_id)

**Enum `quiz_battle_invite_notification_kind`**

`invite`, `invite_sent`, `invite_declined`, `invite_unavailable`, `invite_expired`, `invite_accepted`

### `public.quiz_battle_profiles`

Live-battle win/loss record and level score.

- **Migration:** `012_quiz_battle.sql`
- **Primary key:** `user_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` **(PK)** | uuid | no |  |
| `wins` | integer | no | `0` |
| `losses` | integer | no | `0` |
| `draws` | integer | no | `0` |
| `level_score` | integer | no | `1000` |
| `last_match_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `user_id`

**Foreign keys**

- `user_id` → `public.profiles.id`

**Indexes**

- `idx_quiz_battle_profiles_level` — (level_score DESC)

### `public.quiz_battle_questions`

Questions inside a battle match.

- **Migration:** `012_quiz_battle.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `match_id` | uuid | no |  |
| `position` | integer | no |  |
| `prompt` | text | no |  |
| `option_a` | text | no |  |
| `option_b` | text | no |  |
| `option_c` | text | no |  |
| `option_d` | text | no |  |
| `correct` | character | no |  |
| `explanation` | text | yes |  |
| `tags` | text[] | no | `'{}'` |
| `difficulty` | varchar(16) | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`
- unique: `match_id,match_id,position,position`
- check: `correct = ANY (ARRAY['A', 'B', 'C', 'D'])`

**Foreign keys**

- `match_id` → `public.quiz_battle_matches.id`

**Indexes**

- `idx_quiz_battle_questions_match` — (match_id)
- `quiz_battle_questions_position_unique` — (match_id, "position")

---

## Chat Agent

Schema `chat_agent`.

### `chat_agent.chats`

Chat thread metadata.

- **Migration:** `006_chat_agent.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `title` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Indexes**

- `idx_chat_agent_chats_user` — (user_id)
- `idx_chat_agent_chats_user_updated` — (user_id, updated_at DESC)

### `chat_agent.messages`

Individual chat messages within a thread.

- **Migration:** `006_chat_agent.sql`
- **Primary key:** `id`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` **(PK)** | uuid | no | `gen_random_uuid()` |
| `chat_id` | uuid | no |  |
| `role` | varchar(20) | no |  |
| `content` | text | no |  |
| `metadata` | jsonb | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Constraints**

- primary key: `id`

**Foreign keys**

- `chat_id` → `chat_agent.chats.id`

**Indexes**

- `idx_chat_agent_messages_chat` — (chat_id, created_at)

---
