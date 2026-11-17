# LearnAI Backend (Express / Node.js)

Express + LangGraph.js port of the original Python FastAPI backend.

## Quick start

```bash
cp .env.example .env
# Fill in GEMINI_API_KEY, DB_URL, etc.
# COHERE_API_KEY is optional — only the reranker uses it.
npm install
npm start
```

## Layout

```
src/
├── config/          # settings (zod-validated), pg pool, chromadb, rate limiter
├── utils/           # winston logger, AsyncLocalStorage request id
├── middlewares/     # Supabase auth, error handler, request logger
├── api/             # /test-ai
├── chat-agent/      # LangGraph.js agent + tools
├── cms_agent/       # Courses / Materials / Tags + RAG ingestion
├── community_agent/ # Posts / Comments / Presence + AI bot
├── rag_engine/      # Chunkers, hybrid retriever, semantic search, ingestion
├── content_gen_engine/ # Theory/Lab pipeline, generators, validators
├── services/        # Gemini, Cohere embeddings, vector store, image gen
├── models/          # Data-access repositories over pg
└── index.js         # Express app entry
```

## Endpoints

All routes are mounted under `/api/v1` (configurable via `API_PREFIX`).

- `POST /test-ai`
- `/chat/*`     — chat sessions, messages (SSE streaming)
- `/cms/*`      — courses, materials, tags, semantic search
- `/community/*`— forum posts, comments, presence

## Environment variables

See `.env.example` for the full list.

## Notes

- LangGraph JS APIs mirror the Python originals (`StateGraph`, `Annotation`, `ToolNode`).
- PostgreSQL access is raw SQL via `pg` (the Python code already used raw `text(...)` queries in service files).
- ChromaDB access uses the official `chromadb` npm client.
