# Project Overview

**LoreSmith** is a **local-first fiction writing application** for fiction writers to manage:

- Worldbuilding (cities, magic/mechanics, factions, artifacts, glossary, concept art gallery)
- Character roster, timelines, and a cross-book/chapter "appearances matrix"
- Multi-book plot outlines, plot beats, and per-character arcs
- Prose writing in two modes: a local **Markdown editor** (with autosave) and an embedded
  **Google Docs** editor iframe
- One-click **Google Drive backup** (OAuth2)

## Key architectural principle

There is **no database**. All data is stored as plain JSON + Markdown files on the local
filesystem under `data/stories/`. The frontend talks to a FastAPI backend through REST
endpoints; the backend reads/writes files atomically.

## Stack

| Layer     | Tech                                              |
|-----------|---------------------------------------------------|
| Frontend  | React 19 + Vite 6 + Tailwind CSS v4 + Lucide icons + react-force-graph-2d (Character Map) |
| Backend   | Python + FastAPI 0.141 + Pydantic v2              |
| Storage   | Local filesystem (JSON + Markdown + uploaded assets) |
| Optional  | Google Drive OAuth2 / backup (google-api-python-client, google-auth-oauthlib) |

## Repository Layout

```
writer_job/
├── AGENTS.md                 ← Knowledge base index (this file links here)
├── CHANGELOG/                ← Dated changelog files (YYYY-MM-DD.md per date)
│   └── INDEX.md              ← Index of all changelog dates
├── walkthrough.md            ← Original project walkthrough (architecture diagram + overview)
├── requirements.txt          ← Python backend dependencies
├── plans/                    ← Design drafts + features index — NOT implemented code
│   ├── features.md           ← Index of implemented vs. planned features (summary + plan refs)
│   └── implemented/          ← Plan docs moved here once their feature ships
├── backend/
│   └── app/
│       ├── main.py           ← FastAPI app + all REST routes
│       ├── file_manager.py   ← FileManager: all filesystem read/write logic per feature
│       ├── file_utils.py     ← Low-level atomic + thread-safe JSON/text/delete helpers
│       ├── schemas.py        ← All Pydantic models
│       ├── google_auth.py    ← GoogleAuthService: OAuth2 flow, token/account persistence
│       ├── google_drive_backup.py ← GoogleDriveBackupService: real, idempotent Drive upload
│       ├── ai/               ← Local Ollama integration (see docs/ai-system.md)
│       │   ├── config.py, ollama.py, io.py, schemas.py, prompts.py
│       │   ├── pipelines.py, context.py, store.py, custom.py, router.py, jobs.py
│       │   ├── notion_enrich.py
│       │   └── creator/      ← Creator Pipeline (Pro-tier story import)
│       │       ├── schemas.py, store.py, prompts.py, split.py
│       │       ├── merge.py, stages.py, pipeline.py
│       └── __init__.py
│   └── scripts/
│       ├── import_notion.py
│       └── juggernaut_xl_generate.py
├── frontend/
│   ├── package.json, vite.config.js, index.html
│   ├── public/               ← PWA icons
│   └── src/
│       ├── main.jsx, App.jsx, index.css
│       ├── hooks/, utils/, context/
│       └── components/
│           ├── Navbar.jsx, Sidebar.jsx, QuickSearchModal.jsx
│           ├── AmbientBackground.jsx, GoogleDriveModal.jsx
│           ├── ArtifactFormModal.jsx, CharacterPicker.jsx
│           ├── AIPanel.jsx, ExplorerPanel.jsx
│           └── modules/      ← All view modules (see docs/frontend.md)
├── data/
│   └── stories/              ← Per-story data (git-ignored)
└── .gitignore
```

> `plans/` contains **design documents only** — they describe intended future features and
> are NOT currently implemented code.
>
> **Lifecycle:** when a feature is implemented, move its plan doc to `plans/implemented/`
> and update `plans/features.md`, `CHANGELOG/YYYY-MM-DD.md`, and any affected docs in the same change.
