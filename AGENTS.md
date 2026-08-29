# LoreSmith — Fiction Writer Suite: Agent Knowledge Base

This file is the canonical reference for working in this repository. Any AI agent (or
human) should read this before making changes so that edits stay consistent with the
existing architecture, data model, and conventions.

> **IMPORTANT — KEEP THIS FILE UP TO DATE.** Whenever you change the code in a way that
> affects functionality, behavior, data shapes, routes, or file layout, update the
> relevant sections below in the same change (or add a CHANGELOG entry at the bottom).
> A model that later reads this file must be able to act correctly without re-deriving
> everything from source.

---

## 1. Project Overview

**LoreSmith** is a **local-first fiction writing application** for fiction writers to manage:

- Worldbuilding (cities, magic/mechanics, factions, artifacts, glossary, concept art gallery)
- Character roster, timelines, and a cross-book/chapter "appearances matrix"
- Multi-book plot outlines, plot beats, and per-character arcs
- Prose writing in two modes: a local **Markdown editor** (with autosave) and an embedded
  **Google Docs** editor iframe
- One-click **Google Drive backup** (OAuth2)

**Key architectural principle:** there is **no database**. All data is stored as plain
JSON + Markdown files on the local filesystem under `data/stories/`. The frontend talks to
a FastAPI backend through REST endpoints; the backend reads/writes files atomically.

### Stack
| Layer     | Tech                                              |
|-----------|---------------------------------------------------|
| Frontend  | React 19 + Vite 6 + Tailwind CSS v4 + Lucide icons |
| Backend   | Python + FastAPI 0.141 + Pydantic v2              |
| Storage   | Local filesystem (JSON + Markdown + uploaded assets) |
| Optional  | Google Drive OAuth2 / backup (google-api-python-client, google-auth-oauthlib) |

---

## 2. Repository Layout

```
writer_job/
├── AGENTS.md                 ← YOU ARE HERE (knowledge base / conventions)
├── walkthrough.md            ← Original project walkthrough (architecture diagram + overview)
├── requirements.txt          ← Python backend dependencies
├── plans/                    ← Design drafts (e.g. telegram-integration.md) — NOT implemented code
├── backend/
│   └── app/
│       ├── main.py           ← FastAPI app + all REST routes
│       ├── file_manager.py   ← FileManager: all filesystem read/write logic per feature
│       ├── file_utils.py     ← Low-level atomic + thread-safe JSON/text/delete helpers
│       ├── schemas.py        ← All Pydantic models (Story, Character, World, Book, Chapter, ...)
│       └── __init__.py
├── frontend/
│   ├── package.json          ← React/Vite deps; scripts: dev, build, lint, preview
│   ├── vite.config.js        ← dev proxy: /api → http://localhost:8000
│   ├── index.html            ← Google Fonts (Lora, EB Garamond, Inter, JetBrains Mono)
│   └── src/
│       ├── main.jsx          ← React entry
│       ├── App.jsx           ← Provider nesting + MainLayout (navbar/sidebar/content switch)
│       ├── index.css         ← Tailwind + theme CSS variables (sepia/midnight/typewriter)
│       ├── context/
│       │   ├── StoryContext.jsx   ← Global story state, activeTab, hotkeys, story CRUD
│       │   └── ThemeContext.jsx   ← Theme state (sepia/midnight/typewriter)
│       └── components/
│           ├── Navbar.jsx              ← Story selector, theme picker, ⌘K, Drive backup, focus
│           ├── Sidebar.jsx             ← NAV_ITEMS + active universe badge
│           ├── QuickSearchModal.jsx    ← ⌘K global search (stories/chars/cities/books/chapters)
│           ├── AmbientBackground.jsx   ← story background_url cross-fade layer
│           ├── GoogleDriveModal.jsx    ← backup status + trigger sync
│           ├── ArtifactFormModal.jsx   ← shared artifact create/edit modal
│           └── modules/
│               ├── DashboardView.jsx        ← Story cards grid, bg URL picker, tags
│               ├── WorldbuildingView.jsx    ← Tabbed: cities/mechanics/factions/artifacts/glossary/gallery
│               ├── CharacterRosterView.jsx  ← Roster, gallery, artifacts, appearances, timeline
│               ├── BookOutlinerView.jsx     ← Book/chapter tree, plot beats, arcs, POV tracker
│               └── DraftEditorView.jsx      ← Markdown + Google Docs dual mode, autosave
├── data/
│   └── stories/
│       └── <story-slug>/     ← Per-story data (see §4). Git-ignored.
└── .gitignore                ← ignores data/*, .DS_Store, .node/
```

> `plans/` contains **design documents only** (e.g. Telegram integration) — they describe
> intended future features and are NOT currently implemented. Do not treat them as existing
> code.

---

## 3. Data Model & Storage Layout

### 3.1 Pydantic schemas (`backend/app/schemas.py`)

All request/response bodies are typed with Pydantic v2 models. The core entities:

- **`Story`** — `id` (slug), `title`, `tags[]`, `background_url`,
  `background_images[]` (list of image URLs — local asset URLs or external URLs,
  used by the Dashboard for add/remove + random-on-refresh), `theme`
  (`"sepia"|"midnight"|"paper"`), `aesthetic_theme`, `background_path`,
  `google_doc_ids{}`.
- **`Character`** — `id`, `name`, `image_url`, `role`, `bio`, `notes[]`, `gallery[]`,
  `artifact_ids[]`, `timeline_events[]` (`TimelineEvent`: `year_or_era`, `title`,
  `description`, `book_ids[]`), `plot_point_ids[]`.
- **`WorldMechanics`** — `magic_system`, `technology_level`, `global_rules[]`.
- **`City`** — `id`, `name`, `region`, `atmosphere`, `key_locations[]`.
- **`Faction`** — `id`, `name`, `description`, `leader`, `alignment`.
- **`Artifact`** — `id`, `name`, `type`, `properties`, `location`, `image_url`,
  `belongs_to[]` (character ids), `timeline[]` (TimelineEvent).
- **`GlossaryTerm`** — `id`, `term`, `definition`, `category`.
- **`GalleryItem`** — `id`, `title`, `image_url`, `context`, `category`, `tags[]`.
  (Concept-art items. `tags[]` make entries searchable in the gallery tab.)
- **`StoryImageItem`** — unified image-library entry for the gallery tab:
  `source` (`"gallery"|"character"`), `id`, `title`, `image_url`, `context`, `category`,
  `tags[]`, `character_id`, `character_name`.
- **`Book`** — `id`, `title`, `order`, `target_word_count`, `plot_subsections[]`
  (`PlotSubsection`: `title`, `description`), `google_doc_url`.
- **`Chapter`** — `id`, `title`, `pov_character_id`, `scene_breakdown`,
  `markdown_file_path`, `word_count`, `google_doc_id`.
- **`Plot`** — `beats[]` (`PlotBeat`: `id`, `title`, `description`, `chapter_id`,
  `character_ids[]`), `theme`.
- **`CharacterArc`** — `character_id`, `arc_summary`, `starting_state`, `ending_state`,
  `key_milestones[]`.
- **Appearances output (`CharacterAppearances`)** — `books[]`, `chapters[]`
  (`AppearanceChapter` has `is_pov`), `plot_points[]`.

### 3.2 On-disk JSON structure

Every story lives at `data/stories/<story-slug>/`:

```
<story-slug>/
├── story.json                      # The Story object
├── assets/                         # Uploaded images (uuid-prefixed filenames)
├── characters/
│   └── <char-id>.json              # One Character per file
├── world/
│   ├── cities.json                 # [] of City
│   ├── mechanics.json              # WorldMechanics object (NOT a list!)
│   ├── factions.json               # [] of Faction
│   ├── artifacts.json              # [] of Artifact
│   ├── glossary.json               # [] of GlossaryTerm
│   └── gallery.json                # [] of GalleryItem
└── books/
    └── book-<book-id>/
        ├── book.json               # The Book object
        ├── plot.json               # { beats: [], theme: "" }
        ├── character_arcs.json     # [] of CharacterArc
        └── chapters/
            ├── ch-<ch-id>.json     # Chapter metadata (incl. word_count)
            └── ch-<ch-id>.md       # Raw Markdown prose
```

**Gotchas to preserve:**
- `mechanics.json` is a **single object**, while all other world files are **arrays**.
- A chapter is stored as **two files** (`.json` metadata + `.md` content) with the same
  `ch-<id>` base name. Deleting/editing a chapter must touch both.
- `word_count` on a chapter is **derived** from the `.md` file whenever the chapter is
  saved (`file_manager.save_chapter`) or prose is saved (`save_chapter_prose`).

---

## 4. Backend Architecture

### 4.1 `file_utils.py` — atomic + thread-safe I/O primitives

Lowest layer. All higher-level file operations must go through these helpers:

- `read_json_safe(path, default)` — returns `default` if missing/parse fails.
- `write_json_safe(path, data, indent=2)` — atomic temp-file + `fsync` + `os.replace`.
- `read_text_safe(path, default="")` / `write_text_safe(path, content)` — same for text.
- `delete_file_safe(path)`.

**Convention:** These use a global dict of per-path `threading.Lock` objects
(`get_file_lock`) so concurrent saves on the same file don't corrupt it. **Do not write
to data files directly with `open()`** — always use these helpers.

### 4.2 `file_manager.py` — `FileManager` class

Single class instantiated once in `main.py` (`file_manager = FileManager()`). All CRUD
logic lives here, organized by feature (stories, assets, characters, world, books/plot/
arcs, chapters/prose). Key behaviors to maintain:

- `ensure_story_structure(slug)` creates the per-story dirs + default world files
  (including the `gallery.json` default `[]`, and the `mechanics.json` default object).
- `sync_story_backgrounds(story_id)` recomputes background_images from the story's
  concept art (world/gallery.json) and each character's `gallery[]` only (character
  portraits `image_url` are excluded and removed if previously synced). Deduped, keeps
  existing non-portrait entries; resets `background_url` to the first. Auto-invoked after
  character POST/PUT/DELETE, after world PUT for the `gallery` section, and inside
  `list_stories` (so existing stories are backfilled on every story-list fetch).
- `get_image_library(story_id)` builds the unified tagged library returned by
  `GET /api/stories/{id}/images/library` (gallery items + character portraits/gallery).
- `get_story_dir(slug)` = `base_data_dir / slug` (`base_data_dir` defaults to
  `DATA_DIR` env or `data/stories`).
- `get_book_dir(slug, book_id)` = `.../books/book-<book_id>`.
- `save_chapter` sets `markdown_file_path` to
  `books/book-<book_id>/chapters/ch-<id>.md` and re-derives `word_count`.
- `get_character_appearances` does a **live filesystem scan** across books, plot beats,
  character arcs, and chapters to compute a character's books/chapters/plot-points.

### 4.3 `main.py` — FastAPI routes

REST endpoints in `main.py`. The frontend calls these via the Vite dev proxy. Summary:

- **Health:** `GET /api/health`
- **Stories:** `GET/POST /api/stories`, `GET/PUT/DELETE /api/stories/{id}`
- **Assets:** `POST /api/stories/{id}/assets/upload` (multipart), `GET .../assets/{filename}`
- **Characters:** `GET/POST /api/stories/{id}/characters`,
  `GET/PUT/DELETE .../characters/{char_id}`,
  `GET .../characters/{char_id}/appearances`
- **World:** `GET/PUT /api/stories/{id}/world/{section}` (section is
  `cities|mechanics|factions|artifacts|glossary|gallery`).
- **Image library:** `GET /api/stories/{id}/images/library` → unified tagged image library
  (gallery items + character images) for the searchable gallery tab.
- **Books:** `GET/POST /api/stories/{id}/books`,
  `GET/PUT/DELETE .../books/{book_id}`,
  `GET/PUT/POST .../books/{book_id}/plot`,
  `GET/PUT/POST .../books/{book_id}/arcs`
- **Chapters:** `GET/POST .../books/{book_id}/chapters`,
  `GET/PUT/DELETE .../chapters/{ch_id}`,
  `GET .../chapters/{ch_id}/content` (alias `/prose`),
  `PUT/POST .../chapters/{ch_id}/content` (alias `/prose`)
- **Google Drive / Backup:**
  - `GET /api/auth/google` — OAuth flow init
  - `GET /api/backup/status` — returns in-memory `_backup_status` dict
  - `POST /api/backup/google-drive?story_id=` — recursive backup

**Backup note:** The current `POST /api/backup/google-drive` implementation only counts
files and simulates Drive sync; it sets `_backup_status` in **module-level memory**
(not persisted). If you change backup to do real Drive writes, keep updating the same
`_backup_status` shape the frontend expects:
`{ status, last_sync_time, total_files_synced, error_message }`.

### 4.4 Config via environment variables
- `DATA_DIR` — base data directory (default `data/stories`).
- `GOOGLE_CLIENT_SECRET_PATH` — path to `client_secret.json` for OAuth (default
  `client_secret.json`).

---

## 5. Frontend Architecture

### 5.1 Provider nesting (`App.jsx`)
`ThemeProvider` → `StoryProvider` → `MainLayout`. `MainLayout` renders `Navbar`,
`Sidebar`, `AmbientBackground`, the active module (from `activeTab` switch), the global
`QuickSearchModal`, and the `GoogleDriveModal`. **Focus mode** hides the navbar/sidebar.

### 5.2 Contexts
- **`StoryContext`** (`useStory`): `stories`, `activeStory`, `selectStory`, `createStory`,
  `updateStory` (generic PUT-and-refresh for ANY story id), `updateActiveStory` (delegates
  to `updateStory(activeStory.id, ...)`),
  `fetchStories`, `activeTab`/`setActiveTab`, `selectedTag`,
  `availableTags`, `focusMode`/`setFocusMode`, `sidebarOpen`, `quickSearchOpen`, `loading`.
  It also registers global hotkeys (**Ctrl/Cmd+Shift+F** focus, **Ctrl/Cmd+K** search,
  **Esc** closes search). Active story id is persisted in `localStorage`
  (`writer_job_active_story_id`).
- **`ThemeContext`** (`useTheme`): `theme`, `setTheme`, `currentThemeObj`, `THEMES`.
  Sets `data-theme` on `<html>`; persists to `localStorage` (`writer_theme`).

### 5.3 Theming / CSS variables (`index.css`)
Color theming is done entirely via CSS custom properties switched by
`html[data-theme="..."]`:
- `sepia` (default, light), `midnight` (dark), `typewriter` (monochrome).
- Core variables: `--bg-base`, `--bg-panel`, `--bg-card`, `--bg-hover`, `--border-color`,
  `--border-subtle`, `--text-main`, `--text-muted`, `--text-dim`, `--accent`,
  `--accent-hover`, `--accent-light`, `--shadow-color`, `--font-prose`, `--font-ui`.
- Components reference these variables via classes like `literary-card`, `glass-panel`,
  `font-prose`, `font-ui`. **When adding UI, use these variables — never hardcode colors.**

---

## 6. Frontend ↔ Backend Contract (API usage patterns)

The frontend calls relative `/api/...` URLs (proxied by Vite to `:8000`). Common patterns
to reuse:

- **Active story** is `activeStory.id` (the slug) — every data call uses it in the URL.
- **Chapters:** to load prose, call
  `GET /api/stories/{story}/books/{book}/chapters/{ch}/content` → `{ content }`.
- **Autosave:** `DraftEditorView` debounces saves 1000ms and PUTs
  `{ content }` to `/content`. Track `saveState` (`saved|unsaved|saving`).
- **Assets:** upload via `FormData` (`file` field) to `/assets/upload`; the returned
  `{ url }` is an `/api/stories/{story}/assets/{file}` path used directly in `<img>`.
  `DELETE /api/stories/{id}/assets/{filename}` removes a stored asset file.
- **Characters are saved via `POST /api/stories/{id}/characters`** (upsert) — the frontend
  uses POST both to create and update (not PUT) in `CharacterRosterView`/`WorldbuildingView`.
- **Plot & arcs are saved via `POST .../plot` and `POST .../arcs`** (upsert, full array).
- **Appearances matrix** loads via
  `GET .../characters/{char_id}/appearances` → `{ books, chapters, plot_points }`.

---

## 7. Running the Project

**Backend** (from repo root):
```bash
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Frontend** (from repo root):
```bash
cd frontend && npm run dev
```
Open http://localhost:3000/ (Vite proxies `/api` → `:8000`).

**Frontend scripts** (`frontend/package.json`): `dev`, `build` (`vite build`),
`lint` (`eslint .`), `preview`.

> There is currently **no automated test suite** in the repo. "Verification" means:
> run the backend + frontend and manually exercise affected features, and run
> `npm run lint` / `npm run build` in `frontend/` after frontend changes.

---

## 8. Conventions & Change Guidelines

Follow these to keep code consistent and safe.

### Backend
1. **All file I/O through `file_utils` helpers** — never raw `open()` on data files.
2. **Add new route handlers in `main.py`** with typed Pydantic `response_model`s (import
   from `app.schemas`). Keep REST shape consistent with §6.
3. **Put filesystem logic in `FileManager`** (`file_manager.py`), not inline in routes.
4. **Add a Pydantic model in `schemas.py`** for every new entity/shape.
5. **Slug / id convention:** story/char/city/book/chapter ids are lowercase URL-safe
   slugs (`name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`). Books are `"1","2",...`
   and dirs are `book-<id>`. Chapters use `ch-<id>` file prefix.
6. When adding a new world section/file, remember to add a default to
   `ensure_story_structure` **and** decide whether it's an array or object (only
   `mechanics` is an object).

### Frontend
1. **UI reads theme from CSS variables** (`var(--accent)`, etc.) — no hardcoded colors.
2. **Reuse existing components/modal patterns** (modals are fixed-overlay divs with
   `animate-in fade-in`; `ArtifactFormModal` for artifacts).
3. **Use `useStory()`/`useTheme()` contexts** rather than prop-drilling story/theme state.
4. **Icons:** import from `lucide-react`.
5. **Component/module naming:** module views live in `components/modules/` and end in
   `View`; shared components live in `components/`.
6. **New active views** must be registered in the `activeTab` switch in `App.jsx` **and**
   in `NAV_ITEMS` in `Sidebar.jsx`.

### General
- **Do not add code comments unless asked** (project convention).
- Match existing formatting/indentation. Backend is Python/PEP-8-ish; frontend uses 2-space
  indent in JSX.
- Do **not** commit secrets. `client_secret.json` and `.env`-style tokens must stay out of git.
- `data/` is git-ignored (`.gitignore`: `data/*`) — user-generated content stays local.

---

## 9. Backup & Google Docs integration specifics (be careful)
- `Navbar.jsx` shows a static "In Sync" badge; real status only updates inside
  `GoogleDriveModal` by polling `GET /api/backup/status`.
- `_backup_status` is in-memory (backend) — it resets on restart.
- Google Docs editing uses a chapter's `google_doc_id` (or book's `google_doc_url`) with
  iframes / `docs.google.com/document/d/<id>/edit?embedded=true`.
- Telegram (in `plans/telegram-integration.md`) is **not implemented** — do not reference it
  as existing functionality.

---

## 10. Known issues / gotchas to watch
- `WorldbuildingView`/`CharacterRosterView` each contain a duplicated
  `syncArtifactCharacters` helper — there is no shared util yet. If you refactor, keep both
  callers working.
- `AmbientBackground` uses `background_images` (cycling, 20s), falling back to
  `background_url`, then `background_path`.
- `schemas.Story.theme` uses literal `"paper"` as the third theme id in the **schema**, but
  `ThemeContext.THEMES` uses `"typewriter"`. Keep the frontend literal (`typewriter`) for
  the UI; be aware `Story.theme` may contain either. Don't "fix" this without checking both.

---

## CHANGELOG — codebase knowledge updates
Every time you change functionality, add a dated entry here summarizing what changed and
update the relevant section(s) above.

- **2026-08-29 — Character detail sub-sections are now column-wise icon tabs.**
  - `CharacterRosterView` detail panel: the hero portrait/name/role header stays on top,
    then the sections below it (Notes, Timeline, Gallery, Artifacts, Appearances) are
    presented as a **vertical icon tab bar** (col-wise; collapses to a horizontal
    scrollable row on small screens). Selecting an icon swaps only that tab's content into
    the adjacent content column (`activeDetailTab` state in the component). **Notes is the
    default tab** and the tab resets to Notes whenever the selected character changes.
  - The Notes composer/notes list were moved out of the profile-header card into the
    Notes tab; the header card is now just hero portrait + name/role bar.

- **2026-08-29 — Character Roster expanded-detail redesign.**
  - `CharacterRosterView` no longer uses a 4/8 split with a tall card list next to the
    profile. Once a character is selected (always auto-selected on fetch if cast exists),
    the detail panel takes full width and the rest of the cast appears as a horizontal,
    scrollable strip of **circular thumbnails** (accent ring on the active one, name label
    underneath, dashed "+" avatar for creating a new character).
  - The full-size roster card grid only renders while no character is selected (or when
    the cast is empty, which shows the empty-state prompt); both states render full width.

- **2026-08-29 — Auto-synced character & concept-art backgrounds + tagged, searchable gallery.**
  - Backend: `FileManager.sync_story_backgrounds(slug)` rebuilds the story's
    `background_images` from concept art (gallery.json) + each character's `gallery[]`
    (deduped, keeps existing, excludes/removes character portraits). Auto-invoked after
    character POST/PUT/DELETE, after world PUT when `section == "gallery"`, and inside
    `list_stories` so existing stories are backfilled immediately.
  - `GalleryItem` gained `tags: List[str]`; new `StoryImageItem` schema + route
    `GET /api/stories/{id}/images/library` returns a unified tagged image library
    (gallery items + character portraits/gallery), used by the searchable gallery tab.
  - Frontend: Gallery & Concept Art tab now shows the unified library with a search box
    (matches title/context/category/tags/character), clickable tag chips, and a
    comma-separated Tags field in the artwork form. Character-sourced images are read-only
    and labelled "Character"; gallery items stay deletable.

- **2026-08-29 — AmbientBackground auto-cycles story backgrounds.**
  - `AmbientBackground.jsx` no longer shows only the fixed `background_url`. It now reads
    all of the active story's `background_images` (falling back to `background_url`, then
    `background_path`) and cross-fades through them on a 20s timer. If only one image (or
    none) exists, it behaves as before. Index resets/keeps current image when the active
    story or its image collection changes.

- **2026-08-29 — Dashboard background image collections.**
  - Backend: added `Story.background_images: List[str]` (schema); Dashboard stores multiple
    background images per story (uploaded asset URLs or external URLs). `background_url`
    mirrors the first image for backward compat (AmbientBackground).
  - Added `DELETE /api/stories/{id}/assets/{filename}` (FileManager.delete_asset).
  - Frontend: `StoryContext.updateStory(storyId, patch)` (PUT + refresh for any story);
    `updateActiveStory` now delegates to it. `DashboardView` shows a background manager panel
    (upload via existing assets/upload, paste URL, thumbnail grid with remove). Each story
    card header shows a random image from the collection, re-rolled on refresh and via the
    shuffle button.
  - Bugfix: `CharacterRosterView` crashed with `Cannot read properties of null (reading
    'notes')` when the active story had no characters (null `selectedChar`); the legacy
    `characterNotes` fallback now uses optional chaining.
