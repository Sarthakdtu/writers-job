# LoreSmith — Agent Knowledge Base

This file is the **index** for the agent knowledge base. The detailed docs are
split by feature into the `docs/` directory. Read only the files relevant to
your task.

## Docs index

| File | Covers |
|------|--------|
| [`docs/overview.md`](docs/overview.md) | Project summary, stack, repository layout |
| [`docs/data-model.md`](docs/data-model.md) | Pydantic schemas, on-disk storage structure, gotchas |
| [`docs/backend.md`](docs/backend.md) | `file_utils`, `FileManager`, FastAPI routes |
| [`docs/ai-system.md`](docs/ai-system.md) | Ollama AI package, Creator Pipeline, env vars |
| [`docs/frontend.md`](docs/frontend.md) | Providers, contexts, theming, components/views |
| [`docs/api-contract.md`](docs/api-contract.md) | Frontend ↔ backend API usage patterns |
| [`docs/operations.md`](docs/operations.md) | Running the project, PWA, Google Drive backup, Google Docs |
| [`docs/conventions.md`](docs/conventions.md) | Change guidelines, coding conventions, known issues |

## Quick reference

- **No database** — all data is plain JSON + Markdown on the local filesystem under `data/stories/`.
- **Backend:** Python + FastAPI + Pydantic v2 (`backend/app/`).
- **Frontend:** React 19 + Vite 6 + Tailwind v4 (`frontend/src/`).
- **AI:** Local Ollama integration (`backend/app/ai/`).
- **Storage convention:** always use `file_utils` helpers — never raw `open()` on data files.

> **KEEP UP TO DATE.** Whenever you change code in a way that affects functionality,
> behavior, data shapes, routes, or file layout, update the relevant doc file in `docs/`
> (or add a CHANGELOG entry in `CHANGELOG.md`).
