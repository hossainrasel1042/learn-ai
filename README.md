<div align="center">

# 🎓 LearnAI — Intelligent Academic Learning Platform
### AI-Powered Supplementary Study, Real-Time Quiz Battles & Spaced Repetition for Universities

*Transforming fragmented course materials — lecture slides, PDFs, codebases, and forum discussions — into an organized, queryable, citation-grounded knowledge base with multi-agent tutoring and adaptive learning.*

<p align="center">
  <a href="#-preview--screenshots"><strong>Explore Screenshots »</strong></a>
  •
  <a href="#documentation">Documentation</a>
  •
  <a href="#the-stack">Architecture</a>
  •
  <a href="#features">Features</a>
  •
  <a href="#running-the-stack">Get Started</a>
</p>

</div>

---

## 📸 Preview & Screenshots

### 👨‍🎓 Student Learning Portal & AI Tutor
> Unified student workspace featuring intelligent AI chat tutor, course materials, concept mind maps, and interactive study tools.

![Student Learning Portal](screenshot/student_panel.png)

---

### ⚔️ Real-Time Head-to-Head Quiz Battles
> Live multiplayer competitive learning arena with real-time matchmaking, Socket.IO duplex event sync, instant scoring, and match reviews.

![Quiz Battle Arena](screenshot/battle.png)

---

### 🛡️ Admin & Moderation Console
> Comprehensive governance console featuring granular RBAC permissions, member management, audit log streaming, and course material uploads.

![Admin & Moderation Console](screenshot/admin.png)

---

## Documentation

| Document | What it covers |
|---|---|
| [`project.md`](./project.md) | What LearnAI is, who it is for, and what each of the ten feature areas does — plain language, no code |
| [`api.md`](./api.md) | Complete HTTP API reference: every route, request shape, response envelope, error shape, SSE event and WebSocket event |
| [`schema.md`](./schema.md) | The full database schema: all 33 tables, columns, constraints, foreign keys and indexes |
| [`instruction.md`](./instruction.md) | Step-by-step setup, run and **deployment** guide (Render + Vercel) |

---

## The stack

Two services plus infrastructure, run together with Docker Compose.

```
┌──────────────┐      ┌────────────────────────────────────────┐
│   Browser    │ ───► │  Frontend (Next.js 16, port 3000)      │
│              │      │   - React 19 + TypeScript + Tailwind 4 │
│              │      │   - apiFetch() → Express (no SDK)      │
└──────────────┘      └─────────┬──────────────────────────────┘
                                │  REST + SSE + Socket.IO
                                ▼
┌────────────────────────────────────────────────────────────────┐
│  Backend (Express + LangGraph.js, port 8000)                  │
│                                                                │
│   /api/v1/*        — auth, users, chat, courses, community,   │
│                      srs, quiz, mindmaps, gamification,        │
│                      admin, quiz-battle, storage              │
│   /socket.io/      — real-time quiz battles                   │
│   /contents/*      — static served files                      │
│                                                                │
│   Modules (backend/src/):                                     │
│     config/         zod-validated settings, pg pool, chroma   │
│     utils/          winston logger, prompt channel hardening  │
│     middlewares/    JWT auth (cookie + bearer), error handler │
│     services/       bcrypt, tokens, Gemini, Cohere, vector    │
│     models/         pg repositories (raw SQL)                 │
│     rag_engine/     chunkers, hybrid retriever, reranker      │
│     chat-agent/     LangGraph StateGraph + 6 tools           │
│     auth/           signup / signin / forgot / reset          │
│     cms_agent/      courses, materials, tags, semantic search │
│     community_agent/ posts, comments, presence, AI bot        │
│     srs_agent/      SM-2 spaced repetition                    │
│     quiz_agent/     MCQ generation + SRS conversion           │
│     mindmap_agent/  concept-tree generation                   │
│     gamification_agent/ XP, level, streak, badges             │
│     quiz_battle_agent/ + realtime/  head-to-head battles      │
│     admin_agent/    RBAC, members, audit log                  │
│     content_gen_engine/ theory + lab write-up pipeline        │
│     queue/          BullMQ upload worker                     │
└────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌──────────────────┐    ┌──────────────────┐
│ Postgres      │      │ ChromaDB         │    │ SeaweedFS        │
│ (33 tables)   │      │ (vector store)   │    │ (S3-compatible   │
│ + pgvector    │      │ :8001 → :8000    │    │  object storage) │
└───────────────┘      └──────────────────┘    └──────────────────┘
                                │
                          ┌─────┴─────┐
                          │   Redis   │  rate limits + BullMQ
                          └───────────┘
```

---

## Features

- **Chat Agent (LangGraph)** — a multi-turn tutor that calls six tools: search its own chat history, search course material, Wikipedia, DuckDuckGo, generate validated code, and generate learning content. Replies stream token-by-token over SSE and tool calls are visible in the UI. Voice in and voice out via the browser Web Speech API.
- **RAG Engine** — hybrid BM25 + dense retrieval fused with Reciprocal Rank Fusion, then reranked. Cohere `embed-v4.0` embeddings, ChromaDB vector store, chunkers for PDF, PPTX and source code. Ingestion runs automatically on upload.
- **CMS** — courses with codes, materials with metadata and tags, and semantic search across everything. Students browse read-only; uploading is gated on the `can_manage_courses` permission.
- **Community Forum** — threads in `theory` / `lab` / `general`, a resolve toggle, presence, and an AI bot that answers via RAG when a `@mentioned` classmate is offline.
- **SRS Flashcards** — SM-2 scheduling with Again / Hard / Good / Easy. Decks are generated from course material, a chat conversation, or pasted text.
- **Adaptive Quiz** — AI-generated MCQs with exactly four options, one correct answer and an explanation. Instant per-question feedback, weak-topic detection, attempt history. **Wrong answers automatically become an SRS deck** titled *"Quiz Review: \<quiz\> (date)"*.
- **Quiz Battle** — real-time head-to-head duelling over Socket.IO. Genuine matchmaking by course and level score, live score events, inactivity forfeit, and match replay.
- **Concept Mind Maps** — AI-generated concept trees (root plus two to three levels), stored as JSONB and rendered as read-only React Flow graphs with pan, zoom and a minimap.
- **Content Generation** — a planner → theory writer → code writer → renderer pipeline that produces full write-ups with syntax-checked, sandbox-executed code, Mermaid diagrams and optional PDF output. Reachable through the chat agent's tool.
- **Gamification** — XP, levels (`floor(sqrt(xp/100)) + 1`), a 36-hour streak grace window, and eight badges. Surfaces in a chat-header streak pill, the profile Stats tab and `/achievements`.
- **Admin Console** — members, roles, permissions (`can_manage_members`, `can_manage_courses`, `can_view_audit`), an audit trail, the material upload UI and a storage browser.
- **Auth** — **self-hosted**. bcrypt password hashing (10 rounds) against the `profiles` table, and a self-signed HS256 JWT delivered as an `HttpOnly` cookie. No Supabase Auth, no OAuth provider, no confirmation email.

---

## Tech stack

### Backend — `backend/`

| Concern | Library |
|---|---|
| HTTP | `express` 4 |
| Validation | `zod` |
| Auth | `bcryptjs` + `jsonwebtoken` + `cookie-parser` |
| LLM orchestration | `@langchain/langgraph`, `@langchain/core`, `@langchain/google-genai` |
| Database | `pg` (raw SQL, no ORM) |
| Vector store | `chromadb` |
| Embeddings | Gemini (`gemini-embedding-001`, 3072-dim) over the REST API |
| Reranking | `cohere-ai` (optional — retrieval degrades to embedding-only without it) |
| Image generation | `@google/generative-ai` (Gemini) |
| File upload | `multer` |
| Queue | `bullmq` + `ioredis` |
| Object storage | `@aws-sdk/client-s3` (SeaweedFS, S3 API) |
| Realtime | `socket.io` |
| Rate limiting | `express-rate-limit` + `rate-limit-redis` |
| Security | `helmet`, `cors`, `compression` |
| Logging | `winston` |

### Frontend — `frontend/`

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4 + shadcn/ui
- Framer Motion, SWR, `react-markdown` + `remark-gfm`, mermaid, highlight.js
- `@xyflow/react` for mind maps, `socket.io-client` for battles
- **No** Supabase JS SDK, **no** ORM, **no** server actions for auth — every call goes through `src/lib/api.ts` → `/api/v1/*` with `credentials: 'include'`

---

## Project layout

```
LearnAI/
├── backend/                      # Express API
│   ├── src/
│   │   ├── index.js              # app wiring, router mounts, Socket.IO
│   │   ├── worker.js             # dedicated BullMQ upload worker
│   │   ├── config/               # settings, db pool, chromadb, limiter
│   │   ├── utils/                # logger, prompt channels
│   │   ├── middlewares/          # auth, error handler, request logger
│   │   ├── api/                  # /test-ai, /test-model
│   │   ├── services/             # bcrypt, token, cookie, Gemini, Cohere,
│   │   │                         # vector store, storage, image gen
│   │   ├── models/               # pg repositories (raw SQL)
│   │   ├── rag_engine/           # chunkers, hybrid retriever, reranker
│   │   ├── chat-agent/           # LangGraph agent + 6 tools
│   │   ├── auth/                 # signup / signin / forgot / reset
│   │   ├── users/                # profile PATCH / DELETE
│   │   ├── storage/              # Supabase avatar bucket
│   │   ├── storage_minio/        # SeaweedFS presign + multipart
│   │   ├── cms_agent/            # courses, materials, tags, search
│   │   ├── community_agent/      # posts, comments, presence, bot
│   │   ├── srs_agent/            # SM-2 flashcards
│   │   ├── quiz_agent/           # MCQ generator + SRS conversion
│   │   ├── mindmap_agent/        # concept trees
│   │   ├── gamification_agent/   # XP, level, streak, badges
│   │   ├── quiz_battle_agent/    # battle REST surface
│   │   ├── admin_agent/          # RBAC, members, audit
│   │   ├── realtime/             # Socket.IO server + battle handlers
│   │   ├── queue/                # BullMQ queues
│   │   └── content_gen_engine/   # theory + lab pipeline
│   ├── sql/                      # 14 migrations, applied in filename order
│   ├── scripts/                  # Playwright verification suites
│   ├── Dockerfile
│   └── .env.example
├── frontend/                     # Next.js 16
│   ├── src/
│   │   ├── app/                  # 33 routes: public, protected, admin
│   │   ├── components/           # shadcn/ui + feature components
│   │   ├── hooks/                # use-chat, use-auth, use-battle-match…
│   │   ├── providers/            # auth provider
│   │   ├── lib/                  # api.ts (apiFetch), per-feature clients
│   │   └── types/
│   ├── Dockerfile
│   └── .env.example
├── chroma/                       # ChromaDB healthcheck wrapper
├── seaweedfs/                    # healthcheck wrapper (the signing key comes from the env)
├── render.yaml                   # Render blueprint (backend web service)
├── docker-compose.yml            # 6 services
├── api.md  schema.md  project.md  instruction.md  README.md
```

---

## Environment variables

The full annotated list lives in [`backend/.env.example`](./backend/.env.example) and [`frontend/.env.example`](./frontend/.env.example). The essentials:

### Backend — `backend/.env`

| Var | Required | Default | Notes |
|---|---|---|---|
| `ENVIRONMENT` | – | `development` | `production` enables secure cookies and `SameSite=None` |
| `PORT` | – | `8000` | |
| `DB_URL` | ✅ | – | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | ✅ | – | **≥ 32 characters.** The server refuses to boot otherwise. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_ISSUER` | – | `learnai` | Verified on every token |
| `JWT_TTL_SECONDS` | – | `1800` | Session lifetime (30 minutes) |
| `REDIS_URL` | – | `redis://localhost:6379/0` | Rate limits + BullMQ |
| `CHROMA_HOST` / `CHROMA_PORT` | – | `localhost` / `8001` | Vector store. `8001` is the **published** port in `docker-compose.yml`; inside Docker the backend uses `chroma:8000` |
| `CHROMA_DATABASE` | – | `learnai` | Collection namespace |
| `CHROMA_API_KEY` / `CHROMA_TENANT` | – | – | Only for Chroma Cloud |
| `GEMINI_API_KEY` | ✅ | – | LLM **and** embeddings |
| `GEMINI_MODEL` | – | `gemini-3-flash-preview` | Flash tier — Pro models have a zero free-tier quota |
| `GEMINI_FALLBACK_MODELS` | – | `gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.7-flash` | Tried in order when the primary model is rate limited or out of its daily quota |
| `EMBEDDING_MODEL` | – | `gemini-embedding-001` | The embedding model (3072-dim vectors) |
| `COHERE_API_KEY` | – | – | **Optional.** Only the reranker uses it. The RAG pipeline no longer needs it — the Cohere trial tier is 1000 requests/month and silently breaks ingestion when it runs out |
| `FRONTEND_URL` | – | `http://localhost:3000` | Used to build the password-reset link |
| `RESEND_API_KEY` | – | – | Resend API key for the password-reset email. When unset the reset code is written to the backend log instead of being sent |
| `MAIL_FROM` | – | `onboarding@resend.dev` | The sender address. Must be a **verified** sender in Resend, otherwise the provider rejects the mail |
| `ADMIN_EMAIL` | – | – | The bootstrap administrator. When set, the backend creates the account and the `admin_members` row on boot |
| `ADMIN_PASS` | – | – | The **initial** admin password (≥ 6 characters). Only used when the account is first created — see below |
| `ADMIN_NAME` | – | email prefix | Display name for the bootstrap admin |
| `BACKEND_PUBLIC_URL` | – | `http://localhost:8000` | Public base URL of this API |
| `CORS_ORIGINS` | – | `http://localhost:3000` | **CSV. Must be specific origins, never `*`, when `CORS_CREDENTIALS=true`** — the browser rejects `*` with credentials and the session cookies will not be sent |
| `CORS_CREDENTIALS` | – | `true` | |
| `MINIO_ENDPOINT` | – | `localhost` | S3 endpoint. `seaweedfs` inside compose, `localhost` outside |
| `MINIO_PORT` | – | `9000` | |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | ✅ | – | SeaweedFS S3 credentials. Required — the backend throws at startup in production if unset |
| `SEAWEEDFS_JWT_SIGNING_KEY` | ✅ | – | SeaweedFS JWT signing key, exported to the container as `WEED_JWT_FILER_SIGNING_KEY` / `WEED_JWT_SIGNING_KEY`. Must stay stable across restarts |
| `MINIO_BUCKET_UPLOADS` / `MINIO_BUCKET_AVATARS` | – | `learnai` | |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | – | – | **Storage only** (avatar bucket). The service-role key bypasses RLS and must never reach the browser |
| `WORKER_INPROCESS` | – | `true` | `false` in compose so the dedicated worker container handles jobs |
| `UPLOAD_WORKER_CONCURRENCY` | – | `4` | In-process worker concurrency |
| `RATE_LIMIT_ENABLED` | – | `true` | |
| `RATE_LIMIT_TEST_BYPASS_SECRET` | – | – | Lets the verification suites bypass the auth limiter. Blank disables the bypass |
| `STORAGE_MAX_UPLOAD_BYTES` | – | `10485760` | Avatar size limit (10 MB) |
| `MAX_UPLOAD_SIZE` | – | `10485760` | JSON body limit (10 MB) |
| `XP_*` | – | see below | XP per source: SRS 10, quiz correct 5, quiz finished 20, mindmap 25, chat 2, material viewed 1 |
| `XP_CHAT_DAILY_CAP` | – | `50` | Daily chat XP cap |
| `STREAK_GRACE_HOURS` | – | `36` | Streak grace window |
| `SRS_DECK_SIZE` | – | `20` | Cards per generated deck |
| `QUIZ_DEFAULT_QUESTIONS` | – | `10` | Questions per generated quiz |
| `MINDMAP_DEFAULT_NODES` | – | `8` | Nodes per generated mind map |

### Frontend — `frontend/.env`

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Base URL for every backend request |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` | Host-visible backend URL, used for websockets and absolute URLs |
| `BACKEND_PROXY_ORIGIN` | `http://localhost:8000` | **Build-time only.** Next.js bakes `rewrites()` into the build, so this must be set when the app is built — not just at runtime |

> **Why `BACKEND_PROXY_ORIGIN` matters.** The rewrite proxy runs inside the frontend container and forwards `/api/v1/*` and `/contents/*` to the backend. Inside compose the backend is reachable by service name, so it must be `http://backend:8000` — `localhost:8000` would resolve back to the frontend container itself and every request would fail with `ECONNREFUSED`.

---

## Running the stack

```bash
# 1. Env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# fill in DB_URL, JWT_SECRET, GEMINI_API_KEY
# COHERE_API_KEY is optional — it only enables the reranker.

# 2. Apply the schema (in filename order)
for f in backend/sql/*.sql; do psql "$DB_URL" -f "$f"; done

# 3. Up
docker compose up --build
```

| Service | URL |
|---|---|
| App | <http://localhost:3000> |
| API | <http://localhost:8000> |
| API health | <http://localhost:8000/health> |
| ChromaDB | <http://localhost:8001> |
| SeaweedFS filer | <http://localhost:8889> |

### The admin account

The admin console lives at `/admin`. Its first account is created from the
environment — set these in `backend/.env` before the first boot:

```bash
ADMIN_EMAIL=you@example.com
ADMIN_PASS=a-strong-initial-password
ADMIN_NAME=Admin            # optional
```

On boot the backend creates the `profiles` row and the `admin_members` row
(`role = admin`, all three permissions) if they are missing. **It never
overwrites an existing password**, so `ADMIN_PASS` is only ever the *initial*
password.

Once you are in, change it under **Account → Change password** in the admin
console. The new password takes effect immediately and survives a restart —
`ADMIN_PASS` does not revert it.

Leaving `ADMIN_EMAIL` empty disables the bootstrap entirely. Other admins are
added from the console (**Members → Add member**), not from the env file.

### Without Docker

```bash
# Backend
cd backend && npm install && cp .env.example .env && npm run dev

# Frontend
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

You still need Postgres, Redis and a Chroma server running somewhere.

---

## Deployment

The backend deploys to **Render** and the frontend to **Vercel**.

The backend is deployed straight from the repository — Render reads the
[`render.yaml`](./render.yaml) blueprint from the repo root and builds the
`backend/Dockerfile` image itself:

1. Push the repository to GitHub.
2. In Render: **New → Blueprint** → select the repository → Render reads
   `render.yaml` and creates the service.
3. Fill in every variable marked `sync: false` in the Render dashboard.

Full setup instructions — including the required Render and Vercel secrets, the `render.yaml` blueprint and the CORS/cookie configuration — are in
**[`instruction.md` → Deployment](./instruction.md#deployment)**.

---

## API at a glance

Everything lives under `/api/v1`. The routers are mounted at the **bare** prefix — there is no `/api/v1/auth` or `/api/v1/cms` segment.

| Family | Prefix | Routes |
|---|---|---|
| Auth | `/api/v1` | `POST /signup`, `/signin`, `/verify-email`, `/signout`, `/forgot-password`, `/resend-otp`, `/verify-otp`, `/reset-password`, `/change-password`; `GET /me` |
| Users | `/api/v1` | `PATCH /me`, `DELETE /me` |
| CMS | `/api/v1` | `POST/GET /courses`, material CRUD, `/tags`, `/search`, `/materials/recent` |
| Course codes | `/api/v1/courses` | `GET /lookup`, `GET /picker` |
| Chat | `/api/v1/chat` | threads, messages, SSE streaming |
| Storage | `/api/v1/storage` | avatars, presign, finalize, jobs, file URLs |
| Community | `/api/v1/community` | posts, comments, presence |
| SRS | `/api/v1/srs` | decks, generation, due queue, SM-2 review |
| Quiz | `/api/v1/quiz` | sets, generation, attempts, answers, SRS conversion |
| Mind maps | `/api/v1/mindmaps` | create, generate, fetch, delete |
| Gamification | `/api/v1/gamification` | award, stats, XP history, badges |
| Admin | `/api/v1/admin` | auth, members CRUD, permissions, activity, audit, own password change |
| Quiz battle | `/api/v1/quiz-battle` | profile, matches, courses, notifications |

**Response envelopes vary by router.** Some routes return `{ data: … }`, some return bare objects, some return bare arrays, and some use named keys with `{ total, page, pageSize }`. There are also **five distinct error shapes**. Read [`api.md`](./api.md) before writing a client — assuming one shape will break you.

---

## Database

33 tables across two schemas:

- **`public`** (31 tables) — profiles, courses, materials, tags, community, quizzes, SRS, mind maps, gamification, admin RBAC, quiz battle
- **`chat_agent`** (2 tables) — LangGraph chat threads and messages

Migrations are plain SQL in `backend/sql/`, applied in filename order. There is no ORM and no migration runner.

> `quiz_schema.sql` is **not idempotent** — it adds a constraint without `IF NOT EXISTS`, so re-running it against an already-migrated database fails with SQLSTATE `42P07`. This is pre-existing.

Full column-level detail is in [`schema.md`](./schema.md).

---

## Troubleshooting

- **Backend refuses to boot** — `JWT_SECRET` is missing or shorter than 32 characters.
- **`Failed to connect to database`** — check `DB_URL`; Postgres must be reachable from the container or host.
- **CORS error: "credential is not supported if origin is '*'"** — set `CORS_ORIGINS` to specific origins, not `*`.
- **Sign-in works but every request 401s** — the cookies are not being sent. Confirm `CORS_ORIGINS` lists the exact frontend origin, the cookie host matches the URL the browser hits, and the frontend sends `credentials: 'include'`.
- **Password reset says "check the console"** — no mail provider is configured. Set `RESEND_API_KEY` and a verified `MAIL_FROM` to have the reset code emailed; without them the code is written to the backend log instead.
- **Admin login says "Invalid credentials"** — the account was not created. Set `ADMIN_EMAIL` and `ADMIN_PASS` in `backend/.env` and restart the backend; the log line `[admin] bootstrap created the admin profile for …` confirms it.
- **`/contents/...` returns 404** — `NEXT_PUBLIC_BACKEND_URL` must point at the host the browser can reach.
- **`/achievements` is empty or the streak widget never appears** — `gamification_schema.sql` was not applied.
- **Voice mic button missing** — the browser lacks the Web Speech API or `speechSynthesis` (Firefox desktop). The UI hides itself by design; no error is shown.
- **`npm install` peer-dependency conflict** — the backend installs with `--legacy-peer-deps`; `chromadb` declares an optional peer on an older `@google/generative-ai` than the project ships.
- **ChromaDB container permanently unhealthy** — the image ships no `curl` or `wget`, which is why the healthcheck is a wrapper script using `/dev/tcp`. The same applies to the SeaweedFS healthcheck.

---

## License

MIT License. Open-source educational platform.
