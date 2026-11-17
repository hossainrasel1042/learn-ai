# Setup & Deployment Instructions — LearnAI

Everything you need to run LearnAI locally and deploy it to production.

> **Related documents**
>
> | Document | What it covers |
> |---|---|
> | [`project.md`](./project.md) | What LearnAI is and what each feature does — plain language |
> | [`README.md`](./README.md) | Architecture, tech stack, environment variables, troubleshooting |
> | [`api.md`](./api.md) | Complete HTTP API reference |
> | [`schema.md`](./schema.md) | The database schema — all 33 tables |
> | [`render.yaml`](./render.yaml) | The Render blueprint — the service definition Render reads on import |

---

## Contents

**Local setup**
1. [Prerequisites](#1-prerequisites)
2. [Clone the repository](#2-clone-the-repository)
3. [Configure the environment](#3-configure-the-environment)
4. [Start the database](#4-start-the-database)
5. [Apply the schema](#5-apply-the-schema)
6. [Build and start the stack](#6-build-and-start-the-stack)
7. [Verify](#7-verify)
8. [Run without Docker](#8-run-without-docker)
9. [Stop and restart](#9-stop-and-restart)
10. [Common local issues](#10-common-local-issues)

**Deployment**
11. [Deployment overview](#deployment)
12. [Backend on Render](#deploy-backend-to-render)
13. [Frontend on Vercel](#deploy-frontend-to-vercel)
14. [Production configuration checklist](#production-configuration-checklist)
15. [Production troubleshooting](#production-troubleshooting)

---

# Local setup

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 (backend), ≥ 22 (frontend) | `node -v` |
| npm | ≥ 10 | `npm -v` |
| Docker | Engine 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` — the `docker compose` subcommand, not the legacy `docker-compose` |
| PostgreSQL | 14+ with `pgvector` | Or a managed instance |

**API keys you will need**

| Key | Where to get it | Needed for |
|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) | The LLM — chat, quizzes, flashcards, mind maps, content generation |
| `COHERE_API_KEY` | [Cohere dashboard](https://dashboard.cohere.com/api-keys) | **Optional.** Only the reranker. The RAG pipeline embeds with Gemini, so the project does not depend on a Cohere trial key |
| `CHROMA_API_KEY` + `CHROMA_TENANT` | [Chroma Cloud](https://trychroma.com) | Only if you use Chroma Cloud. Leave blank for a local ChromaDB server |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API | **Optional.** Storage only, for avatars. The primary object store is SeaweedFS |

> **Auth is self-hosted.** Signup, sign-in and password reset are handled by the backend itself against the `profiles` table using bcrypt and a self-signed JWT. You do **not** need Supabase Auth, and there is no OAuth provider and no confirmation email.

---

## 2. Clone the repository

```bash
git clone <your-repo-url> learnai
cd learnai
```

---

## 3. Configure the environment

### Backend — `backend/.env`

```bash
cp backend/.env.example backend/.env
```

Docker Compose reads a root `.env` for `${...}` interpolation. Point it at the
same file so the S3 credentials and the SeaweedFS signing key only ever live in
one place:

```bash
ln -sfn backend/.env .env
```

Without this, `docker compose` fails with
`required variable MINIO_ACCESS_KEY is missing a value` — the compose file
deliberately refuses to fall back to a built-in credential.

Fill in the essentials:

```bash
ENVIRONMENT=development
PORT=8000

# The database
DB_URL=postgresql://postgres:postgres@localhost:5432/learnai

# Session signing — REQUIRED, at least 32 characters.
# The server refuses to boot without it.
JWT_SECRET=<paste a 48-byte hex string>
JWT_ISSUER=learnai
JWT_TTL_SECONDS=1800

# AI providers
GEMINI_API_KEY=<...>
GEMINI_MODEL=gemini-3-flash-preview
# Optional — only the reranker uses it. The RAG pipeline embeds with Gemini.
COHERE_API_KEY=<...>
EMBEDDING_MODEL=gemini-embedding-001

# Vector store — leave the key/tenant blank for a local ChromaDB server
# 8001 is the published port in docker-compose.yml; inside Docker use chroma:8000
CHROMA_HOST=localhost
CHROMA_PORT=8001
CHROMA_DATABASE=learnai
CHROMA_API_KEY=
CHROMA_TENANT=

# Redis
REDIS_URL=redis://localhost:6379/0

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://localhost:8000

# CORS — must be a SPECIFIC origin, never "*".
# The browser rejects "*" when credentials are sent, and the session
# cookies will not be sent cross-origin.
CORS_ORIGINS=http://localhost:3000
CORS_CREDENTIALS=true

# Object storage (SeaweedFS). Inside Docker Compose the host is "seaweedfs";
# outside compose it is "localhost".
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=<...>
MINIO_SECRET_KEY=<...>
MINIO_BUCKET_UPLOADS=learnai
MINIO_BUCKET_AVATARS=learnai

# SeaweedFS JWT signing key. Exported into the container as
# WEED_JWT_FILER_SIGNING_KEY and WEED_JWT_SIGNING_KEY.
# Keep it stable across restarts — rotating it invalidates issued JWTs.
SEAWEEDFS_JWT_SIGNING_KEY=<...>

# The bootstrap administrator. When ADMIN_EMAIL is set, the backend creates
# the account and the admin_members row on boot, using ADMIN_PASS as the
# initial password. Change it later under Account -> Change password in the
# admin console; a restart never reverts that.
# ADMIN_PASS must be at least 6 characters. Leave ADMIN_EMAIL empty to
# disable the bootstrap.
ADMIN_EMAIL=you@example.com
ADMIN_PASS=<...>
# ADMIN_NAME=Admin
```

Generate strong secrets for `JWT_SECRET`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY` and `SEAWEEDFS_JWT_SIGNING_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are required. Compose uses
> `${VAR:?message}` so a missing value fails at startup instead of falling back
> to a default, and the backend throws in production rather than silently
> downgrading to a weaker credential.

> Inside Docker Compose, `docker-compose.yml` overrides `REDIS_URL` to
> `redis://redis:6379/0` and `CHROMA_HOST`/`CHROMA_PORT` to `chroma:8000` for
> you. Leave the `localhost` values in `backend/.env` — they are for running
> the backend outside Compose.

### Frontend — `frontend/.env`

```bash
cp frontend/.env.example frontend/.env
```

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

The frontend talks to **only one server** — the Express backend. It holds no auth
configuration of its own; the session lives in an `HttpOnly` cookie the backend
sets.

---

## 4. Start the database

`docker-compose.yml` does **not** start Postgres — the database is expected to be
external. Pick one:

**Option A — local Postgres with pgvector**

```bash
docker run -d --name learnai-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=learnai \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Then set `DB_URL=postgresql://postgres:postgres@localhost:5432/learnai`.

**Option B — managed Postgres (Supabase, Neon, RDS, …)**

Copy the connection string from the dashboard into `DB_URL`, and enable the
extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 5. Apply the schema

Migrations are plain SQL in `backend/sql/`, applied in filename order. There is
no migration runner and no `schema_migrations` table.

```bash
for f in backend/sql/*.sql; do
  echo "Applying $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

This creates all **33 tables** across the `public` and `chat_agent` schemas.

> **One migration is not idempotent.** `quiz_schema.sql` adds the constraint
> `quiz_answers_attempt_question_unique` without `IF NOT EXISTS`, so re-running it
> against an already-migrated database fails with SQLSTATE `42P07`. This is
> pre-existing and harmless on a fresh database — just don't re-run that one file.

If you do not have `psql` installed locally, paste each file into your
provider's SQL editor instead.

---

## 6. Build and start the stack

```bash
docker compose up --build
```

This starts six services:

| Service | Role | Port |
|---|---|---|
| `redis` | Rate limits + BullMQ | 6379 |
| `seaweedfs` | S3-compatible object storage | 9000 (S3), 8888 (master UI), 8889 (filer UI) |
| `chroma` | Vector store | 8001 → 8000 |
| `backend` | Express API | 8000 |
| `upload-worker` | Dedicated BullMQ worker | – |
| `frontend` | Next.js app | 3000 |

Watch the startup logs:

```bash
docker compose logs -f backend frontend
```

Wait for `backend` to report `healthy`:

```bash
docker compose ps
```

---

## 7. Verify

```bash
# Backend health
curl -s http://localhost:8000/health
# → {"status":"ok","database":"connected"}

# AI round-trip
curl -s -X POST http://localhost:8000/api/v1/test-ai \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Explain Big-O in one paragraph"}'
# → {"response":"..."}
```

**Auth round-trip.** Note the paths: there is **no** `/api/v1/auth` prefix — the
auth router is mounted at the bare `/api/v1` root.

```bash
# Sign up
curl -c /tmp/c.txt -X POST http://localhost:8000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com","password":"hunter2","confirmPassword":"hunter2"}'
# → {"data":{"success":true,"message":"Your account has been created. You can sign in now.", ...}}

# Sign in — the token arrives in the Set-Cookie header
curl -c /tmp/c.txt -X POST http://localhost:8000/api/v1/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"hunter2"}'
# → {"data":{"success":true}}

# Read the session
curl -b /tmp/c.txt http://localhost:8000/api/v1/me
# → {"data":{"id":"...","email":"ada@example.com","profile":{...}}}
```

Then open <http://localhost:3000> and sign in through the UI.

**Admin round-trip.** The admin account is created from `ADMIN_EMAIL` /
`ADMIN_PASS` at boot, so no manual setup is needed.

```bash
# The bootstrap log line confirms it happened
docker compose logs backend | grep "admin bootstrap"
# → [admin] bootstrap created the admin profile for you@example.com

# Admin sign-in (same cookie as the regular sign-in)
curl -c /tmp/a.txt -X POST http://localhost:8000/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"<your ADMIN_PASS>"}'
# → {"data":{"member":{...,"role":"admin"}}}

# Change your own password
curl -b /tmp/a.txt -X POST http://localhost:8000/api/v1/admin/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"<your ADMIN_PASS>","newPassword":"<a-new-password>"}'
# → {"data":{"ok":true}}
```

The new password works on both the admin console and the regular sign-in page,
and a restart does **not** revert it to `ADMIN_PASS`.

**Frontend health:** <http://localhost:3000/api/health>

---

## 8. Run without Docker

You still need Postgres, Redis and a Chroma server running somewhere.

```bash
# Terminal 1 — backend
cd backend
npm install --legacy-peer-deps
cp .env.example .env
npm run dev            # node --watch src/index.js

# Terminal 2 — frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev            # next dev

# Terminal 3 — redis
docker run -d --name learnai-redis -p 6379:6379 redis:7-alpine
```

> The backend install needs `--legacy-peer-deps`. `chromadb` declares an
> optional peer dependency on an older `@google/generative-ai` than the project
> ships, which makes plain `npm ci` fail with `ERESOLVE`. The packages work
> together fine — only peer resolution needs relaxing.

---

## 9. Stop and restart

```bash
docker compose down              # stop and remove containers, keep volumes
docker compose down -v           # also wipe Redis and Chroma data
docker compose restart backend   # restart one service
docker compose up --build -d     # rebuild after pulling new code
docker compose logs -f backend   # tail one service
docker compose exec backend sh   # shell inside the container
```

---

## 10. Common local issues

| Symptom | Cause | Fix |
|---|---|---|
| Backend refuses to boot | `JWT_SECRET` missing or under 32 characters | Set it — the server validates this at startup |
| `connect ECONNREFUSED 127.0.0.1:5432` | Postgres not reachable | Check `DB_URL`; on Docker Desktop use `host.docker.internal` |
| `npm ci` fails with `ERESOLVE` | Peer-dependency conflict | `npm ci --legacy-peer-deps` |
| CORS error: *"credential is not supported if origin is '*'"* | `CORS_ORIGINS` is `*` | Set it to `http://localhost:3000` |
| Sign-in works, every request 401s | Cookies not sent | `CORS_ORIGINS` must list the exact frontend origin; the cookie is host-scoped; the frontend must send `credentials: 'include'` |
| `/contents/...` 404s | Wrong backend URL | `NEXT_PUBLIC_BACKEND_URL` must be the host the browser can reach |
| Password reset says *"check the console"* | No mail provider configured | Set `RESEND_API_KEY` (and a verified `MAIL_FROM`) so the code is emailed. Without it the code is written to the backend log instead |
| `/achievements` empty, streak widget missing | Gamification schema not applied | `psql "$DB_URL" -f backend/sql/gamification_schema.sql` |
| Avatar upload rejected | Wrong type or too large | JPEG/PNG/WebP/GIF, ≤ `STORAGE_MAX_UPLOAD_BYTES` (default 10 MB) |
| Voice mic button missing | Browser lacks the Web Speech API | The UI hides itself by design; no error is shown |
| ChromaDB container permanently unhealthy | The image ships no `curl`/`wget` | This is expected — the healthcheck is a `/dev/tcp` wrapper script (`chroma/healthcheck.sh`). The same applies to the SeaweedFS healthcheck (`seaweedfs/healthcheck.sh`) |
| Frontend cannot reach the API in Compose | Wrong proxy origin | `BACKEND_PROXY_ORIGIN` must be `http://backend:8000`, not `localhost:8000` |

---

# Deployment

## Deployment

The backend deploys to **Render** and the frontend to **Vercel**.

```
┌────────────────────────┐         ┌─────────────────────┐
│  GitHub (master/main)  │         │   Vercel (CDN/SSR)  │
│         │              │         │        ▲            │
│         │ push         │         │        │ deploy     │
│         ▼              │         │        │            │
│  Render (Blueprint)    │────────►│  learnai-frontend   │
│  reads render.yaml     │         └──────────┬──────────┘
│  Vercel GitHub app     │                    │ /api/v1/* rewrite
└─────────┬──────────────┘                    │ (build-time proxy)
          │                                  ▼
          │                       ┌─────────────────────┐
          │                       │   Render (Docker)   │
          │                       │   learnai-backend   │
          │                       │      :8000         │
          │                       └──────────┬──────────┘
          │ API + cookies                   │
          │                    ┌─────────────┼──────────────┐
          ▼                    ▼             ▼              ▼
   ┌────────────┐      ┌────────────┐ ┌──────────┐  ┌────────────┐
   │  Postgres  │      │   Redis    │ │  Chroma  │  │ SeaweedFS  │
   └────────────┘      └────────────┘ └──────────┘  └────────────┘
```

### What each piece needs

| Component | Needs |
|---|---|
| **Render** (backend) | A Docker runtime, plus the `render.yaml` blueprint read from the repository root — or a manually-created web service |
| **Vercel** (frontend) | A linked project with the root directory set to `frontend`, plus the `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets |

> **Before you start.** The git remote on this checkout is not configured and the
> branch is `master`. `render.yaml` pins `branch: master` — change it if you
> rename the default branch.

---

## Deploy backend to Render

### Step 1 — Provision the infrastructure

Render can host the backend container, but it cannot host the stateful
dependencies. Provision these separately:

- **Postgres** — Supabase, Neon, RDS, or Render's own Postgres.
- **Redis** — Render Redis, Upstash, or any Redis 6+.
- **ChromaDB** — Chroma Cloud, or a container on any Docker host. The `chromadb`
  JS client is server-only, so it needs a *running server*, not an embedded
  store.
- **SeaweedFS** (or any S3-compatible store) — for course materials and
  avatars. The `MINIO_*` variables keep their names for compatibility with the
  original MinIO setup.

### Step 2 — Create the Render service

**Option A — the blueprint (recommended)**

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**.
3. Select the repository. Render reads [`render.yaml`](./render.yaml) from the
   root and provisions the service for you.
4. Fill in the values marked `sync: false` in the Render dashboard — Render
   prompts for each one.

**Option B — manually**

1. **New → Web Service → Connect a repository.**
2. **Runtime:** Docker.
3. **Root directory:** leave as the repository root.
4. **Dockerfile path:** `./backend/Dockerfile`
5. **Docker context:** `./backend`
6. **Health check path:** `/health`
7. **Auto-deploy:** on — Render deploys directly from the Git push. (Set
   `autoDeploy: false` in `render.yaml` to deploy manually from the Render
   dashboard instead.)

Then add the environment variables.

### Step 3 — Backend environment variables

Set these in the Render dashboard. `render.yaml` lists the non-secret defaults
already; these are the ones you must supply.

```bash
# Required
DB_URL=postgresql://...:5432/learnai
JWT_SECRET=<48-byte hex>          # Render can generate one — see render.yaml
GEMINI_API_KEY=<...>              # LLM and embeddings
COHERE_API_KEY=<...>              # Optional — reranker only

# Vector store
CHROMA_HOST=<chroma host>
CHROMA_PORT=8000
CHROMA_DATABASE=learnai
CHROMA_API_KEY=<...>
CHROMA_TENANT=<...>

# Redis
REDIS_URL=redis://:<password>@<host>:6379/0

# Object storage
MINIO_ENDPOINT=<s3 endpoint host>
MINIO_PORT=9000
MINIO_ACCESS_KEY=<...>
MINIO_SECRET_KEY=<...>
MINIO_BUCKET_UPLOADS=learnai
MINIO_BUCKET_AVATARS=learnai

# SeaweedFS JWT signing key — only when SeaweedFS is the storage provider.
# Must be identical to the value the SeaweedFS container is started with.
SEAWEEDFS_JWT_SIGNING_KEY=<...>

# URLs — these are the production values
FRONTEND_URL=https://your-app.vercel.app
BACKEND_PUBLIC_URL=https://learnai-backend.onrender.com

# CORS — the exact Vercel origin. Never "*".
CORS_ORIGINS=https://your-app.vercel.app
CORS_CREDENTIALS=true

# Optional: Supabase storage for avatars
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role key>

# Worker
WORKER_INPROCESS=true
UPLOAD_WORKER_CONCURRENCY=4

# Mail — password-reset codes. Without RESEND_API_KEY the code is written
# to the backend log instead of being emailed.
MAIL_PROVIDER=resend
RESEND_API_KEY=<...>
MAIL_FROM=LearnAI <no-reply@your-verified-domain>

# The bootstrap administrator. Created on boot if it does not exist.
# ADMIN_PASS is only the INITIAL password — change it from the console.
ADMIN_EMAIL=you@example.com
ADMIN_PASS=<...>
```

> **`CORS_ORIGINS` and cookies.** The session cookie is set with
> `SameSite=None; Secure` in production, which means the browser will only
> attach it to a cross-site request when the origin is explicitly allowed.
> If `CORS_ORIGINS` does not list your exact Vercel URL, sign-in appears to
> succeed and every subsequent request returns 401.

> **`FRONTEND_URL` matters for password resets.** The reset link is built as
> `${FRONTEND_URL}/auth/reset-password?token=…` and emailed to the account.
> Set it to your real frontend URL or the link points at localhost.

### Step 4 — Apply the schema

Render does not run migrations automatically. Apply them once, from any machine
with `psql` and network access to the database:

```bash
for f in backend/sql/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

### Step 5 — Deploy

Render deploys the backend straight from the Git push:

- With **auto-deploy on** (the default for a Blueprint import), every push to
  the configured branch triggers a build and deploy. Nothing else is needed.
- To deploy manually instead, set `autoDeploy: false` in `render.yaml` and use
  **Render → Manual Deploy → Deploy latest commit** from the dashboard. A
  **Deploy Hook** URL can also be generated under **Settings → Build &
  Deploy** if you want to trigger a deploy from your own tooling — it contains
  a secret token, so never commit it or paste it into a public issue.

### Step 6 — Verify

```bash
curl -s https://learnai-backend.onrender.com/health
# → {"status":"ok","database":"connected"}
```

---

## Deploy frontend to Vercel

### Step 1 — Create the project

1. In Vercel: **Add New → Project**, and import the repository.
2. **Root Directory:** `frontend` — the app is a monorepo member, not the root.
3. **Framework Preset:** Next.js (auto-detected).
4. **Build Command:** `npm run build`
5. **Install Command:** `npm install`
6. Do **not** deploy on the initial import — set the environment variables first.

### Step 2 — Environment variables

In Vercel: **Project → Settings → Environment Variables**. Add these for
**Production**, **Preview** and **Development** as appropriate:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://learnai-backend.onrender.com/api/v1` | Public — inlined into the client bundle at build time |
| `NEXT_PUBLIC_BACKEND_URL` | `https://learnai-backend.onrender.com` | Public — used for websockets and absolute URLs |
| `BACKEND_PROXY_ORIGIN` | `https://learnai-backend.onrender.com` | **Server-side only.** Baked into the build as the rewrite target |

> **`BACKEND_PROXY_ORIGIN` is build-time.** Next.js evaluates `rewrites()` during
> `next build` and bakes the result into the output. Setting this variable only
> at runtime does nothing — the proxy would keep pointing at the previous
> target. Because it is server-side, it does not need the `NEXT_PUBLIC_` prefix.

> **How requests reach the backend.** The frontend proxies `/api/v1/*` and
> `/contents/*` to `BACKEND_PROXY_ORIGIN` through the rewrite in
> `frontend/next.config.ts`. This means the browser talks only to Vercel —
> one origin, no CORS preflight for API calls. The **Socket.IO** connection is
> the exception: it connects directly to `NEXT_PUBLIC_BACKEND_URL`, so that
> host must be reachable from the browser and its CORS origin must list your
> Vercel URL.

### Step 3 — Get the Vercel IDs

```bash
npm i -g vercel
vercel login
vercel link --yes          # from the frontend/ directory
```

Or read them from the Vercel dashboard under **Project → Settings → General**.

Then add them as Vercel environment variables (or keep them in the Vercel CLI
session):

| Secret | Value |
|---|---|
| `VERCEL_TOKEN` | A Vercel access token — Vercel dashboard → **Account Settings → Tokens** |
| `VERCEL_ORG_ID` | Your organization's ID |
| `VERCEL_PROJECT_ID` | The frontend project's ID |

The token needs the **Deployments** write scope.

### Step 4 — GitHub integration

Add the Vercel GitHub app to the repository and enable **Automatically deploy**
— Vercel then builds and deploys the frontend on every push to the connected
branch, with no workflow file involved.

### Step 5 — Verify

```bash
curl -s https://your-app.vercel.app/api/health
```

Then open the app, sign up, and confirm:

- The sign-up form posts to `/api/v1/signup` and succeeds.
- `GET /api/v1/me` returns your profile.
- A chat message streams tokens over SSE.

---

## Direct deploys from GitHub

Both services deploy straight from the Git push — no workflow files are
involved.

### Backend → Render (Blueprint)

1. Push the repository to GitHub.
2. In Render: **New → Blueprint** → select the repository. Render reads
   [`render.yaml`](./render.yaml) from the repository root and creates the
   `learnai-backend` web service with the Dockerfile, health-check path, plan,
   region and branch already set.
3. Fill in every variable marked `sync: false` in the Render dashboard — Render
   prompts for each one on the first deploy.
4. Every push to the configured branch then rebuilds and redeploys the backend
   image. Set `autoDeploy: false` in `render.yaml` to require a manual
   **Deploy latest commit** instead.

### Frontend → Vercel (GitHub app)

1. In Vercel: **Add New → Project** → import the repository, with the root
   directory set to `frontend`.
2. Add the Vercel GitHub app to the repository and enable **Automatically
   deploy** for the production branch.
3. Set the three build-time variables in the Vercel dashboard — they are
   public values, not secrets:

| Variable | Value |
|---|---|
| `BACKEND_PROXY_ORIGIN` | `https://learnai-backend.onrender.com` |
| `NEXT_PUBLIC_API_URL` | `https://learnai-backend.onrender.com/api/v1` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://learnai-backend.onrender.com` |

### Local checks before you push

The repository ships no CI workflow, so run the gates locally before pushing:

| Area | Command |
|---|---|
| Backend syntax | `node --input-type=module --check < backend/src/*.js` for each changed `.js`/`.mjs` file |
| Backend migrations | `for f in backend/sql/*.sql; do psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done` against a throwaway database |
| Frontend types | `cd frontend && npx tsc --noEmit` |
| Frontend lint | `cd frontend && npx eslint .` |
| Frontend build | `cd frontend && npm run build` |
| Compose file | `docker compose config --quiet` |
| Healthcheck scripts | `bash -n chroma/healthcheck.sh && bash -n seaweedfs/healthcheck.sh` |

---

## Production configuration checklist

- [ ] `JWT_SECRET` is set and at least 32 characters
- [ ] `ENVIRONMENT=production` — this is what turns on `Secure` cookies and `SameSite=None`
- [ ] `CORS_ORIGINS` lists your **exact** Vercel URL, with no `*`
- [ ] `FRONTEND_URL` is your real frontend URL (password-reset links depend on it)
- [ ] `RESEND_API_KEY` is set and `MAIL_FROM` is a verified sender (otherwise the reset code is only written to the backend log)
- [ ] `ADMIN_EMAIL` is set so the admin console has an account, and the password has been changed from the console away from `ADMIN_PASS`
- [ ] `BACKEND_PUBLIC_URL` is your real backend URL
- [ ] All 14 migrations applied to the production database
- [ ] `CHROMA_HOST` points at a **running Chroma server** — the JS client cannot use an embedded store
- [ ] `REDIS_URL` points at a reachable Redis
- [ ] `MINIO_ENDPOINT` points at a reachable S3-compatible endpoint
- [ ] `GEMINI_MODEL` is a Flash-tier model — Pro models have a zero free-tier quota
- [ ] `WORKER_INPROCESS=true` so the API container also drains the upload queue
- [ ] The GitHub secrets and variables from the table above are set
- [ ] `https://<backend>/health` returns `{"status":"ok","database":"connected"}`

---

## Production troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sign-in returns 200, then every request 401s | The cookie is not being sent cross-site | `CORS_ORIGINS` must contain the exact frontend origin **and** `ENVIRONMENT=production` (otherwise the cookie is `SameSite=Lax` and is dropped cross-site) |
| Login works, but Socket.IO never connects | The battle socket connects directly to the backend, not through the Vercel rewrite | `NEXT_PUBLIC_BACKEND_URL` must be the public backend URL, and the backend's CORS must allow the Vercel origin |
| Vercel deploys succeed but every API call 502s | `BACKEND_PROXY_ORIGIN` was wrong at build time | Next.js bakes rewrites into the build. Rebuild after changing it — redeploying the same commit is not enough |
| The password-reset link points at localhost | `FRONTEND_URL` was not updated | Set `FRONTEND_URL` on Render and redeploy |
| The reset email never arrives | `RESEND_API_KEY` is unset, or `MAIL_FROM` is not a verified sender | Set both in the Render dashboard. The backend logs the provider's error — check the log for `[mailService]` |
| The admin console rejects the login | The bootstrap never ran, or the password was already changed | Set `ADMIN_EMAIL` / `ADMIN_PASS` and restart. The log line `[admin] bootstrap created the admin profile for …` confirms it. If the password was changed earlier, use the new one — `ADMIN_PASS` does not revert it |
| Render deploy fails at build | The backend image needs `build-essential` for a native dependency | `backend/Dockerfile` already installs it; check the build log for the actual error |
| The backend deploys but `/health` returns 500 | The database is unreachable, or the schema was never applied | Check `DB_URL`, then apply the migrations |
| Chat replies never stream | The SSE request is being buffered | `BACKEND_PROXY_ORIGIN` must point at the real backend — Vercel's rewrite does pass through SSE, but a wrong target produces a fast error instead of a stream |
| Upload fails with *"File too large (>4MB)"* | The multipart path has a 4 MB cap | Use `POST /api/v1/storage/presign` to upload directly to object storage for larger files |
| Rate limits hit legitimate users | The failure limiter counts 401/403 responses | Set `RATE_LIMIT_ENABLED=false` temporarily, or raise the limits in `backend/src/config/limiter.js` |

---

You're done. Happy learning! 🎓
