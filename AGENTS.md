# LoreSmith — Fiction Writer Suite: Agent Knowledge Base

This file is the canonical reference for working in this repository. Any AI agent (or
human) should read this before making changes so that edits stay consistent with the
existing architecture, data model, and conventions.

> **IMPORTANT — KEEP THIS FILE UP TO DATE.** Whenever you change the code in a way that
> affects functionality, behavior, data shapes, routes, or file layout, update the
> relevant sections below in the same change (or add a CHANGELOG entry in [CHANGELOG.md]).
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
| Frontend  | React 19 + Vite 6 + Tailwind CSS v4 + Lucide icons + react-force-graph-2d (Character Map) |
| Backend   | Python + FastAPI 0.141 + Pydantic v2              |
| Storage   | Local filesystem (JSON + Markdown + uploaded assets) |
| Optional  | Google Drive OAuth2 / backup (google-api-python-client, google-auth-oauthlib) |

---

## 2. Repository Layout

```
writer_job/
├── AGENTS.md                 ← YOU ARE HERE (knowledge base / conventions)
├── CHANGELOG.md              ← Dated codebase-knowledge update log (moved out of AGENTS.md)
├── walkthrough.md            ← Original project walkthrough (architecture diagram + overview)
├── requirements.txt          ← Python backend dependencies
├── plans/                    ← Design drafts + features index (see below) — NOT implemented code
│   ├── features.md           ← Index of implemented vs. planned features (summary + plan refs)
│   └── implemented/          ← Plan docs moved here once their feature ships
├── backend/
├── backend/
│   └── app/
│       ├── main.py           ← FastAPI app + all REST routes
│       ├── file_manager.py   ← FileManager: all filesystem read/write logic per feature
│       ├── file_utils.py     ← Low-level atomic + thread-safe JSON/text/delete helpers
│       ├── schemas.py        ← All Pydantic models (Story, Character, World, Book, Chapter, ...)
│       ├── google_auth.py    ← GoogleAuthService: OAuth2 flow, token/account persistence
│       ├── google_drive_backup.py ← GoogleDriveBackupService: real, idempotent Drive upload (see §4.6)
│       ├── ai/               ← Local Ollama integration (see §4.5)
│       │   ├── config.py     ← OLLAMA_* env settings
│       │   ├── ollama.py     ← Generic async Ollama client (capabilities, health, complete)
│       │   ├── io.py         ← Image ref → base64 prep (validation + traversal guard)
│       │   ├── schemas.py    ← AIStatus, ModelInfo, AIConfig, AIJob, AIResult, PipelineSummary,
│       │                       CustomSkill, RouterRequest, RouterDecision
│       │   ├── prompts.py    ← SYSTEM_PREFIXES, TASKS, STAGE_LABELS, ROUTER_SYSTEM, step_messages
│       │   ├── pipelines.py  ← PipelineDef registry: 20 analysis + 3 import pipelines
│       │   ├── context.py    ← 19 context builders + build_context_from_sources (budget/drop)
│       │   ├── store.py      ← AiStore: per-story ai/{config.json,jobs/,results/}
│       │   ├── custom.py     ← Custom skill CRUD + duplicate + auto-routing
│       │   ├── router.py     ← Context Router (LLM + keyword fallback)
│       │   ├── jobs.py       ← JobManager: FIFO queue, cancel, recover_interrupted
│       │   ├── notion_enrich.py ← Notion-import Stage C: prose/notes classification + entity extraction via Ollama (design: plans/implemented/notion-import-pipeline.md)
│       │   ├── creator/      ← Creator Pipeline (Pro-tier story import — see §4.7)
│       │   │   ├── schemas.py   ← Stage-result models + CreatorState/CreatorBatchInfo/CreatorSummary, STAGE_NAMES
│       │   │   ├── store.py     ← CreatorStore: per-story creator/state.json + batches/<batch>/<stage>.json & <stage>-approved.json
│       │   │   ├── prompts.py   ← stage_messages() prompts for characters/world/plot/arcs
│       │   │   ├── split.py     ← split_chapters(): Chapter/Part markers → headings → chunking
│       │   │   ├── merge.py     ← EntityMerger: append+dedupe merge_characters/world/plot/arcs
│       │   │   ├── stages.py    ← StageRunner: strict-JSON LLM extraction (retries, null-safe)
│       │   │   └── pipeline.py  ← CreatorPipeline orchestrator (split → stages → approve/merge)
│       │   └── __init__.py
│       └── __init__.py
│   └── scripts/
│       └── import_notion.py  ← One-off Notion Markdown exporter → LoreSmith (designed & implemented; Stages A–D incl. Ollama enrichment; design: plans/implemented/notion-import-pipeline.md)
├── frontend/
│   ├── package.json          ← React/Vite deps; scripts: dev, build, lint, preview
│   ├── vite.config.js        ← dev proxy: /api → http://localhost:8000; VitePWA plugin
│   ├── index.html            ← Google Fonts (Lora, EB Garamond, Inter) + PWA meta tags
│   ├── public/               ← PWA icons (icon.svg, icons/*.png); SW/manifest generated by VitePWA at build
│   └── src/
│       ├── main.jsx          ← React entry
│       ├── App.jsx           ← Provider nesting + MainLayout (navbar/sidebar/content switch)
│       ├── index.css         ← Tailwind + theme CSS variables (sepia/midnight/typewriter)
│       ├── hooks/            ← usePwaInstallPrompt.js (beforeinstallprompt → Install button)
│       ├── context/
│       │   ├── StoryContext.jsx   ← Global story state, activeTab, hotkeys, story CRUD
│       │   └── ThemeContext.jsx   ← Theme state (sepia/midnight/typewriter)
│       └── components/
│           ├── Navbar.jsx              ← Story selector, theme picker, ⌘K, Drive backup, focus, AI panel toggle
│           ├── Sidebar.jsx             ← NAV_ITEMS (incl. Skill Studio → activeTab 'ai') + active universe badge
│           ├── QuickSearchModal.jsx    ← ⌘K global search (stories/chars/cities/books/chapters)
│           ├── AmbientBackground.jsx   ← story background_url cross-fade layer
│           ├── GoogleDriveModal.jsx    ← backup status + trigger sync
│           ├── ArtifactFormModal.jsx   ← shared artifact create/edit modal
│           ├── AIPanel.jsx             ← ⌘⇧A right-drawer: per-tab skill cards, run/cancel, config, image picker,
│           │                              + per-run "Focus on:" character/chapter scope override (-> input.params)
│           ├── ExplorerPanel.jsx       ← global bottom-right compass widget + horizontal hover
│           │                             quick-access bar of the top-5 frequently-used entities (image
│           │                             avatars, no sidebar). Clicking one shows a popup of its top-3 quick
│           │                             notes; a dashed "All" button opens a searchable browse-universe popup.
│           └── modules/
│               ├── HomeView.jsx             ← Home page: all-stories gallery, tags, New Story
│               ├── DashboardView.jsx        ← Per-story dashboard: overview, fun-facts, theme, memorable quotes (character + standalone)
│               ├── WorldbuildingView.jsx    ← Tabbed: cities/mechanics/factions/artifacts/glossary/gallery
│               ├── CharacterRosterView.jsx  ← Roster, gallery, artifacts, appearances, timeline (first portrait auto-added to gallery)
│               ├── CharacterMapView.jsx     ← Force-directed relationship graph (react-force-graph-2d); clickable edges open a
│                                              book→chapter interaction panel; strength filter + hide-isolated
│               ├── BookOutlinerView.jsx     ← Book/chapter tree, plot beats, arcs, POV tracker,
│               │                              + "Chapter Judge" sub-tab (chapter_interconnect skill)
│               ├── QuotesView.jsx           ← Standalone quotes (text + note + tags) tab
│               ├── DraftEditorView.jsx      ← Markdown + Google Docs dual mode, autosave;
│                                              publishes `loresmith:editor-context` window event
│                                              (title/sceneBreakdown/prose) when a chapter loads,
│                                              consumed by ExplorerPanel for relevance ranking
│               ├── SkillStudioView.jsx      ← Skill Studio (activeTab 'ai'): custom skill CRUD
│               │                              with Simple/Advanced progressive toggle + "Start from
│               │                              template" step, router preview + entity focus picker
│               │                              (EntityFocusPicker), lock routing, test-run with inline
│               │                              result (react-markdown, no prose plugin)
│               ├── EntityFocusPicker.jsx    ← shared entity/focus picker: maps plain-language focus
│               │                              groups (Characters/Locations/Books... loaded from
│               │                              /references + /books) to raw routing_sources
│               ├── CreatorPipelineView.jsx   ← Creator Pipeline (activeTab 'creator', Pro-tier): wizard —
│               │                              stepper (Split → Characters → World → Plot → Arcs → Done),
│               │                              paste raw prose, review/edit + approve each extraction stage
│               └── entityRef/               ← Shared `@`-entity-reference feature
│                   ├── entityRef.js             ← token parsing/building helpers ([[type:id|label]])
│                   ├── EntityReference.jsx      ← bold + hover tooltip renderer; withEntityReferences
│                   │                              (wraps react-markdown `text`); EntityReferenceText
│                   └── EntityMentionPicker.jsx  ← useEntityMention hook: `@` type→entity dropdown
│                                                  (portal near caret, keyboard nav) + insert token
├── data/
│   └── stories/
│       └── <story-slug>/     ← Per-story data (see §4). Git-ignored.
└── .gitignore                ← ignores data/*, .DS_Store, .node/
```

> `plans/` contains **design documents only** (e.g. Telegram integration) — they describe
> intended future features and are NOT currently implemented. Do not treat them as existing
> code.
>
> **Lifecycle:** when a feature is implemented, move its plan doc to `plans/implemented/`
> (`git mv plans/<feature>.md plans/implemented/<feature>.md`) and update `plans/features.md`
> (move the row from **Planned** → **Implemented**) plus `CHANGELOG.md` and any affected
> `AGENTS.md` sections in the same change. `plans/features.md` is the canonical index of
> implemented vs. planned features.

---

## 3. Data Model & Storage Layout

### 3.1 Pydantic schemas (`backend/app/schemas.py`)

All request/response bodies are typed with Pydantic v2 models. The core entities:

- **`Story`** — `id` (slug), `title`, `tags[]`, `background_url`,
  `background_images[]` (list of image URLs — local asset URLs or external URLs,
  used by the Home gallery for add/remove + random-on-refresh), `theme`
  (`"sepia"|"midnight"|"paper"`), `aesthetic_theme`, `background_path`,
  `google_doc_ids{}`, `overview[]` (list of paragraphs edited on the per-story
  dashboard, mirroring character `notes`), `deleted` (bool, soft-delete flag),
  `deleted_at` (optional ISO timestamp set when soft-deleted).
- **`Character`** — `id`, `name`, `image_url`, `role`, `location` (home/origin location where the
  character is from), `bio`, `persona` (optional narrative voice/style notes used by the Draft
  Editor's "Rewrite Perspective" feature), `notes[]`, `quotes[]` (memorable lines, shown on the story
  dashboard), `gallery[]`,
  `artifact_ids[]`, `timeline_events[]` (`TimelineEvent`: `year_or_era`, `title`,
  `description`, `book_ids[]`), `plot_point_ids[]`.
- **`WorldMechanics`** — `magic_system`, `technology_level`, `global_rules[]`.
- **`City`** — `id`, `name`, `region`, `atmosphere`, `image_url`, `key_locations[]`.
- **`Faction`** — `id`, `name`, `description`, `leader`, `alignment`.
- **`Artifact`** — `id`, `name`, `type`, `properties`, `location`, `image_url`,
  `belongs_to[]` (character ids), `timeline[]` (TimelineEvent).
- **`GlossaryTerm`** — `id`, `term`, `definition`, `category`.
- **`Quote`** — `id`, `text`, `note` (short context note), `tags[]` (book/chapter/character
  or free-form). Standalone quotes, independent of characters.
- **`GalleryItem`** — `id`, `title`, `image_url`, `context`, `category`, `tags[]`.
  (Concept-art items. `tags[]` make entries searchable in the gallery tab.)
- **`StoryImageItem`** — unified image-library entry for the gallery tab:
  `source` (`"gallery"|"city"|"character"`), `id`, `title`, `image_url`, `context`, `category`,
  `tags[]`, `character_id`, `character_name`.
- **`EntityRefItem`** — one referenceable entity for the `@`-mention picker / hover previews:
  `type` (`"character"|"city"|"faction"|"artifact"|"glossary"`), `id`, `name`, `label`,
  `image_url`, `overview` (short blurb for the tooltip).
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
- **Character Map output (`CharacterMap`)** — `nodes[]` (`CharacterMapNode`: `id`,
  `name`, `image_url`, `role`, `degree`) + `edges[]` (`CharacterMapEdge`: `id`
  `source--target`, `weight`, `interactions[]`). Each `CharacterMapInteraction` is one
  shared plot beat (`book_id`/`book_title`, beat `title`/`description`, optional
  `chapter` as `CharacterMapChapter`). **Derived live** from plot-beat co-occurrence —
  nothing is stored.
- **Writing stats output (`WritingStats`)** — `total_words`, `total_chapters`,
  `current_streak`, `longest_streak`, `today_words`, `today_chapters`,
  `writing_days_total`, `last_active` (ISO or None), `recent_activity[]` (`WritingStatsDay`:
  `date` `YYYY-MM-DD`, `words`, `chapters`). **Derived live** from chapter `.md` file
  modification times (no persistent model); each chapter's current `word_count` is
  attributed to the calendar day it was last edited.

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
│   ├── gallery.json                # [] of GalleryItem
│   └── quotes.json                 # [] of Quote (standalone, tagged)
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
  `GET /api/stories/{id}/images/library` (gallery items + city images + character
  portraits/gallery).
- `get_references(story_id)` returns **all** referenceable entities (characters, cities,
  factions, artifacts, glossary) as a flat `List[EntityRefItem]` (each with its `type`
  field), for the `@`-mention picker + hover previews. Served by
  `GET /api/stories/{id}/references`.
- `get_story_dir(slug)` = `base_data_dir / slug` (`base_data_dir` defaults to
  `DATA_DIR` env or `data/stories`).
- `get_book_dir(slug, book_id)` = `.../books/book-<book_id>`.
- `save_story`/`get_story` read/write the story's `story.json`.
- `list_stories(include_deleted=False)` lists story dirs and **skips** soft-deleted
  stories unless `include_deleted=True`. `get_deleted_stories()` returns only the trash.
- **Soft delete:** `delete_story(slug, hard=False)` flags the story
  (`deleted=True` + `deleted_at` timestamp written into `story.json`) instead of deleting
  files; `hard=True` performs the old `shutil.rmtree`. `restore_story(slug)` clears the
  flag so the story reappears in the library. `list_dirs()` returns sorted story dir names.
- `save_chapter` sets `markdown_file_path` to
  `books/book-<book_id>/chapters/ch-<id>.md` and re-derives `word_count`.
- `get_character_appearances` does a **live filesystem scan** across books, plot beats,
  character arcs, and chapters to compute a character's books/chapters/plot-points.
- `get_character_map(slug)` derives a **CharacterMap** live: every plot beat listing 2+
  characters contributes one interaction between each pair (carrying the book and the
  beat's chapter when `beat.chapter_id` resolves). Edge `weight` = number of shared beats;
  `degree` per node = number of distinct bonds. Single source for the Character Map view.
- `get_writing_stats(slug)` derives **WritingStats** live from the filesystem modification
  times of every chapter's `.md` file (no persistent model): groups each chapter's current
  `word_count` by the calendar day it was last edited, computes current/longest streaks
  (90-day backward scan), total writing days, and a 14-day `recent_activity` list. Used by
  the dashboard's "Writing Progress" card.

### 4.3 `main.py` — FastAPI routes

REST endpoints in `main.py`. The frontend calls these via the Vite dev proxy. Summary:

- **Health:** `GET /api/health`
- **Stories:** `GET/POST /api/stories`, `GET/PUT/DELETE /api/stories/{id}`,
  `GET /api/stories/deleted`, `POST /api/stories/{id}/restore`. `DELETE` soft-deletes by
  default (`?hard=true` permanently removes files); `GET /api/stories/deleted` lists the
  trash; `POST /{id}/restore` brings a soft-deleted story back.
- **Assets:** `POST /api/stories/{id}/assets/upload` (multipart), `GET .../assets/{filename}`
- **Characters:** `GET/POST /api/stories/{id}/characters`,
  `GET/PUT/DELETE .../characters/{char_id}`,
  `GET .../characters/{char_id}/appearances`,
  `GET .../character-map` → `CharacterMap` (nodes + weighted edges with book/chapter
  interaction breakdown, derived from plot beats)
- **World:** `GET/PUT /api/stories/{id}/world/{section}` (section is
  `cities|mechanics|factions|artifacts|glossary|gallery`). Note `quotes` uses its own
  dedicated routes below.
- **Quotes:** `GET /api/stories/{id}/quotes` (list), `POST .../quotes` (upsert full array
  of `Quote`). Standalone, independent of characters; tagged with book/chapter/character.
- **Image library:** `GET /api/stories/{id}/images/library` → unified tagged image library
  (gallery items + city/location images + character images) for the searchable gallery tab.
- **References:** `GET /api/stories/{id}/references` → `List[EntityRefItem]` (flat list of
  all referenceable entities, each with a `type`), used by the `@`-mention picker + hover
  previews in the prose/notes editors.
- **Fun facts:** `GET /api/stories/{id}/fun-facts` → `List[str]` of randomizable summary facts
  (counts/spotlights for characters, factions, cities, artifacts, glossary, books, chapters,
  word count, world mechanics). Used by the dashboard's "Summary · Fun Fact" shuffle card.
- **Writing stats:** `GET /api/stories/{id}/writing-stats` → `WritingStats` (streaks, daily
  word counts, session stats derived live from chapter file modification times). Used by the
  dashboard's "Writing Progress" card.
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
  - `GET /api/backup/status` — returns in-memory `_backup_status` dict (initialized from
    persisted backup state, so `last_sync_time` survives restarts)
  - `POST /api/backup/google-drive?story_id=` — real recursive Drive backup via
    `GoogleDriveBackupService` (see §4.6)
  - `GET /api/backup/restore/preview` — conflict classification report (in_sync/conflicts/
    remote_only/local_only per story)
  - `POST /api/backup/restore` — restore all stories from Drive (body `{choice}`)
- **Local AI (Ollama):**
   - `GET /api/ai/status` → `AIStatus` (available, models w/ capabilities,
     default/ocr/vision/router models, error hint, running_jobs, queued_jobs).
   - `GET /api/ai/pipelines?story_id=&tab=` — list pipelines (built-in + custom) with enable flags from config.
   - `GET/PUT /api/ai/config/{story_id}` — per-story model overrides + enabled_skills list.
   - `POST /api/ai/run` (202) — enqueue a pipeline run (`RunRequest`: story_id, skill, input).
   - `GET /api/ai/jobs/{story_id}` — list jobs for a story.
   - `GET /api/ai/jobs/{story_id}/{job_id}` — get job status.
   - `POST /api/ai/jobs/{job_id}/cancel?story_id=` — cancel pending/running job.
   - `GET /api/ai/results/{story_id}/{pipeline}` — get stored result for a pipeline.
   - `GET/POST /api/ai/custom` — list / create custom skill (routes via Context Router).
   - `PUT/DELETE /api/ai/custom/{skill_id}` — update / delete custom skill (purges from all story configs).
   - `POST /api/ai/custom/{skill_id}/duplicate` — duplicate a custom skill.
   - `POST /api/ai/custom/route` — dry-run router (returns `RouterDecision` with `routed_by` badge).
- **Creator Pipeline (Pro-tier story import — see §4.7):**
  - `GET /api/creator/{story_id}/state` — pipeline state (`CreatorState`: status, current_batch, current_stage, batches[]).
  - `POST /api/creator/{story_id}/split` — split pasted raw prose into book + chapters (`CreatorSplitBody`).
  - `POST /api/creator/{story_id}/run-stage` — run one extraction stage (`CreatorStageBody: {stage}`: characters|world|plot|arcs) and save a draft.
  - `GET /api/creator/{story_id}/draft/{stage}` — get the current batch's saved draft JSON for review/editing.
  - `PUT /api/creator/{story_id}/approve/{stage}` — save edits and merge into the story (`CreatorApproveBody: {result}`).
  - `POST /api/creator/{story_id}/batch` — start a new batch (alias of split for iterative import).
  - `GET /api/creator/{story_id}/summary` — counts for the Done screen (`CreatorSummary`).

**Backup note:** `POST /api/backup/google-drive` performs a **real upload** to the connected
account's Drive. `GoogleDriveBackupService` (`backend/app/google_drive_backup.py`) places all
stories under a top-level `LoreSmith` folder, one subfolder per story slug. Sync is
**idempotent** — each local file's relative path maps to a Drive file id in a per-story
manifest, so re-syncing updates in place (no duplicates) and files removed locally are
deleted from Drive. Backup state (root folder id + manifests + last sync time) is persisted
in `data/stories/.credentials/backup/state.json`. The route still updates the same
`_backup_status` shape the frontend expects:
`{ status, last_sync_time, total_files_synced, error_message }`.

**Restore note:** `GET /api/backup/restore/preview` classifies every tracked file as
`in_sync`/`conflicts`/`remote_only`/`local_only` (md5 vs Drive md5Checksum). `POST
/api/backup/restore` with body `{choice: 'drive'|'local'}` restores across **all stories**;
the choice applies to every conflicting file. `'drive'` overwrites local with the Drive
version and preserves each overwritten local file under `data/stories/.restore-backup/<slug>/`
(cleared at the start of each restore). Remote-only files are always created; local-only files
are never deleted.

### 4.6 Google Drive backup service (`google_drive_backup.py`)
- `GoogleDriveBackupService(auth_service, base_data_dir)` — uploads story dirs to the
  connected account's Drive using `auth_service.get_drive_service()`.
- Key methods: `sync_all_or_story(story_slug, available_slugs)` → `{stories_backed_up,
  files_synced}`; `sync_story(service, story_slug)` syncs one story (uploads new/changed
  files, deletes removed ones); `save_sync_time`/`load_last_sync_time` persist the last sync
  time across restarts. Restore: `preview_restore()` (per-story conflict classification) and
  `restore_all(choice)` (`'drive'`/`'local'`).
- Root folder name constant: `ROOT_FOLDER_NAME = "LoreSmith"`. Skips `.tmp` files. Sync
  does **not** convert Markdown to Google Docs (the old stub wrongly reported
  `markdown_converted_to_docs: True`; the real response reports `False`).

### 4.4 Config via environment variables
- `DATA_DIR` — base data directory (default `data/stories`).
- `GOOGLE_CLIENT_SECRET_PATH` — path to `client_secret.json` for OAuth (default
  `client_secret.json`).
- Ollama AI settings (defaults in parentheses): `OLLAMA_BASE_URL`
  (`http://localhost:11434`), `OLLAMA_DEFAULT_MODEL` (`qwen3.5:9b`),
  `OLLAMA_OCR_MODEL` (`glm-ocr:latest`), `OLLAMA_VISION_MODEL` (`minicpm-v:latest`),
  `OLLAMA_ROUTER_MODEL` (`defaults to OLLAMA_DEFAULT_MODEL`), `OLLAMA_TIMEOUT_S` (`300`),
  `OLLAMA_ROUTER_TIMEOUT_S` (`20` — max wall-clock for one LLM routing call before
  `asyncio.wait_for` falls back to keyword matching; keeps Skill Studio/CRUD responsive
  on slow models), `OLLAMA_CONTEXT_BUDGET_CHARS` (`40000`), `OLLAMA_TEMPERATURE` (`0.2`),
  `OLLAMA_MAX_IMAGES_PER_RUN` (`6`), `OLLAMA_CAPABILITY_OVERRIDES` (empty; format
  `family:caps;[...]` e.g. `gemma4:text,vison` — escape hatch for exotic models).

### 4.5 Ollama AI package (`backend/app/ai/`)
- Lives as a sub-package; module-level `ollama_client = OllamaClient()` singleton in
  `main.py`. Design source of truth: `plans/implemented/ollama-ai-skills.md` (gated phases 0–7).
- `ollama.py` is the **generic transport**: `OllamaRequest`/`OllamaResponse`,
  `detect_capabilities` (families + name heuristics → text/vision/ocr/code),
  `complete()` (OAI-style messages incl. base64 `images`), `resolve_model` (by
  needs/family/preferred), `cached_models` (30s TTL).
- `io.py`: `prepare_images(fm, story_id, refs)` → base64 list; raises 400 with
  `{bad_images, reason}`. Rejects non-image extensions, >8MB files, `..`
  traversal, other-story refs, and >`OLLAMA_MAX_IMAGES_PER_RUN` count.
- `schemas.py`: `AIStatus`, `ModelInfo`, `AIConfig`, `RunInput`/`RunRequest`,
  `AIJob`, `AIResult`, `PipelineSummary`, `CustomSkillPayload`, `RoutingBlock`,
  `CustomSkill`, `RouterRequest`, `RouterDecision`.
- `prompts.py`: `SYSTEM_PREFIXES`, `TASKS` for all 21 pipelines, `STAGE_LABELS`,
  `ROUTER_SYSTEM`, `step_messages` helper.
- `pipelines.py`: `PipelineDef` registry — 20 analysis + 3 import pipelines (incl. `perspective_rewrite`, and
  `chapter_interconnect` which carries **no tabs** so it is driven only from the Book Outliner's
  "Chapter Judge" sub-tab, not the AI Studio panel). Built-in `StepSpec`s
  may set `model_preferred` to pin a specific installed model for that step (used by
  `perspective_rewrite` → `qwen2.5:7b`, because the default reasoning model qwen3.5:9b is
  far too slow for interactive rewrites and times out). `jobs._resolve_step_model` honors
  `step.model_preferred` ahead of the family/config default.
- `context.py`: 19 context builders + `SOURCE_BUILDERS` + `build_context_from_sources`
  with budget/drop logic and "sampled N" notes. All builders share the uniform
  signature `(fm, story, params=None)` — custom-skill runs assemble context here from
  `routing.sources` (built-in pipelines use `build_context`). The `chapter_interconnect`
  builder (`_chapter_range_context`) sorts chapters by numeric id and slices the
  `chapter_id`→`chapter_end` range (defaults to a single chapter when `chapter_end` is
  omitted), returning ordered prose slices + in-range plot beats + appearing characters.
- `store.py`: `AiStore` — per-story `ai/{config.json,jobs/,results/}` persistence.
- `custom.py`: async custom skill CRUD + duplicate + auto-routing (`route_skill`).
  `create`/`update` skip the router when `routing_mode=="locked"` + explicit
  `routing_sources` are provided (instant save of manually curated chips).
- `router.py`: Context Router — LLM routing (format=json, temp=0, think=false) + keyword
  fallback; the LLM call is bounded by `OLLAMA_ROUTER_TIMEOUT_S` (`asyncio.wait_for`) so
  slow models fall back instead of hanging. `route_skill` returns `RouterDecision` with
  `routed_by` badge.
- `jobs.py`: `JobManager` — per-story FIFO queue, one runner per story, cancel,
  `recover_interrupted` startup hook, per-step model resolution via story config
  overrides, image staging.
- `qwen3.5:9b` is a **reasoning model**: `content` is empty while thinking is in
  progress, and `message.thinking` holds the chain. Keep `num_predict` generous (or
  unset) and rely on `options.think=false` only when you want reasoning off.
- **Known latency**: on this hardware qwen3.5:9b takes ~20s/completion; LLM-first
  router makes skill creation slow. Use `OLLAMA_ROUTER_MODEL` to point to a faster model.

### 4.7 Creator Pipeline (`backend/app/ai/creator/`) — Pro-tier story import

Separate from the one-shot AI skills: an iterative, review-gated pipeline that turns pasted
raw prose into a populated story. Source of truth: `plans/implemented/creator-pipeline.md`.

- **Flow:** `split` (no LLM) → 4 extraction stages (`characters`, `world`, `plot`, `arcs`) →
  user reviews/edits each draft → `approve` merges into the story → next batch. Each stage is
  independent; the user picks which to run. Closing a batch auto-completes at `arcs`.
- **Iterative batches:** processing chapters in batches merges via **append + dedupe** (never
  replace). State persisted under `<story-slug>/creator/` (`CreatorStore`): `state.json` +
  `batches/<batch>/<stage>.json` (draft) and `<stage>-approved.json` (post-approval copy).
- **`split.py`:** `split_chapters(text)` → `[(title, content)]`. Preference: explicit
  `Chapter/Part <N>` markers (with `##` prefix or `—`/`:` titled) → markdown `##` headings →
  paragraph chunking (~`CHUNK_WORDS`=1500). Chapter titles come from the marker line only
  (must not swallow body content). Creates a `Book` + `Chapter` per split chapter with the
  `.md` file saved; `BOOK_ID` = story's first book (`"1"`).
- **`stages.py`:** `StageRunner` calls Ollama (`format="json"`, `temperature=0.0`,
  `options.think=false`) pinned to `_CREATOR_MODEL = "qwen2.5:7b"` (fast, not the slow
  reasoning default). Tolerant parsing with up to 3 retries + `_extract_json` (cleans
  triple-backtick fences). Null-safe coercion helpers `_s()`/`_sl()` convert `null` string/list values to
  `""`/`[]` so pydantic stage models never crash on real Ollama output.
- **`pipeline.py`:** `CreatorPipeline(fm, client, base_data_dir)` orchestrator
  (`split_text`, async `run_stage`, `approve_stage`, `start_new_batch`, `get_summary`).
  `_drop_nulls()` recursively strips `None` before building `WorldStageResult/PlotStageResult/
  ArcsStageResult` from user-edited approvals. Arcs re-ground with already-approved character
  names. `_merge` routes to `EntityMerger` methods (`merge_characters`/`merge_world`/
  `merge_plot`/`merge_arcs`).
- **`merge.py`:** `EntityMerger` appends + dedupes by normalized name (`_norm`). `merge_plot`
  maps 1-based `chapter_index` → chapter id via the batch's added chapters (`_chapter_id_by_index`).
- **Routes (`main.py`):** `GET .../state`, `POST .../split`, `POST .../run-stage`,
  `GET .../draft/{stage}`, `PUT .../approve/{stage}`, `POST .../batch`, `GET .../summary`
  (see §4.3). `creator_pipeline = CreatorPipeline(file_manager, ollama_client,
  file_manager.base_data_dir)`.
- **Frontend:** `CreatorPipelineView.jsx` (activeTab `'creator'`, Pro-gated): wizard stepper
  Split → Characters → World → Plot → Arcs → Done, a paste pane, per-stage review/edit/approve
  (`runStage`/`approveStage` POST/PUT the stage), and a Done screen with summary counts.

---

## 5. Frontend Architecture

### 5.1 Provider nesting (`App.jsx`)
`ThemeProvider` → `StoryProvider` → `SkillLevelProvider` → `MainLayout`. `MainLayout` renders
`Navbar`, `Sidebar`, `AmbientBackground`, the active module (from `activeTab` switch), the
global `QuickSearchModal`, `GoogleDriveModal`, the global `ExplorerPanel` (bottom-right widget
+ right-drawer), and the `AIPanel`. **Focus mode** hides the navbar/sidebar; the Explorer
widget stays visible (as a locked, non-expanding compass below Intermediate).

#### 5.1.0 Skill Levels (`SkillLevelContext.jsx` + `SkillLevelToggle.jsx`)
Progressive-unlock "modes" (Beginner → Intermediate → Pro) that progressively reveal features
so new users aren't overwhelmed. Source of truth:
- `frontend/src/context/SkillLevelContext.jsx` exposes `SkillLevelProvider`, `useSkillLevel()`,
  `SKILL_LEVELS` (tier metadata: name/icon/tagline/description/features), `LEVEL_ORDER`
  (`['beginner','intermediate','pro']`), and `FEATURE_LEVELS` — a map of feature key →
  minimum tier. Helper `canUse(key)` returns true when the current tier is at/above the tier
  that unlocks `key`; `featureLevel(key)` / `featureIndex(key)` return the tier/rank. Level is
  persisted in `localStorage` (`loresmith_skill_level`, default `beginner`).
- **Modes summary** (defaults; change `FEATURE_LEVELS` to remap):
  - **Beginner**: Home, Story Dashboard, Character Roster, Draft Editor (Markdown), Quotes,
    Trash, Quick Search, Themes, Create Story, Drive Backup.
  - **Intermediate**: Worldbuilding Hub, Book Outliner (Tree + Plot Beats only), Character Map,
    Universe Explorer, Google Doc editing mode, Focus Mode.
  - **Pro**: full AI Panel, Skill Studio, Character Arcs, POV Tracker, Chapter Judge,
    Perspective Rewrite, AI settings, AI image picker.
- UI: `Navbar.jsx` mounts the compass-anchored `SkillLevelToggle` ascent-trail selector (with a
  "level up" button and, on first load only, a `SkillLevelModal` onboarding picker shown from
  `MainLayout`). `Sidebar.jsx` filters `NAV_ITEMS` (each item carries a `feature` key) to the
  unlocked tier and shows a "locked at tier" teaser. Locked tabs are additionally guarded by
  the generic `LevelGate` in `App.jsx`, and key views gate their advanced sub-features in-view
  (AIPanel/SkillStudio Pro-lock screens; BookOutliner hides arcs/POV/judge below Pro;
  DraftEditor gates Google Docs to Intermediate and shows a locked "Rewrite Perspective" below
  Pro; ExplorerPanel shows a locked compass below Intermediate). Changing tier triggers the
  `skill-level-unlock` animation on `<main>` (defined in `index.css`).
- **Convention:** to gate a new feature behind a tier, add a `FEATURE_LEVELS` entry and call
  `canUse('your.feature')` at the relevant UI point — `canUse` returns `true` when ungated.

#### 5.1.1 Universe Explorer (`ExplorerPanel.jsx`)
A self-contained, global component rendered once in `MainLayout` on every tab. A fixed
bottom-right circular compass anchors a **horizontal quick-access bar** (no sidebar, no
radial fan). The compass + bar form a single **hover zone** (a fixed ~30rem-wide band at the
bottom-right): hovering **expands** the tray **leftward** listing the **top 5
frequently-used entities** (each showing its **image avatar** when available, else a type
icon) plus a dashed "All" button; leaving the rectangular band **collapses** it back.
- Clicking an entity opens a compact popup above the bar with its **top-3 quick notes**; the
  "All" button opens a small searchable "browse universe" popup (with per-type filter chips).
  Clicking outside closes the popups.
- **Top-5 ranking = mix of** relevance + usage. Relevance is keyword overlap of character
  notes with the current chapter context (the `loresmith:editor-context` window event below);
  usage is a per-story tally of opens (`count` + `lastUsed`) persisted in `localStorage` key
  `loresmith_explorer_usage_v1` (`{ [storyId]: { [type:id]: { count, lastUsed } } }`).
- **Characters**: the top-3 `notes[]` ranked by relevance to the current chapter; falls back
  to the first 3 when there's no context. A "Show all N notes" expander reveals the rest.
- **Cities / Factions / Artifacts / Glossary**: their descriptive fields (region/atmosphere,
  leader/alignment, type/properties, definition) as the quick notes.
Notes render `[[type:id|label]]` tokens as references via `EntityReferenceText` with a refs
map rebuilt from loaded data.

The relevance context comes from the `loresmith:editor-context` **window** `CustomEvent`
(`detail = { title, sceneBreakdown, prose }`) that `DraftEditorView` dispatches whenever a
chapter's prose loads. Any surface that wants to drive Explorer relevance can dispatch the
same event; keep the detail shape stable.

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
- **Autosave:** `DraftEditorView` markdown mode renders prose as **stacked, note-style
  blocks** (split from the flat `.md` content on `\n\n`). Each block is a card with
  move-up/move-down/edit/delete; an "Add Block" composer appends new blocks; editing a
  block uses an inline textarea with explicit **Save Block** (notes-style, no per-keystroke
  autosave). Saving flattens the blocks (`\n\n` join) and PUTs `{ content }` to
  `/content`. Track `saveState` (`saved|unsaved|saving`). The quick-formatting toolbar and
  Perspective Rewrite operate on the block currently being edited (Rewrite auto-selects the
  last block if nothing is being edited).
- **Assets:** upload via `FormData` (`file` field) to `/assets/upload`; the returned
  `{ url }` is an `/api/stories/{story}/assets/{file}` path used directly in `<img>`.
  `DELETE /api/stories/{id}/assets/{filename}` removes a stored asset file.
- **Characters are saved via `POST /api/stories/{id}/characters`** (upsert) — the frontend
  uses POST both to create and update (not PUT) in `CharacterRosterView`/`WorldbuildingView`.
- **Plot & arcs are saved via `POST .../plot` and `POST .../arcs`** (upsert, full array).
- **Appearances matrix** loads via
  `GET .../characters/{char_id}/appearances` → `{ books, chapters, plot_points }`.
- **Entity references:** fetch `GET /api/stories/{id}/references` → `List[EntityRefItem]`
  (flat, each with `type`). Attach `useEntityMention(refs).bind` (`onInput`/`onKeyDown`) to a
  prose/notes `<textarea>`/`<input>` and render `useEntityMention(refs).dropdown` once per
  view to get the `@` type→entity picker; inserting stores `[[type:id|label]]` in the text.
  To render references, wrap the `react-markdown` components with
  `withEntityReferences(components, refs)` (Markdown surfaces) or use
  `EntityReferenceText text={...} refs={refs}` (plain-text notes). References are plain text
  tokens, so AI context builders, imports, word counts, gdocs mode and backups are unaffected.

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

**PWA / installable app:** the frontend is a Progressive Web App. The production build
(`vite build`) emits `manifest.webmanifest`, `sw.js`, and `registerSW.js` (via
`vite-plugin-pwa`). Opening http://localhost:3000 lets you install it like a desktop app
(Chrome/Edge show an "Install" prompt; the Navbar's Install button triggers it via
`beforeinstallprompt`, captured in `hooks/usePwaInstallPrompt.js`). On iOS/Safari use
"Add to Home Screen". When installed it runs `standalone` (no browser chrome). The
service worker is **network-only for `/api/*`** (data lives on the local backend), so the
app shell works offline but data operations need the backend running.

**PWA gotchas:**
- `devOptions.enabled` is **false** — the service worker only runs in the **production
  build/preview**, never in `npm run dev`. (A dev-mode SW previously caused white
  screens: it cached stale Vite dev responses that survived dev-server restarts.)
- `usePwaInstallPrompt` unregisters any pre-existing service worker + clears caches when
  running in `import.meta.env.DEV`, so leftover dev SWs from older builds self-clean.
- If a browser is already stuck on a white screen from a stale SW, unregister from
  DevTools → Application → Service Workers, then reload.

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

---

> **CHANGELOG** has moved to [CHANGELOG.md](CHANGELOG.md). Update that file (not this one)
> when you add codebase knowledge entries.
