# LoreSmith — Technical Specification

This document describes the architecture, data model, API surface, AI integration, and extension points of the LoreSmith fiction writer's suite for developers and contributors.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Stack & Dependencies](#2-stack--dependencies)
3. [Data Model](#3-data-model)
4. [Storage Layout](#4-storage-layout)
5. [Backend Architecture](#5-backend-architecture)
6. [API Reference](#6-api-reference)
7. [Frontend Architecture](#7-frontend-architecture)
8. [AI Integration (Ollama)](#8-ai-integration-ollama)
9. [Creator Pipeline](#9-creator-pipeline)
10. [Google Drive Backup](#10-google-drive-backup)
11. [PWA & Offline Support](#11-pwa--offline-support)
12. [Configuration & Environment Variables](#12-configuration--environment-variables)
13. [Contributing & Code Conventions](#13-contributing--code-conventions)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                   │
│  Vite 6 + Tailwind CSS v4 + Lucide Icons                │
│  PWA via vite-plugin-pwa                                │
│  Dev proxy: /api → http://localhost:8000                 │
└──────────────────────────┬──────────────────────────────┘
                           │ REST (JSON)
┌──────────────────────────▼──────────────────────────────┐
│                  Backend (FastAPI)                       │
│  Python 3.10+ · Pydantic v2 · asyncio                   │
│  ┌─────────────────────────────────────────────┐        │
│  │ FileManager  │  GoogleDriveBackupService     │        │
│  │ (CRUD + fs)  │  (OAuth2 + Drive API)         │        │
│  └──────┬───────┴──────────────┬───────────────┘        │
│         │                      │                         │
│  ┌──────▼──────────────────────▼───────────────┐        │
│  │         file_utils.py (atomic I/O)           │        │
│  │  read_json_safe · write_json_safe            │        │
│  │  read_text_safe · write_text_safe            │        │
│  │  delete_file_safe · get_file_lock            │        │
│  └──────────────────────┬──────────────────────┘        │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Local Filesystem (data/stories/)            │
│  JSON metadata + Markdown prose + uploaded assets       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Optional: Ollama (Local AI)                 │
│  Text / Vision / OCR models · Image generation          │
│  Async job queue per story                              │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** no database. All state is serialized as JSON and Markdown files on the local filesystem. The backend is a thin REST layer over atomic file operations. This makes the app fully portable, inspectable, and backup-friendly.

---

## 2. Stack & Dependencies

### Backend

| Package | Version | Purpose |
|---|---|---|
| Python | ≥3.10 | Runtime |
| FastAPI | 0.141+ | REST framework |
| Pydantic | v2 | Request/response validation |
| uvicorn | — | ASGI server |
| google-api-python-client | — | Google Drive API |
| google-auth-oauthlib | — | OAuth2 flow |

### Frontend

| Package | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 6.1+ | Build tool + dev server |
| Tailwind CSS | 4.0+ | Utility CSS |
| Lucide React | 0.475+ | Icons |
| react-force-graph-2d | 1.29+ | Character relationship graph |
| @dnd-kit/* | 6.3+ / 10+ | Drag-and-drop chapter reorder |
| react-markdown | 10+ | Markdown rendering |
| vite-plugin-pwa | 1.3+ | Service worker + manifest |

---

## 3. Data Model

All entities are Pydantic v2 models defined in `backend/app/schemas.py`.

### Core Entities

#### Story
```
id: str                    # URL-safe slug (primary key)
title: str
tags: List[str]
background_url: str        # Active ambient background image
banner_url: str            # User-set dashboard banner (separate from backgrounds)
background_images: List[str]  # Cycling ambient images
theme: "sepia"|"midnight"|"typewriter"|"forest"|"obsidian"|"arsenic"|"moonlight"|"milktea"|"crimson"|"sage"
overview: List[str]        # Dashboard paragraphs (mirrors character notes pattern)
google_doc_ids: Dict[str, str]
deleted: bool              # Soft-delete flag
deleted_at: Optional[str]  # ISO timestamp of deletion
```

#### Character
```
id: str
name: str
image_url: str             # Portrait
role: str                  # e.g. "Main Character", "Antagonist"
location: str              # Home/origin city
bio: str
persona: str               # Narrative voice (used by "Rewrite Perspective")
notes: List[str]
quotes: List[str]          # Memorable lines
gallery: List[str]         # Image URLs
artifact_ids: List[str]    # Linked artifacts
mechanic_ids: List[str]    # Linked magic systems / tech
timeline_events: List[TimelineEvent]
plot_point_ids: List[str]
```

#### Book
```
id: str                    # Sequential: "1", "2", ...
title: str
order: int
target_word_count: int
plot_subsections: List[PlotSubsection]  # {title, description}
google_doc_url: Optional[str]
```

#### Chapter
```
id: str
title: str
order: int                 # 1-based, set by drag-and-drop reorder
pov_character_id: Optional[str]
scene_breakdown: str
markdown_file_path: str    # Relative path to .md file
word_count: int            # Derived from .md file on save
google_doc_id: Optional[str]
image_url: Optional[str]   # Set by chapter_art AI pipeline
```

#### Plot
```
beats: List[PlotBeat]      # {id, title, description, chapter_id, character_ids[]}
theme: str
```

#### CharacterArc
```
character_id: str
arc_summary: str
starting_state: str
ending_state: str
key_milestones: List[str]
```

### World Entities

All stored as JSON arrays under `<story>/world/`:

| Entity | File | Key Fields |
|---|---|---|
| City | `cities.json` | id, name, region, atmosphere, image_url, key_locations[] |
| WorldMechanics | `mechanics.json` | id, name, magic_system, technology_level, global_rules[] |
| Faction | `factions.json` | id, name, description, leader, alignment |
| Artifact | `artifacts.json` | id, name, type, properties, location, image_url, belongs_to[], timeline[] |
| GlossaryTerm | `glossary.json` | id, term, definition, category |
| GalleryItem | `gallery.json` | id, title, image_url, context, category, tags[] |
| Quote | `quotes.json` | id, text, note, tags[] |

**Note:** `mechanics.json` is an **array** of `WorldMechanics` (a story can have multiple magic/tech systems). `get_world_mechanics` auto-migrates legacy single-object files into a 1-element list.

### Derived Models (not persisted)

| Model | Source | Used By |
|---|---|---|
| `CharacterAppearances` | Live filesystem scan across books, plot beats, arcs, chapters | Appearances matrix |
| `CharacterMap` | Plot beat co-occurrence (nodes + weighted edges) | Character Map view |
| `WritingStats` | Chapter `.md` file modification times | Dashboard writing progress |
| `StoryInsights` | Aggregation of all story data | Dashboard insights |

---

## 4. Storage Layout

```
data/stories/
├── <story-slug>/
│   ├── story.json                        # Story metadata
│   ├── assets/                           # Uploaded images (uuid-prefixed)
│   ├── characters/
│   │   └── <char-id>.json                # One file per character
│   ├── world/
│   │   ├── cities.json
│   │   ├── mechanics.json                # Array of WorldMechanics
│   │   ├── factions.json
│   │   ├── artifacts.json
│   │   ├── glossary.json
│   │   ├── gallery.json
│   │   └── quotes.json
│   ├── books/
│   │   └── book-<book-id>/
│   │       ├── book.json
│   │       ├── plot.json                 # {beats: [], theme: ""}
│   │       ├── character_arcs.json
│   │       └── chapters/
│   │           ├── ch-<ch-id>.json       # Chapter metadata
│   │           └── ch-<ch-id>.md         # Raw Markdown prose
│   └── ai/                               # AI config + results (optional)
│       ├── config.json
│       ├── jobs/
│       └── results/
```

### Conventions

- **IDs** are URL-safe slugs derived from names: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`.
- **Books** use sequential numeric IDs: `"1"`, `"2"`, etc. Directories are `book-<id>`.
- **Chapters** use `ch-<id>` file prefix. Each chapter is **two files**: `.json` (metadata) + `.md` (prose).
- **`word_count`** on chapters is derived from the `.md` file on every save.
- **Soft delete** on stories: `deleted=True` + `deleted_at` timestamp written to `story.json`. Files are preserved.

---

## 5. Backend Architecture

### 5.1 File I/O Layer (`file_utils.py`)

All data file operations **must** go through these helpers:

| Function | Purpose |
|---|---|
| `read_json_safe(path, default)` | Parse JSON; returns `default` if missing/malformed |
| `write_json_safe(path, data)` | Atomic write: temp file → `fsync` → `os.replace` |
| `read_text_safe(path)` | Read text file |
| `write_text_safe(path, content)` | Atomic text write |
| `delete_file_safe(path)` | Safe file deletion |
| `get_file_lock(path)` | Per-path `threading.Lock` for concurrent safety |

**Never** use raw `open()` on data files.

### 5.2 FileManager (`file_manager.py`)

Singleton class handling all CRUD and derived computations:

- **Story CRUD:** `save_story`, `get_story`, `list_stories`, `delete_story` (soft/hard), `restore_story`
- **Character CRUD:** `save_character`, `get_character`, `list_characters`, `delete_character`
- **World sections:** `get_world_section`, `save_world_section` (generic for all 7 sections)
- **Books/Chapters:** `save_book`, `list_books`, `save_chapter`, `list_chapters` (sorted by `order`), `save_chapter_prose`
- **Plot/Arcs:** `get_plot`, `save_plot`, `get_arcs`, `save_arcs`
- **Assets:** `save_asset` (UUID-prefixed), `get_asset_path`, `delete_asset`
- **Derived endpoints:** `get_character_appearances`, `get_character_map`, `get_writing_stats`, `get_image_library`, `get_references`, `get_story_fun_facts`
- **Background sync:** `sync_story_backgrounds` — recomputes `background_images` from gallery + character galleries (excludes portraits). Auto-invoked on character/gallery mutations and inside `list_stories`.

### 5.3 Google Auth & Backup

- `GoogleAuthService` — OAuth2 flow, token persistence in `data/stories/.credentials/`
- `GoogleDriveBackupService` — Idempotent recursive sync to a `LoreSmith/` root folder on Drive. Per-file manifest for diffing. Restore with conflict classification.

### 5.4 AI Subsystem (`backend/app/ai/`)

See [Section 8](#8-ai-integration-ollama) for full details.

---

## 6. API Reference

Base URL: `http://localhost:8000` (or proxied via Vite at `http://localhost:3000/api`).

### Health

| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/health` | `{status, storage_dir}` |

### Stories

| Method | Endpoint | Body/Response | Notes |
|---|---|---|---|
| GET | `/api/stories` | `List[Story]` | Excludes soft-deleted |
| GET | `/api/stories/deleted` | `List[Story]` | Trash only |
| POST | `/api/stories` | `Story` → `Story` | Create |
| GET | `/api/stories/{id}` | `Story` | |
| PUT | `/api/stories/{id}` | `Story` → `Story` | |
| DELETE | `/api/stories/{id}` | | `?hard=true` for permanent |
| POST | `/api/stories/{id}/restore` | | Restore soft-deleted |

### Characters

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/stories/{id}/characters` | |
| POST | `/api/stories/{id}/characters` | Upsert (create + update) |
| GET | `/api/stories/{id}/characters/{cid}` | |
| PUT | `/api/stories/{id}/characters/{cid}` | |
| DELETE | `/api/stories/{id}/characters/{cid}` | Triggers background sync |
| GET | `/api/stories/{id}/characters/{cid}/appearances` | Derived: books, chapters, plot points |
| GET | `/api/stories/{id}/character-map` | Derived: `CharacterMap` (nodes + weighted edges) |

### Worldbuilding

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/stories/{id}/world/{section}` | Section: `cities`, `mechanics`, `factions`, `artifacts`, `glossary`, `gallery` |
| PUT | `/api/stories/{id}/world/{section}` | Gallery updates trigger background sync |

### Quotes

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/stories/{id}/quotes` | |
| POST | `/api/stories/{id}/quotes` | Upsert full array |

### Books & Chapters

| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/stories/{id}/books` | |
| GET/PUT/DELETE | `/api/stories/{id}/books/{bid}` | |
| GET/PUT | `/api/stories/{id}/books/{bid}/plot` | Upsert full `Plot` |
| GET/PUT | `/api/stories/{id}/books/{bid}/arcs` | Upsert `List[CharacterArc]` |
| GET/POST | `/api/stories/{id}/books/{bid}/chapters` | GET accepts `?sort=asc\|desc` |
| GET/PUT/DELETE | `/api/stories/{id}/chapters/{cid}` | |
| POST | `/api/stories/{id}/books/{bid}/chapters/reorder` | Body: `{chapter_ids: []}` |
| GET/PUT | `/api/stories/{id}/chapters/{cid}/content` | Alias `/prose`; returns/accepts `{content}` |
| POST | `/api/stories/{id}/books/{bid}/chapters/from-ai` | Body: `SaveAIDraftPayload` |
| GET | `/api/stories/{id}/chapters/{cid}/art-suggestions` | Auto-detects POV + city for art generation |

### Derived Endpoints

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/stories/{id}/images/library` | `List[StoryImageItem]` — unified tagged image library |
| GET | `/api/stories/{id}/references` | `List[EntityRefItem]` — flat list for `@`-mention picker |
| GET | `/api/stories/{id}/fun-facts` | `List[str]` — randomizable summary facts |
| GET | `/api/stories/{id}/writing-stats` | `WritingStats` — streaks, daily word counts |
| GET | `/api/stories/{id}/insights` | `StoryInsights` — productivity, comprehension, narrative, creative, relationship insights |

### Assets

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/stories/{id}/assets/upload` | Multipart `file` field → `{url, filename}` |
| GET | `/api/stories/{id}/assets/{filename}` | `FileResponse` |
| DELETE | `/api/stories/{id}/assets/{filename}` | |

### Google Drive Backup

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/auth/google` | Initiate OAuth flow |
| GET | `/api/backup/status` | `{status, last_sync_time, total_files_synced, error_message}` |
| POST | `/api/backup/google-drive?story_id=` | Recursive Drive sync |
| GET | `/api/backup/restore/preview` | Conflict classification report |
| POST | `/api/backup/restore` | Body: `{choice: "drive" \| "local"}` |

### AI (Ollama)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/ai/status` | `AIStatus` — models, capabilities, running jobs |
| GET | `/api/ai/pipelines?story_id=&tab=` | Built-in + custom pipelines |
| GET/PUT | `/api/ai/config/{story_id}` | Per-story model overrides + enabled skills |
| POST | `/api/ai/run` | Enqueue pipeline run (202 Accepted) |
| GET | `/api/ai/jobs/{story_id}` | List jobs |
| GET | `/api/ai/jobs/{story_id}/{job_id}` | Job status |
| POST | `/api/ai/jobs/{job_id}/cancel?story_id=` | Cancel pending/running job |
| GET | `/api/ai/results/{story_id}/{pipeline}` | Stored result |
| GET/POST | `/api/ai/custom` | List / create custom skill |
| PUT/DELETE | `/api/ai/custom/{skill_id}` | Update / delete |
| POST | `/api/ai/custom/{skill_id}/duplicate` | Clone a custom skill |
| POST | `/api/ai/custom/route` | Dry-run Context Router |

### Creator Pipeline

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/creator/{story_id}/state` | Pipeline state |
| POST | `/api/creator/{story_id}/split` | Split raw prose into chapters |
| POST | `/api/creator/{story_id}/run-stage` | Body: `{stage}` — characters, world, plot, arcs |
| GET | `/api/creator/{story_id}/draft/{stage}` | Current batch draft |
| PUT | `/api/creator/{story_id}/approve/{stage}` | Approve + merge into story |
| POST | `/api/creator/{story_id}/batch` | Start new batch |
| GET | `/api/creator/{story_id}/summary` | Done-screen counts |

---

## 7. Frontend Architecture

### 7.1 Provider Tree

```
ThemeProvider          → ThemeContext (sepia/midnight/typewriter + CSS vars)
  StoryProvider        → StoryContext (stories, activeTab, hotkeys, CRUD)
    SkillLevelProvider → SkillLevelContext (Beginner/Intermediate/Pro progressive unlock)
      MainLayout       → Navbar, Sidebar, AmbientBackground, active module, modals, AIPanel
```

### 7.2 Module Views

| Tab Key | Component | Tier Unlock |
|---|---|---|
| `home` | `HomeView` | Beginner |
| `dashboard` | `DashboardView` | Beginner |
| `characters` | `CharacterRosterView` | Beginner |
| `worldbuilding` | `WorldbuildingView` | Intermediate |
| `outliner` | `BookOutlinerView` | Intermediate |
| `editor` | `DraftEditorView` | Beginner (MD) / Intermediate (GDocs) |
| `character-map` | `CharacterMapView` | Intermediate |
| `quotes` | `QuotesView` | Beginner |
| `ai` | `SkillStudioView` | Pro |
| `creator` | `CreatorPipelineView` | Pro |

### 7.3 Key Components

- **`AIPanel`** — Right-drawer (`Cmd+Shift+A`): per-tab skill cards, run/cancel, config, image picker, character/chapter scope override.
- **`ExplorerPanel`** — Bottom-right compass widget: top-5 frequently-used entities, quick notes popup, searchable browse-universe popup.
- **`QuickSearchModal`** — `Cmd+K`: global search across stories, characters, cities, books, chapters.
- **`CharacterPicker`** — Reusable searchable dropdown with image thumbnails, single/multi-select.
- **`EntityMentionPicker`** — `@` type→entity dropdown in prose/notes textareas.
- **`ArtifactFormModal`** — Shared artifact create/edit modal.
- **`GoogleDriveModal`** — Backup status + trigger sync.

### 7.4 Theming

CSS custom properties switched by `html[data-theme="..."]`:

```css
--bg-base, --bg-panel, --bg-card, --bg-hover
--border-color, --border-subtle
--text-main, --text-muted, --text-dim
--accent, --accent-hover, --accent-light
--shadow-color, --font-prose, --font-ui
```

Components use these via utility classes (`literary-card`, `glass-panel`, `font-prose`, `font-ui`). Never hardcode colors.

### 7.5 Entity References (`@`-mentions)

Text tokens in the format `[[type:id|label]]` (e.g. `[[character:elara|Elara]]`) are parsed by `EntityMentionPicker` on `@` keystroke and rendered as bold hover-tooltips by `EntityReferenceText`. Plain-text tokens — no impact on word count, GDocs mode, backups, or AI context.

---

## 8. AI Integration (Ollama)

### 8.1 Transport Layer (`ai/ollama.py`)

- `OllamaClient` — async HTTP client for Ollama's OpenAI-compatible API.
- `detect_capabilities(model)` — classifies models into families: text, vision, ocr, code.
- `complete(messages, model, images, options)` — single completion call.
- `cached_models(ttl=30s)` — cached model list to avoid hammering Ollama.

### 8.2 Pipelines (`ai/pipelines.py`)

21 registered pipelines, each a `PipelineDef` with:

| Field | Purpose |
|---|---|
| `id` | Stable identifier (e.g. `character_analysis`) |
| `family` | `analysis` or `import` |
| `tabs` | Which UI tabs show this skill (empty = all) |
| `steps` | `List[StepSpec]` — ordered LLM/generate steps |
| `context_builder` | Which context function to use |
| `needs_images` | Whether the pipeline accepts image input |
| `save_targets` | Which files to write results to |

#### Built-in Pipelines

**Analysis (18):**
- `character_analysis`, `character_web`, `character_relationships`
- `world_consistency`, `plot_structure`, `pacing_analysis`
- `dialogue_analysis`, `foreshadowing_tracker`, `theme_analysis`
- `chapter_art` (multi-step: LLM prompt → local diffusion → save asset → attach to chapter)
- `chapter_interconnect` (driven from Book Outliner "Chapter Judge" sub-tab)
- `perspective_rewrite` (rewrites prose from a character's voice)
- `chapter_draft` (drafts a full chapter from scene breakdown)
- `writing_stats`, `story_insights`, `timeline_reconstruction`
- `name_generator`, `setting_atmosphere`

**Import (3):**
- `characters_import`, `world_import`, `plot_import`

### 8.3 Context System (`ai/context.py`)

21 context builders, each `(fm, story, params) → str`. `build_context_from_sources` assembles context from `routing.sources` with a character budget (`OLLAMA_CONTEXT_BUDGET_CHARS`, default 40000), dropping lowest-priority sources when over budget.

### 8.4 Job Queue (`ai/jobs.py`)

- `JobManager` — per-story FIFO queue, one runner per story.
- Jobs execute steps sequentially: resolve model → build context → call Ollama → post-process.
- Supports `kind="generate"` steps (local diffusion via `juggernaut_xl_generate.py`).
- `recover_interrupted()` — requeues jobs left in `running` state on startup.
- Vision/OCR steps attach staged images to the last message.

### 8.5 Custom Skills (`ai/custom.py`)

Users can create custom pipelines via the Skill Studio. Routing is handled by the Context Router (`ai/router.py`):

- **LLM routing:** sends skill description to a fast model, gets back a `RouterDecision` with `routed_by` badge and `routing_sources`.
- **Keyword fallback:** if the router model times out (`OLLAMA_ROUTER_TIMEOUT_S`, default 20s) or is unavailable.
- **Locked routing:** when `routing_mode=="locked"` + explicit `routing_sources`, the router is skipped.

### 8.6 Local Image Generation (`ai/generator.py`)

- Wraps `backend/scripts/juggernaut_xl_generate.py` (vendored, uses Stable Diffusion XL on MPS/CUDA).
- `generate_image(prompt, width, height, steps, seed, guidance)` → output PNG path.
- `is_generation_enabled()` — checks for torch + diffusers availability.
- The `chapter_art` pipeline calls this in a generate step, saves the asset, and attaches it to the chapter.

### 8.7 Creator Pipeline (`ai/creator/`)

See [Section 9](#9-creator-pipeline).

---

## 9. Creator Pipeline

An iterative, review-gated pipeline for importing raw prose into a populated story.

### Flow

```
Paste raw text
    │
    ▼
 split_chapters()          ← No LLM; regex/heuristic chapter detection
    │
    ├──→ Characters stage   ← LLM extraction → review/edit → approve → merge
    ├──→ World stage        ← LLM extraction → review/edit → approve → merge
    ├──→ Plot stage         ← LLM extraction → review/edit → approve → merge
    └──→ Arcs stage         ← LLM extraction → review/edit → approve → merge
                                │
                                ▼
                           Start next batch (or Done)
```

### Key Modules

| File | Responsibility |
|---|---|
| `split.py` | `split_chapters(text)` → `[(title, content)]` via markers → headings → paragraph chunking (~1500 words) |
| `stages.py` | `StageRunner` — strict-JSON LLM calls with retries, pinned to `qwen2.5:7b` (fast) |
| `merge.py` | `EntityMerger` — append + dedupe by normalized name |
| `pipeline.py` | Orchestrator: split → run_stage → approve_stage → merge → next batch |
| `store.py` | `CreatorStore` — per-story `creator/state.json` + `batches/<batch>/<stage>.json` |
| `schemas.py` | `CreatorState`, `CreatorSummary`, stage result models |

### Merge Strategy

All entity merges are **append + dedupe** (never replace). This supports iterative batch processing where each batch adds new entities without overwriting previous work.

---

## 10. Google Drive Backup

### Sync Model

- `GoogleDriveBackupService` uploads to a `LoreSmith/` root folder on the connected account's Drive.
- One subfolder per story slug.
- **Idempotent:** each local file's relative path maps to a Drive file ID in a per-story manifest (`data/stories/.credentials/backup/state.json`). Re-syncing updates in place; files removed locally are deleted from Drive.
- Sync **does not** convert Markdown to Google Docs.

### Restore

- `preview_restore()` — classifies every tracked file as `in_sync`, `conflicts`, `remote_only`, or `local_only` (md5 vs Drive md5Checksum).
- `restore_all(choice)` — `'drive'` overwrites local (backs up originals to `.restore-backup/`), `'local'` keeps local. Remote-only files are always created.

### State

`_backup_status` is in-memory (resets on restart). `last_sync_time` is persisted in the backup state file.

---

## 11. PWA & Offline Support

- `vite-plugin-pwa` generates `manifest.webmanifest`, `sw.js`, and `registerSW.js`.
- Service worker is **network-only for `/api/*`** — the app shell works offline but data operations need the backend.
- `devOptions.enabled = false` — SW only runs in production build/preview, never in `npm run dev`.
- `usePwaInstallPrompt` hook captures `beforeinstallprompt` for the Navbar Install button.
- On iOS: use "Add to Home Screen".

---

## 12. Configuration & Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `data/stories` | Base data directory |
| `GOOGLE_CLIENT_SECRET_PATH` | `client_secret.json` | OAuth2 credentials |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_DEFAULT_MODEL` | `qwen3.5:9b` | Primary text model |
| `OLLAMA_OCR_MODEL` | `glm-ocr:latest` | OCR model |
| `OLLAMA_VISION_MODEL` | `minicpm-v:latest` | Vision model |
| `OLLAMA_ROUTER_MODEL` | Same as default | Fast model for routing |
| `OLLAMA_TIMEOUT_S` | `300` | Per-completion timeout |
| `OLLAMA_ROUTER_TIMEOUT_S` | `20` | Router call timeout |
| `OLLAMA_CONTEXT_BUDGET_CHARS` | `40000` | Max context window |
| `OLLAMA_TEMPERATURE` | `0.2` | Default temperature |
| `OLLAMA_MAX_IMAGES_PER_RUN` | `6` | Image input limit |
| `OLLAMA_CAPABILITY_OVERRIDES` | (empty) | Force model capabilities |
| `GENERATE_SCRIPT` | `backend/scripts/juggernaut_xl_generate.py` | Diffusion script |
| `GENERATE_PYTHON` | Auto-resolved | Python for diffusion |
| `GENERATE_STEPS` | `25` | Diffusion steps |
| `GENERATE_GUIDANCE` | `5.0` | CFG scale |
| `GENERATE_WIDTH` / `GENERATE_HEIGHT` | `1024` / `1024` | Output resolution |

---

## 13. Contributing & Code Conventions

### Backend

1. All file I/O through `file_utils` helpers — never raw `open()`.
2. New routes in `main.py` with typed Pydantic `response_model`s.
3. Filesystem logic in `FileManager`, not inline in routes.
4. Pydantic models in `schemas.py` for every new entity.
5. IDs are URL-safe slugs: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`.

### Frontend

1. Use CSS variables — no hardcoded colors.
2. Reuse existing components/modals.
3. Use `useStory()` / `useTheme()` contexts — no prop-drilling.
4. Icons from `lucide-react`.
5. Module views in `components/modules/`, shared in `components/`.
6. New views: register in `activeTab` switch (`App.jsx`) and `NAV_ITEMS` (`Sidebar.jsx`).

### General

- No code comments unless requested.
- 2-space indent in JSX, PEP-8-ish in Python.
- Never commit secrets (`client_secret.json`, `.env`).
- `data/` is git-ignored.

---

## License

MIT
