# LearnAI API Reference

Base URL: `http://localhost:8000/api/v1` in development.
All paths below are relative to that prefix.

This document is the canonical listing of every HTTP endpoint exposed by the
LearnAI Express backend. It has been read out of the source and verified
against the running code — every route, envelope shape, status code and event
name below reflects actual behaviour, not intent.

For environment setup and deployment, see [`instruction.md`](./instruction.md).
For the feature overview, see [`project.md`](./project.md).
For the database, see [`schema.md`](./schema.md).

---

## Contents

- [Authentication](#authentication)
- [Response envelopes](#response-envelopes)
- [Error envelopes](#error-envelopes)
- [Rate limiting](#rate-limiting)
- [Routes](#routes)
  - [Auth](#auth)
  - [Users](#users)
  - [Test AI](#test-ai)
  - [Courses & Content (CMS)](#courses--content-cms)
  - [Course codes](#course-codes)
  - [Chat](#chat)
  - [Storage](#storage)
  - [Community](#community)
  - [Spaced Repetition (SRS)](#spaced-repetition-srs)
  - [Quiz](#quiz)
  - [Mind maps](#mind-maps)
  - [Gamification](#gamification)
  - [Admin](#admin)
  - [Quiz battle](#quiz-battle)
- [Server-sent events](#server-sent-events)
- [WebSocket (Socket.IO)](#websocket-socketio)
- [File uploads](#file-uploads)
- [Health & service endpoints](#health--service-endpoints)

---

## Authentication

LearnAI uses **self-hosted authentication**. There is no Supabase Auth, no OAuth
provider and no confirmation email. A user is a row in `public.profiles`, the
password is a bcrypt hash in `profiles.password_hash`, and a signed JWT is
issued on sign-in.

### Token

| Property | Value |
|---|---|
| Algorithm | `HS256` |
| Signing secret | `JWT_SECRET` env var, **minimum 32 characters** — the server refuses to boot otherwise |
| Issuer | `JWT_ISSUER` env var, default `learnai` — verified on decode |
| Subject | The profile UUID (`sub`) |
| TTL | `JWT_TTL_SECONDS` env var, default `1800` (30 minutes) |
| Payload | `{ id, email, role }` plus the library-added `iat`, `exp`, `iss`, `sub` |

### Cookie

| Property | Value |
|---|---|
| Name | `sb-access-token` |
| `HttpOnly` | `true` |
| `Path` | `/` |
| `Secure` | `true` only when `ENVIRONMENT=production` |
| `SameSite` | `none` in production (cross-site frontend → backend), `lax` otherwise |
| `Max-Age` | Matches the token TTL — 30 minutes by default |

There is **no refresh token**. `sb-refresh-token` no longer exists and is never
set or cleared. When the token expires the user signs in again.

### Bearer tokens

`Authorization: Bearer <token>` is accepted as an alternative to the cookie.
The cookie is checked first; the header is the fallback. The scheme match is
case-insensitive.

### Using it

```bash
# Sign in — the token arrives in the Set-Cookie header, not the body
curl -i -X POST http://localhost:8000/api/v1/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

# Use the cookie
curl -b 'sb-access-token=<token>' http://localhost:8000/api/v1/me

# Or use the header
curl -H 'Authorization: Bearer <token>' http://localhost:8000/api/v1/me
```

---

## Response envelopes

There is **no single response shape**. Several conventions are in use, and which
one applies depends on the router that handled the request.

| # | Shape | Used by |
|---|---|---|
| **A** | `{ data: … }` | Auth (all 7 routes), `PATCH /me`, `DELETE /me`, `POST /storage/avatars` |
| **B** | `{ data: { member } }` / `{ data: { ok: true } }` | All 13 admin routes |
| **C** | Bare array `[ … ]` | `GET /courses`, `GET /courses/:id/materials`, `GET /materials/recent`, `GET /tags` |
| **D** | Bare object `{ … }` | 13 endpoints — course stats, search, SRS stats/due, quiz stats, gamification stats, and every `/health` probe |
| **E** | Named key + pagination `{ chats, total, page, pageSize }` | Chat list |
| **F** | Named key + pagination `{ deck }`, `{ set }`, `{ mindMap }`, … | SRS, Quiz, Mind map |
| **G** | Mixed — bare objects and `{ posts, total, page, pageSize, hasMore }` | Community |
| **H** | All bare — no wrapper | Storage (MinIO) |
| **I** | Named key `{ profile }`, `{ matches, total, page, pageSize }` | Quiz battle |
| **J** | Bare `{ response }` / `{ msg }` | Test AI |
| **K** | Bare object / bare array | Course codes |

> **Frontend note.** `frontend/src/lib/api.ts` auto-unwraps a `{ data: T }`
> response into `T`, so wrapped endpoints look bare to frontend callers. A bare
> backend response is passed through unchanged. Because no bare endpoint happens
> to carry its own `data` key the unwrap is safe today — but a bare payload with
> a `data` field would be mis-unwrapped.

---

## Error envelopes

Five distinct error shapes. Check the shape before assuming a key.

### 1. Global error handler — `{ detail, request_id }`

```json
{ "detail": "Internal Server Error", "request_id": "3f9a…" }
```

Status: `err.status || err.statusCode || 500`.

Produced by any route that calls `next(e)` without a local `catch`: CMS reads,
course codes, **all chat routes**, community reads and writes, **all MinIO
storage routes**.

### 2. Router-local — `{ detail }`

```json
{ "detail": "Invalid credentials" }
```

Status varies (400 / 401 / 403 / 404 / 409 / 413 / 500).

Produced by: auth, users, Supabase storage, SRS, quiz, mind map, gamification,
quiz battle, CMS writes and permission denials, course codes.

**No `request_id` key** — that is the only difference from shape 1.

### 3. `{ error: "<string>" }`

```json
{ "error": "Chat not found" }
```

Produced by **chat** (`chat-agent/router.js`) for both zod validation failures
and not-found.

**Community also uses this shape — but only for zod validation failures.** Its
not-found, auth and 500 errors use `{ detail }`. A community endpoint can
therefore return either shape depending on the failure.

### 4. Admin — `{ error: { code, message } }`

```json
{ "error": { "code": "insufficient_permissions", "message": "…" } }
```

| Code | Status |
|---|---|
| `not_admin_member` | 401 |
| `auth_invalid` | 401 |
| `insufficient_permissions` | 403 |
| `validation_error` | 400 |
| `member_not_found` | 404 |
| `member_already_exists` | 409 |
| `internal_error` | 500 |

### 5. Rate limited — `{ error: { code, message } }`

```json
{ "error": { "code": "rate_limited", "message": "Too many attempts. Please try again in a few minutes." } }
```

Status `429`, with `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`
headers.

### Auth middleware — `{ detail, request_id }`

A hybrid of shapes 1 and 2, produced only by `getCurrentUser` when the session
is missing or invalid:

```json
{ "detail": "Not authenticated", "request_id": "3f9a…" }
```

### Bulk delete partial failure

```json
{ "detail": "Deleted 3 material(s); 1 could not be deleted", "deleted": 3, "failed": 1 }
```

Status `207`.

---

## Rate limiting

These limiters are actually mounted on routes.

| Limiter | Routes | Window / max | Controlled by |
|---|---|---|---|
| `authLimiter` | `POST /signup`, `/signin`, `/forgot-password`, `/reset-password` | 15 min / **10 failures** | `RATE_LIMIT_ENABLED` |
| `adminAuthLimiter` | `POST /admin/auth/login`, `/admin/auth/forgot` | 15 min / **10 failures** | `RATE_LIMIT_ENABLED` |
| `sendOtpLimiter` | `POST /resend-otp` | 1 min / **1 request** per email | `RATE_LIMIT_ENABLED` |
| `verifyOtpLimiter` | `POST /verify-otp` | 15 min / **10 requests** per email | `RATE_LIMIT_ENABLED` |
| `verifyOtpIpLimiter` | `POST /verify-otp` | 15 min / **30 requests** per IP | `RATE_LIMIT_ENABLED` |
| `verifyEmailLimiter` | `POST /verify-email` | 15 min / **30 requests** per IP | `RATE_LIMIT_ENABLED` |
| `testAiLimiter` | `POST /test-ai`, `/test-model` | 1 min / **10 requests** | values are hardcoded |

`authLimiter` and `adminAuthLimiter` count **failures only**. A request is
rejected with `429` only once the *previous* failure count has already reached
the max. Their counters live in Redis when `REDIS_URL` is reachable and fall
back to an in-process map.

`authLimiter` counts **only `401`** as a failure. The verification gate
answers `403`, and a `403` must **not** count: a user who has simply not
clicked their verification link yet would otherwise be IP-locked for 15
minutes after ten sign-in attempts, with no way to recover except waiting. The
`403` still carries a `detail` the frontend acts on, so it stays actionable
without consuming the IP budget.

`sendOtpLimiter`, `verifyOtpLimiter`, `verifyOtpIpLimiter` and
`verifyEmailLimiter` count **volume**, not failures — a successful send or
verify still counts, otherwise those endpoints could be hammered forever
without ever returning a `401`. `verify-otp` carries both the per-email and the
per-IP limiter; the stricter of the two wins. `verify-email` is limited per IP
only — the token is 256 bits, so brute-forcing it is not the threat; the
per-address mail counter inside the token store is (10 links per hour).

Mailing a verification link is additionally capped by a Redis counter in the
token store: at most **10** links per address per hour. The counter is a
throttle on how often a mailbox is hit, not a hard lock.

`testAiLimiter` keys on the authenticated user id → `x-forwarded-for` → `req.ip`.
Its `429` body is the express-rate-limit default
(`{"message":"Too many requests, please try again later."}`), not shape 5.

> There is **no global rate limiter**. `config/limiter.js` exports a `limiter`
> configured from `RATE_LIMIT_DEFAULT` (default `100/minute`), but it is not
> mounted on any route — it is dead configuration.

### Test bypass

Setting `RATE_LIMIT_TEST_BYPASS_SECRET` enables a bypass header:

```
x-rate-limit-bypass: <the secret value>
```

The comparison is constant-time. The header only bypasses `authLimiter` and
`adminAuthLimiter`.

### Socket.IO limits

Per-socket, in-memory, not configurable by env var. See
[WebSocket](#websocket-socketio).

---

## Routes

Legend: **auth** = session required, **optional** = session used if present,
**public** = no session.

---

### Auth

Mounted at the bare `/api/v1` root — **there is no `/api/v1/auth` prefix**.

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/signup` | Create account. Body: `{ name, email, password, confirmPassword }`. Emails a verification link | public |
| `POST` | `/api/v1/signin` | Sign in. Body: `{ email, password }`. Sets the `sb-access-token` cookie | public |
| `POST` | `/api/v1/verify-email` | Consume an email-verification token. Body: `{ token }` | public |
| `POST` | `/api/v1/signout` | Clear the session cookie | **auth** |
| `POST` | `/api/v1/forgot-password` | Issue a reset token and email the code. Body: `{ email }` | public |
| `POST` | `/api/v1/resend-otp` | Re-send the reset code. Body: `{ email }` | public |
| `POST` | `/api/v1/verify-otp` | Exchange a 6-digit code for a reset token. Body: `{ email, code }` | public |
| `POST` | `/api/v1/reset-password` | Consume a reset token. Body: `{ token, password, confirmPassword }` | public |
| `POST` | `/api/v1/change-password` | Body: `{ currentPassword, newPassword }` | **auth** |
| `GET` | `/api/v1/me` | Current user and profile | **auth** |

**Request rules**

- `signup` — `name` non-empty, valid email, `password` ≥ 6 chars, `confirmPassword` ≥ 6 chars, and the two must match. Email uniqueness is case-insensitive. The account is created **unverified** (`email_confirmed_at IS NULL`) and a **verification link** is emailed — the account cannot sign in until that link is clicked.
- `signin` — email is lowercased and trimmed. A constant dummy hash is compared when the account does not exist, so response timing does not reveal whether the address is registered. The password is checked **before** the verification gate, so a wrong password still answers `401` and the endpoint never becomes an account-existence oracle. An account that exists, has the right password, but is **not verified** answers **`403`** and **no session cookie is set**; the same response re-issues and re-mails a fresh verification link. A **verified** account is answered normally and **no** mail is sent.
- `verify-email` — no session is required: the token *is* the credential. The token must be unused, unexpired, and be the **newest** one issued for that address. Consuming it sets `email_confirmed_at`. Every failure mode (missing, malformed, expired, already used, superseded) answers `400` with the **same** message, so the endpoint is not a token oracle. There is deliberately **no `GET` variant**: mail security scanners prefetch links with a `GET`, and a `GET` that consumed a single-use token would burn the user's link before they ever saw it. The email points at the **frontend** page `/auth/verify-email?token=…`, which POSTs the token to this route.
- `forgot-password` — issues a 64-hex reset token and a 6-digit code, stores both in **Redis** with a TTL, and emails them. The raw token is also written to the server log. The response body is identical whether or not the account exists.
- `resend-otp` — same as `forgot-password`: it mints a fresh token and code and emails them again. Rate limited to one request per email per minute.
- `verify-otp` — checks the 6-digit code against the hashed copy in Redis. A wrong code counts an attempt (5 allowed); at 5 the code is deleted. A correct code returns the reset token, which is then used at `reset-password`. The code is single-use.
- `reset-password` — the token must be unused and unexpired. Consuming it deletes it from Redis, which is what makes it single-use, and sets the new password.

**Email verification**

A newly registered account is **not usable** until the emailed link is clicked.
The link is valid for **10 minutes** and can be used **once**.

| Situation | Result |
|---|---|
| `signup` | The account is created with `email_confirmed_at IS NULL` and a link is emailed |
| `signin` while unverified | `403`, **no session cookie**, and a **fresh** link is emailed (the previous one is retired) |
| `signin` while verified | `200` + the cookie, **no mail** |
| `verify-email` with a valid token | `200`, and `email_confirmed_at` is set |
| `verify-email` with a bad/expired/used token | `400` with the same message in every case |

**Where the verification state lives** — entirely in **Redis**, never in Postgres.

| Key | Value | TTL |
|---|---|---|
| `learnai:verify:token:<tokenHash>` | `{ userId, email }` — the SHA-256 of the token, never the plaintext | 10 min |
| `learnai:verify:index:<tokenHash>` | the `token` key above, indexed by token hash | 10 min |
| `learnai:verify:email:<email>` | the token hash of the **newest** token for that address | 10 min |
| `learnai:verify:issued:<email>` | how many links were mailed to that address in the trailing hour | 1 hour |

The **email-keyed index** is what makes "issue a new link and retire the old one"
possible: without it, a second sign-in attempt could not invalidate the link
already sitting in the user's inbox. The token is 32 random bytes (64 hex
chars) and is consumed with `GETDEL`, so a double-click cannot verify twice. At
most **10** links are mailed to one address per hour.

Nothing is written to `public.password_reset_tokens` — that table is vestigial
and stays that way.

**Pre-verified accounts**

Accounts that never went through the signup form are **verified by
construction**: the bootstrap admin (`bootstrap.js`) and admin-created members
(`admin_agent/service.js`) pass an explicit `email_confirmed_at`, so they work
immediately and never receive a verification mail.

Pre-existing accounts were marked verified once, before the gate was deployed:

```sql
UPDATE public.profiles SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;
```

Run it **before** deploying the verification gate, or those accounts are locked
out.

**Where the reset state lives**

| Key | Value | TTL |
|---|---|---|
| `learnai:otp:code:<email>` | `{ hash, attempts }` — the SHA-256 of the 6-digit code, never the plaintext | 10 min |
| `learnai:otp:link:<email>` | `{ tokenHash, token, userId }` — the reset token and its account | 60 min |
| `learnai:otp:token:<tokenHash>` | the `link` key above, indexed by token hash | 60 min |

Nothing is written to `public.password_reset_tokens` any more — the table still
exists but is unused. The code is hashed even in Redis, because a 6-digit code
has only a million combinations.

**Mail delivery**

The mail is sent through the Resend HTTP API (`POST https://api.resend.com/emails`)
using `RESEND_API_KEY`. When `RESEND_API_KEY` is unset the backend logs the code
instead of sending it, and the endpoint still returns the generic success — the
flow works end to end today and mail starts flowing the moment the key is set.
A provider failure is logged and never fails the request: `forgot-password`
always returns `200` with the generic message. `MAIL_FROM` must be a verified
sender; when it is empty the backend falls back to `onboarding@resend.dev`,
which only delivers to the account's own address.

The **verification** mail follows the same fallback: with no provider
configured the link is written to the backend log instead of being sent —
`[auth] email verification link for <email> (expires in 600s): <link>`. The
account is still blocked until the link is clicked, so an environment without a
mail provider cannot self-register; the link has to be copied out of the log.

Every mail is sent **after** the database transaction commits. The Resend
call is an external HTTP request and must never run inside an open
transaction — a provider timeout would roll back the write that the mail was
announcing.

**Responses**

| Route | Body |
|---|---|
| `signup` | `200 { data: { success: true, message: "We have sent a verification link to your email. Please click it within 10 minutes to activate your account.", email, verificationRequired: true, profile } }` |
| `signin` | `200 { data: { success: true } }` — the token is **only** in the `Set-Cookie` header |
| `signin` (bad password) | `401 { detail: "Invalid credentials" }` |
| `signin` (not verified) | `403 { detail: "Please verify your email. We have sent a new verification link — please click it within 10 minutes." }` — **no cookie** |
| `verify-email` | `200 { data: { success: true, message: "Your email is verified — you can sign in now." } }` |
| `verify-email` (failure) | `400 { detail: "Invalid or expired verification link" }` — the same message for every failure |
| `signout` | `200 { data: { success: true } }` |
| `forgot-password` | `200 { data: { success: true, message: "If an account exists for that email, a reset link has been generated." } }` |
| `resend-otp` | `200 { data: { success: true, message: "If an account exists for that email, a reset link has been generated." } }` |
| `verify-otp` | `200 { data: { success: true, token: "<64-hex>", message: "Code verified. Use the token to set a new password." } }` |
| `verify-otp` (failure) | `400 { detail: "Invalid or expired code" }` |
| `reset-password` | `200 { data: { success: true, message: "Password updated successfully" } }` |
| `change-password` | `200 { data: { success: true, message: "Password changed successfully" } }` |
| `me` | `200 { data: { id, email, profile: { id, name, avatarUrl, role } } }` — or `{ data: null }` if the profile row is gone |

---

### Users

| Method | Path | Description | Auth |
|---|---|---|---|
| `PATCH` | `/api/v1/me` | Update profile. Body: `{ name?, avatarUrl? }` | **auth** |
| `DELETE` | `/api/v1/me` | Delete the account. Body: `{ password }` (verified first) | **auth** |

`PATCH /me` returns `200 { data: { success: true, message: "Profile updated successfully", profile } }`.
`DELETE /me` returns `200 { data: { success: true, message: "Account deleted successfully" } }`.

Both share the path with `GET /me` — different methods, different routers, no
conflict.

---

### Test AI

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/test-ai` | Single-turn educational Gemini relay. Body: `{ prompt, temperature?, topP?, topK?, maxOutputTokens?, withGuardrails? }` | public |
| `POST` | `/api/v1/test-model` | Gemini relay. Body: `{ msg }` | public |

Responses are `{ response }` and `{ msg }` respectively — both **bare**.

---

### Courses & Content (CMS)

Mounted at the bare `/api/v1` root — **there is no `/api/v1/cms` prefix**.

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/courses` | Create a course | **auth** + `can_manage_courses` |
| `GET` | `/api/v1/courses` | List courses. `?limit` (default 500, max 2000), `?offset` | public |
| `DELETE` | `/api/v1/courses/:courseId` | Delete the course, its materials and its RAG chunks | **auth** + `can_manage_courses` |
| `POST` | `/api/v1/courses/:courseId/materials` | Upload a material (multipart, field `file`) | **auth** + `can_manage_courses` |
| `PUT` | `/api/v1/courses/:courseId/materials/:materialId` | Update material metadata | **auth** + `can_manage_courses` |
| `DELETE` | `/api/v1/courses/:courseId/materials/:materialId` | Delete a material and its RAG chunks | **auth** + `can_manage_courses` |
| `DELETE` | `/api/v1/courses/:courseId/materials` | Bulk delete. `?type=` is **required** | **auth** + `can_manage_courses` |
| `GET` | `/api/v1/courses/:courseId/materials` | List materials. `?type`, `?limit` (default 1000, max 5000), `?offset` | public |
| `GET` | `/api/v1/courses/:courseId/stats` | Course statistics | public |
| `GET` | `/api/v1/materials/recent` | Recently uploaded materials. `?limit` (default 20, max 100) | public |
| `GET` | `/api/v1/tags` | Search tags. `?query=` | public |
| `GET` | `/api/v1/search` | Semantic search. `?q`, `?type`, `?limit` (default 10, max 50) | **auth** |

**Request rules**

- `POST /courses` body: `name` (10–100 chars, required), `description` (≤ 500, optional), and **exactly one** of `course_no` or `courseNo` matching `/^[A-Za-z]{2,4}\d{4}$/` (e.g. `CSE1121`). Sending both or neither is a `400`.
- Material upload form fields: `title` (required), `type` (required — `theory` or `lab`), `file_type` (required — `pdf`, `pptx` or `code`), `description`, `week`, `tags` (JSON string), `metadata` (JSON string). These are *declared* metadata and are not validated against the uploaded bytes.

**Responses**

- `GET /courses`, `GET /courses/:id/materials`, `GET /materials/recent`, `GET /tags` return **bare arrays**.
- `GET /courses/:id/stats` and `GET /search` return **bare objects**. Search returns `{ query, count, results }`.
- `GET /search` **requires authentication** even though the surrounding CMS reads are public.

---

### Course codes

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/courses/lookup` | Look up one course by `?code=` (UUID or course code) | **auth** |
| `GET` | `/api/v1/courses/picker` | Paginated course list. `?limit` (default 200, max 500), `?offset` | **auth** |

`lookup` returns a bare `{ id, name, code, courseNo, course_no, description }`;
`picker` returns a bare array.

> **Mount-order note.** This router is mounted at `/api/v1/courses` **before** the
> CMS router. It only defines `/lookup` and `/picker`, so nothing is shadowed —
> but those two paths resolve here, not to the CMS router.

---

### Chat

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/chat` | Create a thread. Body: `{ title? }` | **auth** |
| `GET` | `/api/v1/chat` | List chats. `?page`, `?pageSize` | **auth** |
| `GET` | `/api/v1/chat/:chatId` | Chat detail with messages | **auth** |
| `POST` | `/api/v1/chat/:chatId/message` | Send a message. Body: `{ content }` (1–10 000 chars). `?stream=true` → SSE | **auth** |
| `DELETE` | `/api/v1/chat/:chatId` | Delete the chat | **auth** |
| `PATCH` | `/api/v1/chat/:chatId/title` | Rename. Body: `{ title }` (1–200) | **auth** |

**Responses** — the chat router is not internally consistent:

| Route | Body |
|---|---|
| `POST /chat` | **bare** `{ id, userId, title, createdAt, updatedAt, messageCount }` |
| `GET /chat` | `{ chats, total, page, pageSize }` |
| `GET /chat/:chatId` | **bare** `{ …chat fields, messageCount, messages }` — flat, *not* nested under a `chat` key |
| `PATCH /chat/:chatId/title` | **bare** chat object |
| `DELETE /chat/:chatId` | `204` |

Errors from this router use `{ error: "<message>" }` (shape 3).

---

### Storage

Two routers share the `/api/v1/storage` prefix.

#### Supabase bucket (avatars)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/storage/avatars` | Upload an avatar (multipart, field `file`) | **auth** |
| `DELETE` | `/api/v1/storage/avatars` | Delete the avatar. Body: `{ avatarUrl }` | **auth** |

`POST` returns `200 { data: { path, url } }` (wrapped).
`DELETE` returns `200 { success: true }` (bare).

#### MinIO / SeaweedFS

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/storage/presign` | Presigned PUT URL for direct upload | **auth** (+ `can_manage_courses` for course categories) |
| `POST` | `/api/v1/storage/finalize` | Mark the upload processed and enqueue post-processing | **auth** (+ `can_manage_courses` for course categories) |
| `POST` | `/api/v1/storage/minio-avatars` | Multipart avatar upload | **auth** |
| `POST` | `/api/v1/storage/minio-uploads` | Multipart course-material upload | **auth** + `can_manage_courses` |
| `GET` | `/api/v1/storage/jobs/:jobId` | Poll upload job status | **auth** (owner or `can_manage_courses`) |
| `GET` | `/api/v1/storage/files/:fileObjectId/url` | Presigned GET URL (300 s) | **auth** (owner for `avatar` category) |
| `GET` | `/api/v1/storage/files/:fileObjectId/download` | Stream the object bytes inline | **auth** (owner for `avatar` category) |
| `DELETE` | `/api/v1/storage/files/:fileObjectId` | Delete the file object, its material row and its RAG chunks | **auth** (owner or `can_manage_courses`) |

Every MinIO response is **bare** — no `data` wrapper:

| Route | Body |
|---|---|
| `POST /presign` | `{ uploadUrl, objectKey, bucket, fileObjectId, expiresIn }` (`expiresIn` = 900 s) |
| `POST /finalize` | `{ jobId, fileObjectId }` |
| `POST /minio-avatars` | `{ jobId, fileObjectId }` |
| `POST /minio-uploads` | `{ jobId, fileObjectId }` |
| `GET /jobs/:jobId` | `{ status, errorMessage, fileObjectId, materialId, objectKey, sizeBytes, bytesProcessed }` |
| `GET /files/:id/url` | `{ url, expiresIn }` |
| `DELETE /files/:id` | `204` |

`POST /presign` body: `{ filename, contentType, sizeBytes, category, courseId?, metadata? }`.
`sizeBytes` is required; `category` is one of `course_material`, `avatar`,
`course_thumbnail`, `other`. Extensions in `{zip, rar, 7z, tar, gz, exe, dll, bat, sh, msi}`
are rejected with `400`.

---

### Community

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/community/posts` | List posts. Filters + `?page`, `?pageSize` | public |
| `POST` | `/api/v1/community/posts` | Create a post | **auth** |
| `GET` | `/api/v1/community/posts/:postId` | Post with nested comments. `?track_view=true` | **optional** |
| `PATCH` | `/api/v1/community/posts/:postId` | Update the post (author only) | **auth** |
| `DELETE` | `/api/v1/community/posts/:postId` | Delete the post (author only) | **auth** |
| `PATCH` | `/api/v1/community/posts/:postId/resolve` | Toggle the resolved flag | **auth** |
| `POST` | `/api/v1/community/posts/:postId/comments` | Create a comment | **auth** |
| `DELETE` | `/api/v1/community/comments/:commentId` | Delete the comment (author only) | **auth** |
| `POST` | `/api/v1/community/presence/heartbeat` | Record activity | **auth** |
| `GET` | `/api/v1/community/presence/users` | Presence statuses | **auth** |

`GET /community/posts/:postId` is the **only endpoint in the app with optional
authentication**. It returns the same body either way; `?track_view=true`
increments the view counter only for a signed-in caller.

`GET /community/presence/users` returns the **caller's own** presence only. It
ignores any user-id parameter.

**Responses**

| Route | Body |
|---|---|
| `GET /posts` | `{ posts, total, page, pageSize, hasMore }` |
| `POST /posts` | **bare** post |
| `GET /posts/:postId` | **bare** `{ id, author, title, …, comments }` — note `commentCount` is **not** present here, only on list items |
| `PATCH /posts/:postId` | **bare** post |
| `PATCH /posts/:postId/resolve` | **bare** post |
| `POST /posts/:postId/comments` | **bare** comment |
| `DELETE /comments/:commentId` | `204` |
| `POST /presence/heartbeat` | **bare** `{ userId, isOnline, lastSeen }` |
| `GET /presence/users` | `{ users: [ … ] }` |

**Errors** — community mixes two shapes: zod validation failures return
`{ error: "<message>" }`, while not-found, auth and 500 failures return
`{ detail: "<message>" }`.

---

### Spaced Repetition (SRS)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/srs/decks` | Create an empty deck | **auth** |
| `GET` | `/api/v1/srs/decks` | List decks. `?page`, `?pageSize` | **auth** |
| `GET` | `/api/v1/srs/decks/:deckId` | Deck detail with cards and stats | **auth** |
| `PATCH` | `/api/v1/srs/decks/:deckId` | Update title / description | **auth** |
| `DELETE` | `/api/v1/srs/decks/:deckId` | Delete the deck (cascade) | **auth** |
| `POST` | `/api/v1/srs/decks/:deckId/generate` | AI-generate cards | **auth** (owner only) |
| `GET` | `/api/v1/srs/decks/:deckId/stats` | Deck statistics | **auth** |
| `GET` | `/api/v1/srs/due` | Cards due for review. `?deckId`, `?limit` | **auth** |
| `POST` | `/api/v1/srs/review` | Submit a review (SM-2) | **auth** |
| `GET` | `/api/v1/srs/cards/:cardId` | One card | **auth** |
| `DELETE` | `/api/v1/srs/cards/:cardId` | Delete a card | **auth** |
| `GET` | `/api/v1/srs/health` | Liveness | public |

`POST /srs/review` body: `{ cardId, rating }` where `rating` is **one of `0`,
`2`, `3`, `4`** (again / hard / good / easy). Any other value is a `400`.

**Responses**

| Route | Body |
|---|---|
| `GET /decks` | `{ decks, total, page, pageSize }` |
| `GET /decks/:deckId` | `{ deck, cards, cardsTotal, stats, page, pageSize }` |
| `POST /decks/:deckId/generate` | `{ inserted, cards, generatedBy }` |
| `GET /due` | `{ cards, total }` |
| `POST /review` | `{ card, review }` |
| `GET /cards/:cardId` | `{ card }` |
| `GET /decks/:deckId/stats` | bare stats object |

---

### Quiz

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/quiz/sets` | Create an empty quiz set | **auth** |
| `GET` | `/api/v1/quiz/sets` | List quiz sets. `?page`, `?pageSize` | **auth** |
| `GET` | `/api/v1/quiz/sets/:quizSetId` | Set detail with questions and stats | **auth** |
| `PATCH` | `/api/v1/quiz/sets/:quizSetId` | Update the set | **auth** |
| `DELETE` | `/api/v1/quiz/sets/:quizSetId` | Delete the set | **auth** |
| `POST` | `/api/v1/quiz/sets/:quizSetId/generate` | AI-generate MCQs | **auth** (owner only) |
| `GET` | `/api/v1/quiz/sets/:quizSetId/stats` | Quiz set statistics | **auth** |
| `GET` | `/api/v1/quiz/sets/:quizSetId/attempts` | Paginated attempt history | **auth** |
| `POST` | `/api/v1/quiz/attempts` | Start an attempt | **auth** |
| `GET` | `/api/v1/quiz/attempts/:attemptId` | Attempt with answers and questions | **auth** |
| `POST` | `/api/v1/quiz/attempts/:attemptId/answers` | Submit one answer | **auth** |
| `POST` | `/api/v1/quiz/attempts/:attemptId/finish` | Finish the attempt | **auth** |
| `POST` | `/api/v1/quiz/attempts/:attemptId/to-srs` | Wrong answers → SRS deck | **auth** |
| `GET` | `/api/v1/quiz/stats` | User-wide quiz statistics | **auth** |
| `GET` | `/api/v1/quiz/health` | Liveness | public |

`POST /quiz/attempts/:attemptId/finish` body: `{ durationSeconds?, createSrsDeck? }`.
`createSrsDeck` defaults to `true`.

**Responses**

| Route | Body |
|---|---|
| `GET /sets` | `{ sets, total, page, pageSize }` |
| `GET /sets/:quizSetId` | `{ set, questions, stats }` |
| `POST /sets/:quizSetId/generate` | `{ inserted, questions, generatedBy }` |
| `GET /sets/:quizSetId/attempts` | `{ attempts, total, page, pageSize }` |
| `POST /attempts` | `{ attempt, questions }` |
| `GET /attempts/:attemptId` | `{ attempt, answers, questions }` |
| `POST /attempts/:attemptId/answers` | `{ answer, isCorrect, correct, correctText, explanation }` |
| `POST /attempts/:attemptId/finish` | `{ attempt, srsDeck, wrongQuestions, weakTopics }` |
| `POST /attempts/:attemptId/to-srs` | `{ srsDeck, inserted }` |
| `GET /sets/:quizSetId/stats` | bare object — `{ attempts, best_score, avg_score, total_correct, total_questions, last_taken }` |
| `GET /quiz/stats` | bare object |

> The quiz statistics object uses **snake_case** keys, unlike every other quiz
> and gamification payload, which are camelCase.

---

### Mind maps

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/mindmaps/health` | Liveness | public |
| `POST` | `/api/v1/mindmaps` | Create an empty mind map | **auth** |
| `GET` | `/api/v1/mindmaps` | List mind maps. `?page`, `?pageSize` | **auth** |
| `GET` | `/api/v1/mindmaps/:mindMapId` | Mind map detail with the full graph | **auth** |
| `DELETE` | `/api/v1/mindmaps/:mindMapId` | Delete the mind map | **auth** |
| `POST` | `/api/v1/mindmaps/:mindMapId/generate` | AI-generate a concept graph | **auth** (owner only) |

**Responses**

| Route | Body |
|---|---|
| `GET /mindmaps` | `{ mindMaps, total, page, pageSize }` |
| `GET /mindmaps/:mindMapId` | `{ mindMap }` |
| `POST /mindmaps/:mindMapId/generate` | `{ inserted, nodeCount, graph, mindMap, generatedBy }` — note `nodeCount`, camelCase |

---

### Gamification

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/gamification/award` | Award XP for a source | **auth** |
| `GET` | `/api/v1/gamification/stats` | Level, XP and streak | **auth** |
| `GET` | `/api/v1/gamification/xp` | XP history. `?limit`, `?cursor` | **auth** |
| `GET` | `/api/v1/gamification/badges` | All badges with an `earned` flag | **auth** |
| `GET` | `/api/v1/gamification/health` | Liveness | public |

`POST /award` body: `{ source, metadata? }`. The **server** decides the XP amount
from `XP_<SOURCE>` (e.g. `XP_QUIZ_CORRECT=5`). A client-supplied `amount` is
accepted by the schema but ignored.

`GET /xp` uses a keyset cursor of the form `"<createdAt>|<id>"`, passed as
`?cursor=`.

`GET /stats` returns a bare `{ totalXp, level, xpToNextLevel, progressPct, currentStreak, longestStreak, lastActiveDate }`.

---

### Admin

The admin console has its own session and its own error shape.

| Method | Path | Description | Gate |
|---|---|---|---|
| `POST` | `/api/v1/admin/auth/login` | Admin sign-in — requires an active `admin_members` row | public (`adminAuthLimiter`) |
| `POST` | `/api/v1/admin/auth/forgot` | Trigger the password-reset flow | public (`adminAuthLimiter`) |
| `POST` | `/api/v1/admin/auth/logout` | Clear the session cookie and write an audit entry | admin member |
| `POST` | `/api/v1/admin/auth/change-password` | Change your own password. Body: `{ currentPassword, newPassword }` | admin member |
| `GET` | `/api/v1/admin/me` | Current admin member | admin member |
| `GET` | `/api/v1/admin/members` | List members. `?status`, `?role`, `?limit` (max 200), `?offset` | admin + role `admin` |
| `GET` | `/api/v1/admin/members/:id` | One member | admin member |
| `POST` | `/api/v1/admin/members` | Create a member | admin member + `can_manage_members` |
| `DELETE` | `/api/v1/admin/members/:id` | Soft-delete a member | admin member + `can_manage_members` |
| `PUT` | `/api/v1/admin/members/:id` | Update role / status | admin member + `can_manage_members` |
| `PUT` | `/api/v1/admin/members/:id/permissions` | Update permissions | admin member + `can_manage_members` |
| `GET` | `/api/v1/admin/members/:id/activity` | Member activity log | admin member |
| `GET` | `/api/v1/admin/members/:id/audit` | Member audit log | admin member + `can_view_audit` |

Permissions are exactly one of `can_manage_members`, `can_manage_courses`,
`can_view_audit`.

`POST /admin/auth/login` uses the same bcrypt flow and sets the same cookie. If
the signed-in user has no active `admin_members` row, the server signs them back
out and returns `401 { error: { code: "not_admin_member", message: "Invalid credentials" } }`.

`POST /admin/auth/change-password` writes through to the same `profiles` row the
regular auth flow uses, so the new password also works on `POST /signin`. It
requires the current password, writes a `password_changed` audit entry, and
rejects a new password under 6 characters or identical to the current one. The
bootstrap `ADMIN_PASS` in the env file is **not** reapplied on restart — the
password the admin chooses wins.

Responses are `{ data: { member } }` or `{ data: { ok: true } }`.

---

### Quiz battle

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/quiz-battle/profile` | Battle profile — wins, losses, draws, level score, tier | **auth** |
| `GET` | `/api/v1/quiz-battle/matches` | Match history. `?page`, `?pageSize` | **auth** |
| `GET` | `/api/v1/quiz-battle/matches/:matchId` | Match detail with questions, answers and scores | **auth** |
| `GET` | `/api/v1/quiz-battle/courses` | Course list for battle selection | **auth** |
| `GET` | `/api/v1/quiz-battle/health` | Liveness | public |
| `GET` | `/api/v1/quiz-battle/notifications` | Notifications. `?limit` (default 50, max 200) | **auth** |
| `POST` | `/api/v1/quiz-battle/notifications/:id/read` | Mark a notification read | **auth** |
| `GET` | `/api/v1/quiz-battle/friend-code` | Your own 8-digit friend code (minted on first read) | **auth** |
| `POST` | `/api/v1/quiz-battle/friend-code/regenerate` | Replace your friend code — the old one stops resolving | **auth** |
| `POST` | `/api/v1/quiz-battle/invites` | Send a "play with a friend" invitation. `{ courseId, friendCode }` | **auth** |
| `POST` | `/api/v1/quiz-battle/invites/:inviteId/accept` | Accept an invitation — starts the match if you are available | **auth** |
| `POST` | `/api/v1/quiz-battle/invites/:inviteId/decline` | Decline an invitation ("No play") | **auth** |
| `GET` | `/api/v1/quiz-battle/invites` | Invitation bell entries. `?limit` (default 50, max 200) | **auth** |
| `POST` | `/api/v1/quiz-battle/invites/notifications/:id/read` | Mark an invitation bell entry read | **auth** |

**Responses**

| Route | Body |
|---|---|
| `GET /profile` | `{ profile }` |
| `GET /matches` | `{ matches, total, page, pageSize }` |
| `GET /matches/:matchId` | `{ match, you, questions, answers, scores }` |
| `GET /courses` | `{ courses }` |
| `GET /notifications` | `{ notifications }` |
| `POST /notifications/:id/read` | `{ ok: true }` |
| `GET /friend-code` | `{ friendCode }` |
| `POST /friend-code/regenerate` | `{ friendCode }` |
| `POST /invites` | `{ inviteId, invitee, expiresAt }` |
| `POST /invites/:inviteId/accept` | `{ matchId, courseId }` |
| `POST /invites/:inviteId/decline` | `{ ok: true }` |
| `GET /invites` | `{ notifications }` |
| `POST /invites/notifications/:id/read` | `{ ok: true }` |

#### Play with a friend

Each user has a unique **8-digit numeric friend code**, shown on their profile page
and copyable. The code is minted lazily on the first read and can be replaced with
`POST /friend-code/regenerate` — the old code then no longer resolves to anybody.
Invitations are bound to the resolved user id, so regenerating does not break an
invitation that is already pending.

An invitation is created with `POST /invites`:

```json
{ "courseId": "<uuid>", "friendCode": "12345678" }
```

The **sender** picks the course. The invitation is valid for **10 minutes** and only
one pending invitation may exist per sender/invitee pair.

`POST /invites/:inviteId/accept` is a three-phase operation:

1. **In the transaction** — authorise the invitee, check the invitation is still
   pending and unexpired, check the invitee is *available* (not in a live match and
   holding a connected socket), read both level scores, and **atomically claim** the
   invitation.
2. **Commit** — the claim is committed before any AI call, so a failed question
   generation can never roll the claim back.
3. **Outside the transaction** — the match is created and dispatched. If generation
   fails the invitation is marked `unavailable` / `generation_failed` and both
   parties are notified.

The claim is a single conditional `UPDATE`, so two concurrent accepts cannot both
win — the loser gets `409`.

Status codes on accept:

| Code | Meaning |
|---|---|
| `200` | Accepted — the match started, `{ matchId, courseId }` |
| `403` | The invitation is addressed to somebody else |
| `404` | No such invitation |
| `409` | Already handled, or the invitee is busy/offline (`unavailable`) |
| `410` | The invitation expired |
| `429` | Rate limited |
| `503` | The match could not be created (question generation failed) |

`GET /invites` returns the bell entries. Each entry carries the **current status of
the invitation** alongside the historical bell entry, so the client only offers the
"No play" / "Let's play" buttons while the invitation is still `pending`:

```json
{
  "notifications": [
    {
      "id": "<uuid>",
      "inviteId": "<uuid>",
      "kind": "invite",
      "payload": { "inviteId": "...", "courseName": "...", "senderName": "...", "expiresAt": "..." },
      "createdAt": "2026-11-16T12:00:00.000Z",
      "readAt": null,
      "inviteStatus": "pending",
      "inviteExpiresAt": "2026-11-16T12:10:00.000Z"
    }
  ]
}
```

The `kind` is one of `invite`, `invite_sent`, `invite_declined`,
`invite_unavailable`, `invite_expired`, `invite_accepted`.

Live battles run over Socket.IO, not HTTP — see
[WebSocket](#websocket-socketio).

---

## Server-sent events

The **only** SSE endpoint in the codebase:

```
POST /api/v1/chat/:chatId/message?stream=true
```

`?stream=1` works too. The response headers are `Content-Type: text/event-stream`,
`Cache-Control: no-cache` and `Connection: keep-alive`.

**Frame format**

```
event: <name>
data: <json>

```

**Event names**

| Event | Meaning | `data` payload |
|---|---|---|
| `start` | The run has begun | `{ content: "" }` |
| `token` | One streamed token | `{ content: "<token>" }` |
| `tool_call` | The agent called a tool | `{ content: "<json string>", name: "<tool>", input: { … } }` |
| `tool_result` | The tool returned | `{ content: "<json string>", name: "<tool>", output: { … } }` |
| `end` | The final assistant message | `{ content: "<full reply>" }` |
| `error` | The run failed | `{ content: "<message>" }` |

**Payload rule.** For `tool_call` and `tool_result` the object's own keys are
spread at the top level of `data`, *and* the whole object is JSON-stringified
into `data.content`. For every other event `data` is just
`{ content: <string> }`.

```js
const res = await fetch('/api/v1/chat/<id>/message?stream=true', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ content: 'Explain gradients' }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop();
  for (const frame of frames) {
    const event = /^event:\s*(.+)$/m.exec(frame)?.[1];
    const data = JSON.parse(/^data:\s*(.+)$/m.exec(frame)?.[1] ?? '{}');
    if (event === 'token') append(data.content);
  }
}
```

---

## WebSocket (Socket.IO)

- **Endpoint:** `/socket.io/` — the Socket.IO default path. There is no custom
  path and no custom namespace; only the default `/` namespace is used.
- **Auth:** the handshake reads the `sb-access-token` cookie from
  `socket.handshake.headers.cookie` (URL-decoded) or `socket.handshake.auth.token`.
  On failure the connection is rejected with `unauthorized: no token`,
  `unauthorized: invalid token` or `unauthorized`.
- **Rooms:** every socket joins `user:<userId>`. On reconnect it also joins
  `match:<matchId>` if a live match is found.

### Client → server

| Event | Payload | Limit |
|---|---|---|
| `battle:queue` | `{ courseId }` | 1 / 5 s |
| `battle:cancel` | – | 5 / 1 s |
| `battle:join` | `{ matchId }` | 10 / 60 s |
| `battle:answer` | `{ matchId, questionId, selected, timeSeconds }` — `selected` is `A`\|`B`\|`C`\|`D` | 5 / 1 s |
| `battle:ping` | `{ matchId }` | none |
| `battle:leave` | `{ matchId }` | 5 / 60 s |

### Server → client

| Event | Emitted to | Payload |
|---|---|---|
| `battle:matched` | the socket | `{ matchId, courseId, questionCount, durationMs, startedAt, questions, opponent, you, scores, answeredPositions, inactivitySec? }` |
| `battle:score` | `match:<matchId>` | `{ matchId, scores, lastAnswer: { userId, questionId, isCorrect }, inactivitySec? }` |
| `battle:error` | the socket | `{ message, fatal? }` |
| `battle:inactivity` | `match:<matchId>` | `{ matchId, inactivitySec }` |
| `battle:ended` | `match:<matchId>` | `{ matchId, winner, reason, scores }` — `reason` is `player_left`, `inactivity_forfeit`, `completed` or `time_up` |
| `battle:notification` | `user:<userId>` | `{ id, matchId, kind, payload, createdAt }` |
| `battle:invite` | `user:<userId>` | `{ id, inviteId, kind, payload, createdAt }` — a "play with a friend" invitation. `kind` is `invite`, `invite_sent`, `invite_declined`, `invite_unavailable`, `invite_expired` or `invite_accepted` |
| `battle:rate-limit-rejected` | the socket | `{ action, retryAfterMs, limit, windowMs }` |

`battle:invite` is a **separate event** from `battle:notification` on purpose:
`battle:notification` carries a required `matchId` and a four-value `kind` union,
which cannot express a pre-match invitation.

The per-socket limits are in-memory, hardcoded and not controlled by any env var.

---

## File uploads

All multipart endpoints use the field name **`file`** and `multer` with
`memoryStorage()`.

| Endpoint | Size limit | Type restriction |
|---|---|---|
| `POST /api/v1/courses/:courseId/materials` | **none at the multer layer** | none — `file_type` is declared metadata, not derived from the bytes |
| `POST /api/v1/storage/avatars` | `STORAGE_MAX_UPLOAD_BYTES` (default 10 MB) | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| `POST /api/v1/storage/minio-avatars` | 10 MB (multer) + **4 MB** in-handler cap | none |
| `POST /api/v1/storage/minio-uploads` | 10 MB (multer) + **4 MB** in-handler cap | none |

The 4 MB in-handler cap returns
`413 { detail: "File too large for this upload path (>4MB). Use the presigned PUT upload instead." }`.
For anything larger use `POST /api/v1/storage/presign` and upload directly to
object storage.

> `settings.ALLOWED_EXTENSIONS` (`.txt, .jpg, .jpeg, .png, .pdf`) exists in the
> config but is **not referenced by any route**. It does not restrict uploads.

---

## Health & service endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | `{ message, version, environment, timestamp }` |
| `GET` | `/health` | `{ status: "ok", database: "connected" }` (200) or `{ detail, database }` (500) |
| `GET` | `/contents/*` | Static file server over `backend/contents/` |

Per-agent liveness probes, all **public** and all returning a bare object:

```
GET /api/v1/srs/health
GET /api/v1/quiz/health
GET /api/v1/mindmaps/health
GET /api/v1/gamification/health
GET /api/v1/quiz-battle/health
```
