# LearnAI — Project Showcase

> A plain-language overview of what LearnAI is, who it is for, and what it can do.
>
> For setup and deployment, see [`instruction.md`](./instruction.md).
> For the architecture, see [`README.md`](./README.md).
> For the HTTP API, see [`api.md`](./api.md).
> For the database, see [`schema.md`](./schema.md).

---

## What is LearnAI?

**LearnAI** is an AI-powered supplementary learning platform for university courses. It turns the fragmented material students already have — lecture slides, PDFs, lab code, forum threads — into a single, organized, queryable, citation-grounded knowledge base that the student can talk to.

It is not a replacement for lectures, textbooks or office hours. It is a **second brain** that sits next to them: it remembers what was taught, retrieves the right snippet at the right moment, generates practice material on demand, and gives the student a daily reason to come back with streaks, XP and badges.

---

## Who is it for?

- **University students** taking one or more technical courses (CS, EE, math, sciences) who want a private AI tutor that has actually read the course's slides and lab code.
- **TAs and course staff** who want a fast way to answer the same ten questions every semester.
- **Self-learners** working through a MOOC or bootcamp and looking for a study system that adapts to them.
- **Course administrators**, who manage courses, materials, members and storage from a dedicated console.

---

## Feature overview

LearnAI ships **ten integrated feature areas**. Each is a complete loop: input → AI processing → stored artifact → review surface.

| # | Feature | In one line |
|---|---|---|
| 1 | Chat Agent | A LangGraph tutor that calls tools and answers from your course material |
| 2 | RAG engine | Hybrid BM25 + vector retrieval with reranking, over your own files |
| 3 | CMS | Courses, materials, tags and semantic search for course staff |
| 4 | Community Forum | Threads, categories, presence, and an AI bot that answers when a human is offline |
| 5 | SRS Flashcards | SM-2 spaced repetition, with cards generated from what you studied |
| 6 | Adaptive Quiz | AI-generated MCQs, instant feedback, and weak-topic detection |
| 7 | Quiz Battle | Real-time head-to-head duelling against another student |
| 8 | Concept Mind Maps | Interactive concept graphs that show the shape of a topic |
| 9 | Content Generation | Full theory + lab write-ups generated on demand |
| 10 | Gamification | XP, levels, daily streaks and eight badges |

---

### 1. Chat Agent — talk to your course

A multi-turn AI tutor built on **LangGraph** with tool calling. Ask a question in natural language; the agent picks the right tool and replies with grounded answers.

**Six tools are actually registered:**

| Tool | What it does |
|---|---|
| `search_chat_history` | Semantic search over your own past conversations |
| `course_materials_search` | RAG search across the course's uploaded material |
| `wikipedia_search` | Wikipedia lookup for background definitions |
| `duckduckgo_search` | Web search for current information |
| `generate_validated_code` | Writes code, then syntax-checks and executes it before returning it |
| `generate_learning_content` | Runs the full content-generation pipeline |

- **Streaming:** replies stream token-by-token over **SSE**, and tool-call traces are visible in the UI as they happen.
- **Voice:** the chat page (`/dashboard`) has a mic button using the browser Web Speech API for speech-to-text, and a voice-mode toggle that reads replies back with `speechSynthesis`. The toggle persists in `localStorage`. Both degrade gracefully on browsers that lack the APIs.
- **Why it matters:** most LLM tutors hallucinate because they have no idea what was actually taught. This one searches the student's own uploaded material first, so answers point back to a real slide or section.

### 2. RAG engine — retrieval that grounds everything

A hybrid retriever combining **BM25 sparse scoring** with **dense embeddings**, fused by **Reciprocal Rank Fusion** (`rrfK = 60`, dense weight `0.6` / sparse `0.4`).

| Layer | Detail |
|---|---|
| Embeddings | **Cohere** `embed-v4.0`, with separate `search_document` / `search_query` input types |
| Vector store | **ChromaDB**, HNSW with cosine distance, collection `rag-documents` |
| Reranking | A **Cohere reranker** reorders the fused candidates before they reach the model |
| Query processing | HyDE and query expansion run before retrieval |

**Chunked formats:** PDF (text layer), PPTX/PPT (per-slide, including speaker notes) and source code (regex-chunked per function/class).

Ingestion is **automatic** — uploading a material kicks off RAG indexing in the background. Every artifact the AI generates — chat replies, flashcards, quiz questions, mind maps, forum answers — goes through this pipeline, which is why they can all cite their source.

### 3. CMS — courses, materials and search

The content layer. Course staff create courses, upload materials with metadata, tag them, and search across everything semantically.

- **Course creation** requires a name (10–100 characters) and exactly one course code matching `/^[A-Za-z]{2,4}\d{4}$/` — e.g. `CSE1121`. Sending both `course_no` and `courseNo`, or neither, is rejected.
- **Material upload** records a title, a type (`theory` or `lab`), a file type (`pdf`, `pptx` or `code`), an optional week, tags and metadata.
- **Students get a read-only view.** The `/materials` page browses courses and content. **Uploading is restricted** to members with the `can_manage_courses` permission — the upload UI lives only in the admin console.
- **Search** is semantic, not keyword: `GET /api/v1/search` runs a query across the vector store with an optional type filter.

> The original project allowed any student to upload. The current build does not.

### 4. Community Forum — async Q&A with an AI safety net

A threaded discussion board with categories `theory`, `lab` and `general`, a resolve/unresolve toggle, and presence tracking.

- **The AI bot** fires when a student `@mentions` a classmate who is currently offline. It answers using RAG over the course's material, so the question still gets an answer.
- **Presence** is tracked server-side with a two-minute online threshold.
- **View counting** only increments for a signed-in reader, and only when the request asks for it.

- **Why it matters:** course forums die because nobody answers fast enough. The bot never replaces a human, but it means no question sits unanswered for hours.

### 5. SRS Flashcards — spaced repetition that fits your material

**SM-2 scheduling** with a four-button rating — **Again / Hard / Good / Easy** (internally `0 / 2 / 3 / 4`). Ease factor is clamped at a floor of 1.3; intervals run 1 day → 6 days → previous interval × ease factor.

**Three sources:** `course` (uploaded material), `chat` (a conversation) and `manual` (pasted text). Cards track ease factor, interval and repetition count per deck, and the review history is stored for every review.

- **Why it matters:** making flashcards by hand is the single biggest reason students abandon spaced repetition. Here the cards are made for you from material you already have.

### 6. Adaptive Quiz — practice that finds your gaps

AI-generated MCQs with **exactly four options**, one correct answer and an optional explanation, produced from any source.

- **Live session** with per-question feedback: correctness, the right answer, and the explanation.
- **Weak-topic detection** — the questions you missed are grouped by their tags, so the result screen names what you actually need to revise.
- **Attempt history** per quiz set, and user-wide statistics across every set.
- **Cross-link with SRS:** questions you got wrong are **automatically** converted into a flashcard deck titled *"Quiz Review: \<quiz\> (date)"*, with the correct answer and its "Why: …" explanation on the back. It appears in your normal SRS review queue. A deck is only created when there are wrong answers, and `createSrsDeck` can be turned off per attempt.

### 7. Quiz Battle — real-time head-to-head

Two students, one course, one set of questions, answered head-to-head in real time.

- **Matchmaking is real.** Players queue for a course and are paired by level score; the server refuses to match a player against themselves and falls back to pairing the longest-waiting players after ten seconds. A thirty-second cooldown prevents repeat failed pairings.
- **Live transport** is **Socket.IO** at `/socket.io/`, authenticated with the same session cookie as the REST API. The server emits `battle:matched`, `battle:score`, `battle:inactivity`, `battle:ended` and `battle:notification` events; the client answers with `battle:queue`, `battle:join`, `battle:answer`, `battle:ping`, `battle:leave` and `battle:cancel`.
- **Reconnects rejoin** the live match automatically.
- **A battle profile** tracks wins, losses, draws and a level score that feeds the matchmaking buckets, plus a tier. **Notifications** record invites and results, and every match can be **replayed** afterwards.
- **Why it matters:** solo quizzes measure memory; a duel measures recall under pressure — and it makes studying social.

### 8. Concept Mind Maps — see the shape of a topic

AI-generated hierarchical concept trees: a single root with **two to three levels** of sub-concepts beneath it.

- **Stored as JSONB** in Postgres with a GIN index, so one read returns the entire tree.
- **Rendered with React Flow** as a read-only graph with pan, zoom, controls and a minimap. Nodes are not draggable — it is a map, not a whiteboard.
- **Why it matters:** when a topic feels overwhelming, a mind map turns "forty things I don't understand" into "eight things, each with five children". You see the structure before you read a word.

### 9. Content Generation — full write-ups on demand

A three-stage pipeline that turns a topic into a complete piece of learning material.

1. **Plan** — a planner agent decides the structure, sections, difficulty and which concepts need code.
2. **Write** — separate theory and coding-lab writers produce the prose and the exercises. Generated code is **syntax-checked and executed in a sandbox** before it is accepted.
3. **Render** — Markdown output, optionally converted to PDF, with Mermaid diagrams and generated images.

**This is reachable through the chat agent's `generate_learning_content` tool only** — there is no dedicated page for it in the current build.

### 10. Gamification — XP, streaks and badges

Implicit rewards that accrue as a side effect of studying. The **server** decides every XP amount from an `XP_<SOURCE>` environment variable; a client-supplied amount is accepted by the schema but ignored.

| Source | Default XP | Daily cap |
|---|---|---|
| SRS review | 10 | 300 |
| Quiz — correct answer | 5 | 200 |
| Quiz — finished | 20 | 200 |
| Mind map generated | 25 | 150 |
| Chat message | 2 | 50 |
| Material viewed | 1 | 50 |

- **Level curve:** `floor(sqrt(xp / 100)) + 1`.
- **Streak grace window:** 36 hours, so a single late night does not break a streak.
- **Eight seeded badges:** First Steps, Week Warrior, Monthly Master, Apprentice, Scholar, Card Collector, Quiz Master, Cartographer.
- **Surfaces:** a streak pill in the chat header, a Stats tab on the profile page, and a dedicated `/achievements` page.

---

## How the features fit together

```
                ┌────────────────────────────────────────────┐
                │                Chat Agent                  │
                │  (LangGraph + Gemini + RAG + 6 tools)      │
                └───────────┬───────────────┬────────────────┘
                            │               │
                  ┌─────────▼─────┐   ┌─────▼──────┐
                  │  RAG engine   │   │  Content   │
                  │  BM25 + dense │   │  Gen       │
                  │  + rerank     │   │  (theory/  │
                  └──────┬────────┘   │   lab PDFs) │
                         │            └────────────┘
       ┌─────────────────┼─────────────────┬─────────────┐
       │                 │                 │             │
┌──────▼──────┐  ┌────────▼────────┐ ┌──────▼──────┐ ┌────▼───────────┐
│   SRS       │  │     Quiz        │ │  Mindmap    │ │  Community    │
│  Flashcards │  │  (wrong → SRS)  │ │ (concepts)  │ │  Forum + Bot  │
│  (SM-2)     │  │                 │ │             │ │               │
└──────┬──────┘  └────────┬────────┘ └──────┬──────┘ └───────────────┘
       │                  │                 │
       │         ┌────────▼────────┐        │
       │         │   Quiz Battle   │        │
       │         │ (Socket.IO duel)│        │
       │         └────────┬────────┘        │
       └────────┬─────────┴─────────┬───────┘
                │                   │
        ┌───────▼────────┐   ┌───────▼────────┐
        │  Gamification  │   │      CMS       │
        │  XP + Streak   │   │  Courses +     │
        │  + Badges      │   │  Materials     │
        └────────────────┘   └────────────────┘
```

Everything routes through the same RAG layer. Every artifact the AI generates can cite the source it came from. Every action the student takes contributes to a streak.

---

## What's unique about it

- **Citation-grounded by default.** Every answer, card, question and mind map points back to a specific uploaded file or chat message.
- **Cross-feature data flow.** Wrong quiz answers become SRS flashcards. Chat replies can become mind maps. Notes and materials can seed quizzes. Nothing is siloed.
- **Source flexibility.** Most features accept `course`, `chat` or `manual` as a source, so the student is never locked into "paste your text here".
- **Hardened against prompt injection.** All user-supplied text — RAG snippets, course materials, code, post content — is wrapped in labelled channels (`<source>`, `<context>`, `<task>`, `<code>`, `<query>`, `<post_content>` and others) that the model is locked into treating as **data**, never instructions. Seventeen role-override tokens such as `<|im_start|>`, `<system>` and `### System:` are stripped at the channel boundary. Around thirty call sites use this wrapping, including every content-generation agent and the community bot.
- **Real competition, not a mock-up.** Quiz Battle pairs real users through a real matchmaking queue over a real WebSocket.
- **Voice and text in one chat.** Typed and spoken input go through the same route, with spoken replies gated behind a persistent toggle.

---

## The admin console

A separate area at `/admin`, backed by its own session and a **role-and-permission model**.

- **Members** — create, update, soft-delete, and inspect activity and audit logs.
- **Roles** — `admin` and `moderator`.
- **Permissions** — exactly three: `can_manage_members`, `can_manage_courses`, `can_view_audit`.
- **Materials** — the upload UI lives here, gated on `can_manage_courses`.
- **Storage** — browse uploaded objects and their processing state.
- **Account** — the admin changes their own password; the env file's `ADMIN_PASS` is only the initial one and never reverts the change.
- **Audit trail** — admin actions are written to an append-only log with the actor, IP, user agent and a JSON metadata blob.

Every admin error uses a distinct `{ error: { code, message } }` envelope with codes such as `not_admin_member`, `insufficient_permissions` and `member_already_exists`.

**The first admin is created from the environment.** `ADMIN_EMAIL` and `ADMIN_PASS` in `backend/.env` make the backend create the account and its RBAC row on boot. It never overwrites an existing password, so the admin owns their password from the moment they change it.

---

## What it is *not*

- **Not a replacement for lectures.** It supplements them.
- **Not a general-purpose LLM.** The chat agent is locked to educational roles and refuses non-educational prompts.
- **Not a multi-tenant SaaS.** One Postgres database and one Chroma collection serve the whole deployment; there is no per-tenant isolation in the current build.
- **Not fully production-hardened end-to-end.** The sandbox that runs generated Python code is deliberately minimal, and the password-reset email needs a verified Resend sender before it reaches a real inbox — fine for a self-hosted deployment, not yet a finished product.

---

## Where to go next

| You want to … | Read |
|---|---|
| Run it locally | [`instruction.md`](./instruction.md) |
| Deploy it | [`instruction.md`](./instruction.md#deployment) |
| Understand the architecture | [`README.md`](./README.md) |
| Hit the API | [`api.md`](./api.md) |
| Read the database | [`schema.md`](./schema.md) |
| See the feature list | this document |
