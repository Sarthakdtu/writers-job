# CHANGELOG — codebase knowledge updates

Every time you change functionality, add a dated entry here summarizing what changed and
update the relevant section(s) in AGENTS.md.

- **2026-09-01 — Skill Studio UX polish (icons + job tracker).**
  - `SkillStudioView.jsx`: custom-skill catalog cards condensed to compact emoji+name tiles
    (description moved to title tooltip). Built-in skills list replaced by a search box +
    horizontally scrollable symbol strip; clicking a symbol shows its name/description.
  - Added a "Job tracker" left-column section: live list of all AI jobs for the active
    story (newest first) with status badges, elapsed/queue/model info, progress bar,
    cancel button, and click-to-expand markdown result.
  - Job retention: `AIJob.archived` flag (default False) + `AiStore.apply_retention()`
    — terminal jobs older than 24h get archived, older than 7 days are deleted
    (running/pending never touched). Runs on every `GET /api/ai/jobs/{story_id}`.
    Job tracker shows an "archived" badge + age ("Nd ago") and dims archived rows.
  - Selecting a job row now opens a right-side detail drawer (`JobDetailDrawer`) with the
    job's status/model/timing/chips, progress, cancel button, error, and the markdown
    response (fetched from `/results`); archived jobs are shown grayscale/dimmed.
  - Job tracker is paginated (5 jobs per page, prev/next controls) and groups each page's
    jobs under their skill (emoji + name + per-group count).

- **2026-09-01 — AI Skills: Beginner-Friendly UX Overhaul.**
  - `frontend/src/components/EntityFocusPicker.jsx` (new): entity/focus picker that maps
    plain-language groups (Characters, Locations, Factions, Artifacts, Books...) to raw
    `routing_sources` (`characters`, `world_cities`, `books`...). Loads story references
    (`/references`) and books (`/books`) to show real named entities.
  - `frontend/src/components/modules/SkillStudioView.jsx`: progressive disclosure — simple
    mode (Name/Description/Prompt/Focus dropdown) is default; "Advanced options" toggle
    reveals model family, temperature, input kind, max images, tab restrictions, the
    entity focus picker (replacing the raw source-chip + manual-input editor), and lock
    routing. Added a "Start from template" step (Character Analyst, World Consistency,
    Chapter Editor, Image Describer) shown on new skill create. Added inline help text
    under Model family / Temperature / Input kind fields.
  - `frontend/src/components/AIPanel.jsx`: added a "Focus on:" per-run scope override on
    expanded skill cards — character + chapter pickers that map to `input.params`
    (`character_id`, `chapter_id`, `book_id`) on the `RunRequest`.
  - Design doc moved to `plans/implemented/ai-ux-simplification.md`.

- **2026-09-01 — Creator Pipeline: Story Import from Raw Prose (Pro-tier).**
  - Backend `backend/app/ai/creator/` (independent of the one-shot AI skills): `schemas.py`
    (stage-result + `CreatorState`/`CreatorBatchInfo`/`CreatorSummary` models, `STAGE_NAMES`),
    `store.py` (`CreatorStore` — per-story `creator/state.json` + `batches/<batch>/<stage>.json`
    and `<stage>-approved.json`), `prompts.py`, `split.py` (`split_chapters` — explicit
    `Chapter/Part` markers → markdown headings → word-count chunking; titles no longer swallow
    body content), `stages.py` (`StageRunner` — strict JSON extraction w/ 3 retries, null-safe
    `_s`/`_sl` coercion, pinned `_CREATOR_MODEL = "qwen2.5:7b"`, temp 0, `think:false`,
    `format:"json"`), `merge.py` (`EntityMerger` — append+dedupe `merge_characters`/`merge_world`/
    `merge_plot`/`merge_arcs`), `pipeline.py` (`CreatorPipeline` orchestrator: split → 4 extraction
    stages → approve/merge → next batch, iterative merge across batches; `_drop_nulls` guards
    pydantic stage models against null user edits).
  - Routes in `backend/app/main.py`: `GET /api/creator/{story_id}/state`; `POST .../split`;
    `POST .../run-stage`; `GET .../draft/{stage}`; `PUT .../approve/{stage}`; `POST .../batch`;
    `GET .../summary`. `creator_pipeline` instantiated once (uses `file_manager.base_data_dir`).
  - Frontend: new `CreatorPipelineView.jsx` wizard (stepper: Split → Characters → World → Plot →
    Arcs → Done) mounted as `activeTab 'creator'` in `App.jsx` behind a `LevelGate`; `Sidebar.jsx`
    `NAV_ITEM 'creator'` (Wand2 icon, `feature: 'nav.creator'`); `SkillLevelContext.jsx`
    `FEATURE_LEVELS` adds `'nav.creator': 'pro'` + `'creator.pipeline': 'pro'`.
  - Plan doc moved `plans/creator-pipeline.md` → `plans/implemented/creator-pipeline.md`;
    `plans/features.md` moved the row from **Planned** → **Implemented**.
  - Verified: `PYTHONPATH=backend` imports; splitter unit checks (markdown/bare/titled/roman
    chapter markers + chunking); full merge cycle over the HTTP contract (characters/world/plot/
    arcs → `status: complete`); `npm run build` passes (note: repo has no ESLint config, so
    `npm run lint` errors — use `npm run build` to verify frontend). Live LLM extraction not
    smoke-tested (requires Ollama running).

- **2026-09-01 — Features index + plan lifecycle (`plans/features.md`, `plans/implemented/`).**
  - New `plans/features.md` is the canonical index of **implemented** vs **planned** features,
    each with a summary and a reference to its plan doc (or implementation).
  - New `plans/implemented/` directory holds plan docs whose features have shipped. Moved
    `ollama-ai-skills.md`, `notion-import-pipeline.md`, `google-signin-implementation.md`, and
    `google-drive-sync.md` there (all implemented).
  - `AGENTS.md` now documents the lifecycle rule: when a feature is implemented, `git mv` its
    plan doc to `plans/implemented/`, update `plans/features.md` (Planned → Implemented),
    `CHANGELOG.md`, and any affected `AGENTS.md` sections in the same change.
  - Added `plans/creator-pipeline.md` (design phase) — a Pro-tier story-import pipeline that
    ingests pasted raw prose and extracts characters/world/plot/arcs iteratively across batches.

- **2026-09-01 — Skill Levels (Beginner / Intermediate / Pro) progressive-unlock modes.**
  - New `frontend/src/context/SkillLevelContext.jsx`: `SkillLevelProvider`, `useSkillLevel()`,
    `SKILL_LEVELS`, `LEVEL_ORDER`, and `FEATURE_LEVELS` — a declarative feature→tier map where
    each feature key (`nav.home`, `nav.world`, `nav.ai`, `outliner.judge`, `editor.perspective`,
    etc.) maps to a minimum tier (`beginner|intermediate|pro`). `canUse(key)` returns true when
    the current tier is at/above the required tier. Level is persisted in `localStorage`
    (`loresmith_skill_level`, default `beginner`) and exposed with helpers `featureLevel`,
    `featureIndex`.
  - New `frontend/src/components/SkillLevelToggle.jsx`: a compass-anchored ascent-trail
    selector (three tier icons on an animated progress line) in the Navbar, plus a one-time
    onboarding modal (`SkillLevelModal`) that lets users pick a tier and inspect each tier's
    feature roster. The modal shows on first load (`loresmith_skill_level_seen` flag).
  - `frontend/src/App.jsx` nests `SkillLevelProvider` (inside `StoryProvider`) and renders the
    onboarding modal once; a generic `LevelGate` wrapper guards locked tabs (world/charmap/
    outliner/ai) so they can't be reached from lower tiers, and the `<main>` content area
    applies a `skill-level-unlock` animation on tier change.
  - `frontend/src/components/Sidebar.jsx`: `NAV_ITEMS` each carry a `feature` key; the nav
    filters items to those unlocked at the current tier, plus a "locked at tier" hint card to
    nudge upgrades.
  - `frontend/src/components/Navbar.jsx`: mounts `SkillLevelToggle`; the AI Panel button is
    Pro-gated and the Focus Mode button is Intermediate-gated (both hidden below their tier).
  - In-panel gates: `AIPanel.jsx` and `SkillStudioView.jsx` show a Pro-lock screen below Pro;
    `BookOutlinerView.jsx` hides Character Arcs / POV Tracker / Chapter Judge sub-tabs below Pro
    (tree + beats stay at Intermediate); `DraftEditorView.jsx` gates Google Doc Embed to
    Intermediate and shows a locked "Rewrite Perspective" control below Pro;
    `ExplorerPanel.jsx` shows a locked (non-expanding) compass below Intermediate.
  - `frontend/src/index.css` adds `skill-level-unlock` and `skill-level-glow` keyframe utilities.
  - Feature→tier map (default): Beginner = Home, Story Dashboard, Character Roster, Draft Editor
    (Markdown), Quotes, Trash, quick search, themes, create story, Drive backup. Intermediate =
    + Worldbuilding Hub, Book Outliner (tree + plot beats only), Character Map, Universe
    Explorer, Google Doc editing mode, Focus Mode. Pro = + full AI Panel, Skill Studio, Character
    Arcs, POV Tracker, Chapter Judge, Perspective Rewrite, AI settings & image picker.

- **2026-09-01 — Restore from Google Drive (with per-story conflict resolution).**
  - `backend/app/google_drive_backup.py` gains a restore engine: `preview_restore()` and
    `restore_all(choice)`.
  - `preview_restore()` walks per-story manifests (rel_path → Drive file id) from the persisted
    backup state and classifies each file as `in_sync`, `conflicts` (local md5 ≠ Drive
    md5Checksum), `remote_only` (on Drive but not local), or `local_only` (local but not tracked).
    Returns `{ stories: {slug: {in_sync, conflicts, remote_only, local_only}}, total }`.
  - `restore_all(choice)`; `choice` is `'drive'` or `'local'`, applied to all conflicting files:
    - `'drive'` → downloads the Drive version over local, preserving each overwritten local
      file under `data/stories/.restore-backup/<slug>/<rel_path>` (the backup folder is cleared
      at the start of each restore so it reflects the most recent restore). Remote-only files
      are created; local-only files are kept.
    - `'local'` → keeps local versions of conflicts; remote-only files are still created so no
      Drive data is lost.
  - `main.py`: new routes `GET /api/backup/restore/preview` and `POST /api/backup/restore`
    (body `{choice}`).
  - `frontend/src/components/GoogleDriveModal.jsx`: new "Restore from Drive" card with a
    "Check for conflicts" button that loads the preview, shows a per-story summary (conflicts /
    Drive-only / in-sync / local-only + conflict file list), and asks once whether to "Use Drive
    version" or "Keep local version" for all conflicts. Modal content made scrollable
    (`max-h-[90vh]`, `overflow-y-auto`) to fit the added panel.

- **2026-09-01 — Real Google Drive backup (replaces the count-only stub).**
  - New module `backend/app/google_drive_backup.py` — `GoogleDriveBackupService` actually
    uploads story files (JSON, Markdown, assets) to the connected Google account's Drive
    using `auth_service.get_drive_service()`. Files are organized under a top-level
    `LoreSmith` folder, one subfolder per story slug.
  - Sync is **idempotent**: each local file is tracked by its relative path → Drive file id
    in a per-story manifest. `POST /api/backup/google-drive` updates files in place instead
    of duplicating, and deletes from Drive any files removed locally.
  - Backup state (the `LoreSmith` root folder id + per-story manifests + last sync time) is
    persisted in `data/stories/.credentials/backup/state.json`, so it survives restarts.
  - `main.py` now instantiates `backup_service = GoogleDriveBackupService(...)` and the
    backup route calls `backup_service.sync_all_or_story(...)` instead of merely counting
    `os.walk` files. The `_backup_status` dict is initialized with the persisted last sync
    time. Response now reports `markdown_converted_to_docs: False` (the previous stub
    claimed a bogus `True`).
  - `frontend/src/components/GoogleDriveModal.jsx`: updated the success toast text to reflect
    real file sync (no longer claims Markdown was converted to Google Docs).

- **2026-09-01 — Writing Progress (streaks/session stats) dashboard card.**
  - New backend endpoint `GET /api/stories/{id}/writing-stats` → `WritingStats` model
    (`total_words`, `total_chapters`, `current_streak`, `longest_streak`, `today_words`,
    `today_chapters`, `writing_days_total`, `last_active`, `recent_activity[]`).
  - `backend/app/schemas.py`: added `WritingStats` + `WritingStatsDay` models.
  - `backend/app/file_manager.py`: new `get_writing_stats(story_slug)` — derives stats from
    filesystem modification times of chapter `.md` files (no persistent data model). Each
    chapter's current `word_count` is attributed to the calendar day it was last edited.
    Computes streaks by scanning the last 90 days; `recent_activity` is the last 14 days.
  - `frontend/src/components/modules/DashboardView.jsx`: new "Writing Progress" card (placed
    after the header banner) with 4 metric boxes (total words, current/longest streak,
    writing days), a 14-day CSS bar chart of daily words, and a "Last active" label. Also
    converted "Memorable Quotes" into a **sliding single-quote carousel**: shows one random
    quote at a time, auto-advances to the next every 5s (pausing on hover/while navigating),
    with Prev/Next buttons, a dot-pager, and a "Paused / Auto-advancing" status label. The
    quote area has a **fixed height** box: quotes render on a single line (CSS `truncate`
    ellipsis + hover tooltip) and an Expand/Show-less toggle reveals the full text with
    scroll inside the same fixed box, so the card never shrinks or grows across quotes of
    different lengths.

- **2026-09-01 — Expanded aesthetic theme set (10 total).**
  - Added 7 new themes alongside the existing sepia/midnight/typewriter: `forest` (Forest
    Glade, light), `obsidian` (Obsidian, dark/gold), `arsenic` (Arsenic, dark academia),
    `moonlight` (Moonlight, dark/cool-blue), `milktea` (Milk Tea, light/beige), `crimson`
    (Crimson Dusk, dark/burgundy), `sage` (Sage Mist, light/green).
  - `frontend/src/index.css`: new `html[data-theme="..."]` blocks each defining the full 14
    CSS-variable theme set (bg/base/panel/card/hover/border/border-subtle/text-main/muted/dim/
    accent/accent-hover/accent-light/shadow-color).
  - `frontend/src/context/ThemeContext.jsx`: `THEMES` array now lists all 10 themes (id/name/
    mode/description). The Navbar theme dropdown already renders from this array — no Navbar
    change needed.
  - `backend/app/schemas.py`: `Story.theme` Literal widened to accept all 10 theme ids (the
    previous literal included `"paper"`; now matches the frontend `typewriter` literal — see
    §10 known-issue note about keeping the frontend `typewriter` wording).

- **2026-08-31 — Chapter Interconnectedness Judge (Book Outliner, sub-tab 5).**
  - **Concept:** the writer picks a chapter range **x → y** within a book, writes a custom
    judging prompt (a base prompt is pre-filled and editable per-run with a "Reset to base"
    button), and an LLM judge analyzes plot progression + interconnectedness across those
    chapters using prose + plot beats + characters.
  - New built-in pipeline `chapter_interconnect` in `pipelines.py` — it carries **no tabs**
    (empty `[]`) and `family="analysis"`, so it never surfaces as a standalone AI Studio card;
    it is run only from the dedicated Book Outliner "Judge" tab.
  - `context.py`: new `_chapter_range_context(fm, story, params)` builder registered under
    `chapter_interconnect`. It sorts the book's chapters by numeric id, slices the range
    `chapter_id` (start) → `chapter_end` (defaults to start when omitted), and returns an
    ordered `chapters[]` (index/title/POV/scene breakdown + bounded prose slice via
    `slice_span`), the `beats[]` whose `chapter_id` falls in the range, and the `characters{}`
    who are POV or appear in the range. Params: `book_id`, `chapter_id` (start), `chapter_end`.
  - `prompts.py`: `step_messages` handles `prompt_key == "chapter_interconnect"` — the user's
    prompt arrives via the `selection` string, and the analysis system prompt + story context
    are attached.
  - `jobs.py`: `_execute` sets `selection = run_input.text` for this pipeline so the user's
    prompt text reaches `step_messages`.
  - `BookOutlinerView.jsx`: new "5. Chapter Judge" sub-tab with start/end chapter `<select>`s,
    an editable prompt textarea (base prompt + "Reset to base"), a "Run judge" button that
    POSTs `/api/ai/run` with `skill=chapter_interconnect` and the range params, then polls
    `/api/ai/jobs/{story}/{id}` and shows the result via `ReactMarkdown`. Reuses `remark-gfm`
    and `Loader2`/`Sparkles` icons.

- **2026-08-31 — Universe Explorer (horizontal hover bar, replaces fan/arch).**
  - **Concept:** the bottom-right compass is the anchor of a **horizontal quick-access bar**
    (no sidebar, no radial fan). The whole band is one **hover zone**: on `mouseenter` the
    tray **expands leftward** from the compass listing the **top 5 frequently-used entities**
    (each showing its **image avatar** when available, else a type icon) plus a dashed "All"
    button; on `mouseleave` (leaving the rectangular band) it **collapses**.
  - Clicking an entity opens a compact popup above the bar with its top-3 quick notes; "All"
    opens a small searchable browse-universe popup (with type filter chips). Clicking outside
    closes popups.
  - `ExplorerPanel.jsx` is fully rewritten (still self-contained + global in `App.jsx`).
    Data loads from existing endpoints on mount/story change.
  - **Top-5 ranking = mix of** chapter relevance (keyword overlap with the current
    `loresmith:editor-context` window event) **+ usage** (count & recency of opens),
    persisted per-story in `localStorage` under key `loresmith_explorer_usage_v1`
    (`{ [storyId]: { [type:id]: { count, lastUsed } } }`).
  - Character notes render `[[type:id|label]]` tokens as references via
    `EntityReferenceText` (refs map rebuilt from loaded data). Non-character entities show
    their descriptive fields as the quick notes. A "Show all N notes" expander reveals the
    rest.


- **2026-08-30 — Entity references (@-mention picker + rich hover previews).**
  - **Concept:** a writer can type `@` in prose/notes, pick an entity **type** (Characters,
    Cities/Locations, Factions, Artifacts/Relics, Glossary), then pick the specific entity to
    insert a compact inline reference token, stored in the raw Markdown as
    `[[type:id|label]]` (e.g. `[[character:alex|Alex Stone]]`). When rendered, references show
    **bold** and on **hover** reveal a small card with the entity's image (when available) +
    a short overview blurb.
  - Backend: new `EntityRefItem` schema (`type`, `id`, `name`, `label`, `image_url`,
    `overview`). New `FileManager.get_references(slug)` returns **all** referenceable entities
    flattened with a `type` field (characters, cities, factions, artifacts, glossary), gathered
    from live data. New route `GET /api/stories/{id}/references` → `List[EntityRefItem]`.
  - Frontend shared pieces (new `frontend/src/components/modules/entityRef/` folder):
    - `entityRef.js` — utilities: `ENTITY_TYPES`, `parseRefTokens` (regex parsing of
      `[[type:id|label]]`), `buildRefToken`, `insertRefToken`, `groupRefsByType`, labels/icons.
    - `EntityReference.jsx` — `EntityReference` (bold + CSS-hover tooltip using lucide type
      icon or the entity's image), `EntityReferenceText` (render a plain-string note with any
      tokens turned into references, for non-markdown surfaces), and
      `withEntityReferences(mdComponents, refs)` — wraps a `react-markdown` components object
      with a custom `text` component so `[[...]]` tokens render as references inside Markdown.
    - `EntityMentionPicker.jsx` — `useEntityMention(refs)` hook returning `{ bind, dropdown }`.
      `bind` (`onInput`/`onKeyDown`) attaches to a `<textarea>`/`<input>`; it detects `@`,
      records caret position via a mirror element, and shows a **type → entity** two-step
      `createPortal` dropdown near the caret with keyboard nav (↑/↓, Enter, Esc) and a live
      query filter. `applyEntity` replaces the `@query` with the token and dispatches an
      `input` event so the parent's `onChange` picks it up (no new save route needed).
  - Integrated surfaces: Draft Editor prose blocks + Add Block composer (reference rendering
    via `withEntityReferences` in `renderMarkdown`), Character notes (Add/Edit note + rich
    rendering via `EntityReferenceText`), Worldbuilding description fields (city key
    locations, faction description, glossary definition + rich card rendering), and the shared
    `ArtifactFormModal` (artifact properties + timeline descriptions, self-fetches refs).
  - **Storage/compat note:** references are pure text tokens in Markdown, so AI context
    builders, imports, word counts, gdocs mode, and backups all work unchanged. Rendering is
    purely additive via the custom `text` component / `EntityReferenceText`.

- **2026-08-30 — Soft delete / restore for stories + Trash view.**
  - Backend: `Story` schema gains `deleted: bool` and `deleted_at: Optional[str]`.
    `FileManager.delete_story(slug, hard=False)` now **flags** the story (writing
    `deleted=True, deleted_at=now` into `story.json`) instead of `shutil.rmtree`; data
    files are kept until a hard delete. New `FileManager.get_deleted_stories()`,
    `restore_story()`, and `list_dirs()` helpers; `list_stories()` skips `deleted`
    stories unless `include_deleted=True`.
  - API: `GET /api/stories/deleted` lists the trash; `DELETE /api/stories/{id}` now soft-
    deletes and accepts `?hard=true` to permanently remove; new
    `POST /api/stories/{id}/restore` brings a story back.
  - Frontend: new `TrashView` registered as `activeTab 'trash'` (+ `NAV_ITEMS`/App switch
    and a Home header shortcut). Story cards in `HomeView` get a trash button that soft-
    deletes; `StoryContext` adds `softDeleteStory`, `restoreStory`, `hardDeleteStory`,
    `loadDeletedStories`. Deleting the active story falls back to another story (or clears
    the persisted active id).

- **2026-08-30 — Draft Editor: note-style stacked prose blocks.**
  - Frontend-only change to `DraftEditorView` markdown mode. The single split
    textarea/live-preview is replaced by **stacked prose blocks** that work exactly like
    character notes: existing flat `.md` content is split into blocks (`\n\n`-separated)
    on load; each block renders as a card with a number badge, inline markdown render, and
    hover actions (move up / move down / edit / delete). An "Add Block" composer appends a
    new block on top of the stack. Editing opens an inline textarea with explicit
    "Save Block"/cancel (notes-style, no per-keystroke autosave); saving flattens all
    blocks back with `\n\n` join and PUTs to the existing `/content` endpoint, so word
    counts, AI context builders, imports, and the gdocs mode are all untouched.
  - The quick-formatting toolbar now formats the currently edited block and is disabled
    until you click Edit on a block.
  - Perspective Rewrite operates on a single block: if nothing is being edited it
    auto-selects the last block (whole-block selection), otherwise it uses the live
    textarea selection of the block being edited; the rewritten result is applied back to
    that block only.

- **2026-08-30 — Notion export importer (Stages A–D complete).**
  - Backend: one-off script `backend/scripts/import_notion.py` reads a Notion Markdown export
    folder (default `~/Downloads/notion_export`), classifies each `.md` as an **index** (list
    of relative links) vs a **page**, links child chapter-pages to their parent story, and
    derives chapters from inline `CHAPTER n` markers or nested child-page files.
  - Mapping: each leaf Notion page → one LoreSmith `Story`; its chapters → one default
    `Book` ("1"); each chapter → a `Chapter` with prose written via `FileManager`
    (`save_story` / `save_book` / `save_chapter` / `save_chapter_prose`). When a story has
    child chapter-pages, the parent body's prose is stored as `Story.overview[]` (links
    stripped) instead of a chapter. Child chapter ordering prefers a numeric `chapter|ch. N`
    token in the child title; falls back to title sort.
  - **Stage C (Ollama enrichment)** — new `backend/app/ai/notion_enrich.py` reuses the
    existing AI transport (`OllamaClient`, `resolve_model`, `cached_models`, `app.ai.prompts`)
    rather than a new integration. Two passes per story:
      1. `classify_chapter` — splits each chapter's paragraphs into `prose` (kept in the
         chapter `.md`) vs `notes` (planning/outline text, parked into `Story.overview`).
      2. `extract_entities` — pulls characters / cities / factions / plot beats / tags as
         structured JSON, persisted via FileManager writers (merge-safe for existing lists).
    - Pins fast model `qwen2.5:7b` (see AGENTS §4.5 note — the default reasoning model is too
      slow) with `format="json"` + `options.think=false` for deterministic output.
    - Robustness: extraction samples a bounded window (~9KB) of the story text and retries up
      to 3× because small models intermittently emit garbage under `format=json` on large
      sources (observed echoing story text like "NIGHTCALL").
  - Prompts: added `notion_classify` + `notion_extract` tasks and stage labels to
    `app.ai.prompts`; `step_messages` routes both through the `extract` system prefix.
  - CLI: `--dir`, `--data-dir` (scratch-safe), `--dry-run` (report only, flags `short-seed`
    pages under 60 words), `--overwrite` (re-run skips existing slugs → idempotent), and
    `--enrich` (runs Stage C on imported stories, printing per-story entity counts).
  - BUG-FIX during dev: URL-encoded non-space chars (`%E2%80%94` em-dash in filenames)
    broke child-page resolution until switching to `urllib.parse.unquote`.
  - Verified against the real export into a scratch `DATA_DIR`: 16 stories imported; all 16
    enriched (characters/cities/factions/plot beats/tags/notes extracted); served correctly
    through the FastAPI backend. Full 16-story enrichment is a one-off batch ~5–7 min with
    Ollama (per-story ranges ~3s–105s depending on source size and retries).

- **2026-08-30 — Character Map: interactive relationship graph with drill-in bonds.**
  - Backend: new `GET /api/stories/{id}/character-map` endpoint returning a `CharacterMap`
    (`nodes` + `edges`). New schemas: `CharacterMapNode` (id, name, image_url, role, degree),
    `CharacterMapChapter`, `CharacterMapInteraction` (per-shared-beat record with book +
    optional chapter ref), `CharacterMapEdge` (id `source--target`, weight, interactions),
    `CharacterMap`.
  - `FileManager.get_character_map(slug)` derives edges purely from **plot beat
    co-occurrence**: every beat listing 2+ characters adds one interaction between each
    pair (grouped by book, carrying the beat's chapter when `beat.chapter_id` resolves).
    Nodes keep all characters (even isolated ones, `degree` 0); edge `weight` = number of
    shared beats. Single source of truth for the visual, so no relationship data is stored.
  - Frontend: new `CharacterMapView` module (`activeTab 'charmap'`, sidebar "Character Map"
    via `Network` icon). Uses `react-force-graph-2d` (v1.29.1 — new dependency) for a
    draggable/zoomable force graph. Custom `nodeCanvasObject` draws circular image avatars
    (with initial-letter fallback) + degree-based radius; edge thickness maps to `weight`.
    Clicking an **edge** opens a right slide-in panel listing that pair's interactions
    grouped **book → chapter → beat**, with node/edge hover tooltips, selection
    highlighting/dimming, "Min shared beats" strength filter, "Hide isolated" toggle, and
    "Fit view". Theme-aware colors are read dynamically from the CSS variables (fresh
    closures on re-render trigger the canvas redraw — `nodeCanvasObject` has
    `onChange: notifyRedraw`).
  - Registered in `Sidebar.jsx` NAV_ITEMS and the `activeTab` switch in `App.jsx`.

- **2026-08-30 — PWA installable app (desktop-app look).**
  - Frontend is now a Progressive Web App: added `vite-plugin-pwa` (v1.3.0) to
    `vite.config.js` with `registerType: 'autoUpdate'`, a full web-app manifest
    (name **LoreSmith**), `standalone` display (hides browser chrome when installed),
    and Workbox runtime caching (network-only for `/api/*`, stale-while-revalidate for
    Google Fonts). `devOptions.enabled: false` — the SW is **not** registered in `npm run
    dev` (a dev-mode SW was causing service-worker-cached stale HTML/white screens after
    dev-server restarts); it only applies to the production build.
  - New static assets in `frontend/public/`: `icon.svg` (linear-gradient purple quill
    favicon, replaces `/vite.svg`) and `icons/icon-192x192.png`,
    `icons/icon-512x512.png` (also maskable), `icons/apple-touch-icon.png`
    (generated from the SVG via `sips`). The plugin generates `manifest.webmanifest`,
    `sw.js`, and `registerSW.js` at build time (no static `public/manifest.json`).
  - `frontend/index.html`: swapped favicon to `/icon.svg`, added
    `apple-touch-icon`, `theme-color` (#6d28d9), `mobile-web-app-capable`,
    `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
    (black-translucent), `apple-mobile-web-app-title`.
  - New hook `frontend/src/hooks/usePwaInstallPrompt.js`: captures
    `beforeinstallprompt`/`appinstalled`, detects `display-mode: standalone`/iOS
    standalone, exposes `canInstall`/`isInstalled`/`promptInstall`. In `import.meta.env.DEV`
    the hook also **unregisters any existing service worker + clears caches** so stale
    dev SWs left over from an older build can never keep serving broken pages.
  - `Navbar.jsx` gained an "Install / Installed" button (Download / CheckCircle2 icons)
    wired to the hook. Note: `beforeinstallprompt` only fires on Chrome/Edge over a
    secure-or-persistent context (localhost is fine); Safari requires manual
    "Add to Home Screen".

- **2026-08-30 — Search bar in Character Roster.**
  - Frontend: `CharacterRosterView` gained a `searchQuery` state filtering the roster by
    name, role, or location (case-insensitive). A `Search` icon + input was added to both
    the full roster grid header (when no character is selected) and the "Cast Roster"
    horizontal strip (when one is). Filtered counts show as `(matches/total)`; an empty
    match state is shown when the search yields no results.
    
- **2026-08-30 — Perspective / Persona Rewriter in the Draft Editor.**
  - Backend: added optional `persona: Optional[str]` to `Character` (schemas.py) — a
    character's narrative voice/style notes used to drive the Perspective Rewriter.
  - AI: new built-in `perspective_rewrite` pipeline (pipelines.py, family analysis,
    editor tab, `input_kind="text"`). New `perspective_rewrite` task in prompts.py with
    `{{perspective}}` / `{{selection}}` placeholders; `step_messages` gained
    `selection`/`perspective` kwargs. `jobs.py` now feeds the selected `RunInput.text`
    + `params.perspective`/`params.character_id` into the message and context for this
    pipeline. New `_perspective_context` builder in context.py returns the target
    character's persona/profile, or a narrator/third-person directive for the
    pseudo-ids `__narrator__` / `__third__`.
  - **Latency fix:** `perspective_rewrite` was timing out (`Ollama request failed:`)
    because the default reasoning model `qwen3.5:9b` takes >170s per completion on this
    hardware and even returns empty content under `think=false`. Added optional
    `model_preferred` to `StepSpec` and pinned the perspective step to `qwen2.5:7b`;
    `jobs._resolve_step_model` honors `step.model_preferred` ahead of the family/config
    default. Measured: ~8s to a full rewrite (vs 170s+ timeout). The Draft Editor modal
    also now shows a clear message (instead of `{}`) when a finished job has no/empty
    result.
  - Frontend: `DraftEditorView` gained a "Rewrite Perspective" toolbar button + modal.
    It captures the textarea selection, lets the user pick Character / Third person /
    Narrator (character picker shows personas), runs `perspective_rewrite`, polls the
    job, and offers "Replace selection" / "Insert at start" which splice the result into
    the prose and trigger the normal autosave (no new save route needed). Character
    create/edit modal in `CharacterRosterView` gained a "Narrative Persona" field; a
    "Has persona" badge appears on the profile card.

- **2026-08-30 — Fix blank-screen crash in AI results + add "How to use skills" help.**
  - The `mdStyle` maps passed to `react-markdown`'s `components` prop in
    `AIPanel.jsx` and `SkillStudioView.jsx` were plain **strings**, not component
    functions. Rendering a result threw `Invalid tag: <className string>` — an
    uncaught render error that unmounted the whole React tree (blank screen) exactly
    when a skill produced output. Converted every entry to a small functional
    component; verified by Node render test (`[OLD] CRASH Invalid tag …`, `[NEW]
    OK`).
  - New shared `components/AiHelpModal.jsx` (7-step how-to + troubleshooting) opened
    from a 🛈 button in the AIPanel header and a "How to use" button in Skill Studio.
  - New `AppErrorBoundary` in `App.jsx` wraps `MainLayout`: any future render error
    shows a friendly card with the error message + Reload instead of a blank page.

- **2026-08-30 — AI pipeline end-to-end + frontend wiring fixes.**
  - `ai/config.py`: new `get_router_timeout_s()` (`OLLAMA_ROUTER_TIMEOUT_S`, default 20s).
  - `ai/router.py`: `_llm_route` call in `route_skill` is wrapped in `asyncio.wait_for`;
    on timeout it returns the keyword-fallback decision instead of hanging (Skill Studio
    stays responsive on slow models like qwen3.5:9b).
  - `ai/schemas.py`: `CustomSkillPayload` now accepts `routing_mode` (`auto|locked`) and
    `routing_sources` (manual chip list).
  - `ai/custom.py`: `create`/`update`/`duplicate` honor locked mode — when
    `routing_mode=="locked"` and `routing_sources` are given, save is instant (no router
    call) and the manual sources are persisted verbatim; otherwise the router (LLM or
    fallback) computes sources.
  - `ai/context.py`: fixed arity bug — all per-source builders (`overview`, `mechanics`,
    `timeline`, `gallery`) now use the uniform `(fm, story, params=None)` signature, so
    `build_context_from_sources` (custom-skill runs) no longer crashes with
    `TypeError`. Previously custom skills ran with `sources=["none"]` context.
  - Frontend: `components/AIPanel.jsx` rewritten (per-tab skill cards, running/queued
    state + stage + elapsed, enable/disable toggle that correctly uses the full skill id
    list, image picker for import skills, markdown results via react-markdown/remark-gfm —
    no Tailwind typography plugin installed).
  - Frontend: new `components/modules/SkillStudioView.jsx` (Phase 5) — custom skill
    CRUD, duplicate/delete, Context-Router preview with editable + lockable source chips,
    test-run (saves-then-runs) with inline poll result; built-ins shown read-only.
    `App.jsx` switch gained `case 'ai'` (previously fell through to Home — the visible
    breakage). `routing_mode`/`routing_sources` persisted through the Studio.
  - Verified end-to-end on `tales-of-sonnet`: locked create is ~70ms and skips the router;
    custom-skill job → poll → done → result citing real story content.

- **2026-08-29 — Standalone Quotes feature (independent of characters).**
  - New `Quote` schema (`schemas.py`): `id`, `text`, `note` (short context note),
    `tags: List[str]` (book / chapter / character / free-form).
  - New world file `quotes.json` (array) added to `ensure_story_structure` defaults;
    typed `get_quotes`/`save_quotes` in `file_manager.py`.
  - New routes `GET/POST /api/stories/{id}/quotes` in `main.py` (POST upserts the full array).
  - New standalone module `frontend/src/components/modules/QuotesView.jsx` (Quotes tab in the
    sidebar): quote cards with note + tag chips, search, add/edit modal with quick-add tag
    suggestions from characters and books. Registered in `App.jsx` (`'quotes'` case) and
    `Sidebar.jsx` `NAV_ITEMS`.
  - `DashboardView` now merges character quotes + standalone quotes in the **Memorable
    Quotes** section; standalone quotes show their note (if any) and tags.
  - First portrait image of a character is now auto-added to the character's `gallery` on
    save when the gallery is empty (`CharacterRosterView.handleSaveCharacter`).

- **2026-08-29 — Ollama AI transport (Phase 0).**
  - New `backend/app/ai/` package: `config.py` (env-driven settings), `ollama.py` (generic
    async client: typed `OllamaRequest`/`OllamaResponse`, capability detection via families +
    name heuristics with `OLLAMA_CAPABILITY_OVERRIDES` escape hatch, `health`/`list_models`/
    `complete`, `resolve_model` by needs/family/preference, 30s model cache), `io.py`
    (`prepare_images` resolves `/api/stories/<slug>/assets/<file>` refs → base64 with
    extension/size/count caps + traversal guard), `schemas.py` (`ModelInfo`, `AIStatus`),
    `prompts.py` (system preamble + `build_analysis_messages` skeleton).
  - New route `GET /api/ai/status` → `AIStatus` (available flag, models + capabilities,
    default/ocr/vision/router model ids, error hint). `running_jobs`/`queued_jobs` fixed
    at 0 until Phase 1.
  - `plans/ollama-ai-skills.md` is the design source of truth (phases 0–7, gated).

- **2026-08-29 — Ollama AI full backend (Phases 1, 2, 4, 5, 6).**
  - `ai/schemas.py` expanded: `PipelineSummary`, `AIConfig`, `RunInput`/`RunRequest`,
    `AIJob`, `AIResult`, `CustomSkillPayload`, `RoutingBlock`, `CustomSkill`,
    `RouterRequest`, `RouterDecision`.
  - `ai/pipelines.py`: full registry — 18 analysis + 3 import pipelines (`PipelineDef`,
    `StepSpec`).
  - `ai/prompts.py`: `SYSTEM_PREFIXES`, `TASKS` for all pipelines, `STAGE_LABELS`,
    `ROUTER_SYSTEM`, `step_messages` helper.
  - `ai/context.py`: 18 context builders + `SOURCE_BUILDERS` + `build_context_from_sources`
    with budget/drop logic and "sampled N" notes.
  - `ai/store.py`: `AiStore` — per-story `ai/{config.json,jobs/,results/}` persistence.
  - `ai/custom.py`: async custom skill CRUD + duplicate + auto-routing (`route_skill`).
  - `ai/router.py`: Context Router — LLM routing (format=json, temp=0, think=false) +
    keyword fallback; `route_skill` returns `RouterDecision` with `routed_by` badge.
  - `ai/jobs.py`: `JobManager` — per-story FIFO queue, one runner per story, cancel,
    `recover_interrupted` startup hook, per-step model resolution via story config
    overrides, image staging.
  - Routes in `main.py`: `POST /api/ai/run` (202), `GET/POST /api/ai/jobs/...`,
    `POST /api/ai/jobs/{id}/cancel`, `GET /api/ai/results/{id}/{pipeline}`,
    `GET/PUT /api/ai/config/{id}`, `GET /api/ai/pipelines?tab=`,
    `GET/POST/PUT/DELETE /api/ai/custom`, `POST /api/ai/custom/{id}/duplicate`,
    `POST /api/ai/custom/route` (dry-run).
  - Startup hook: `lifespan` calls `recover_interrupted`.
  - Offline handling: `POST /api/ai/run` → 503 when Ollama unreachable.
  - Verified: end-to-end run (story_overview → 3k markdown), queue/cancel, config,
    custom skill CRUD + router dry-run, OCR pipeline enqueue.
  - **Known latency**: qwen3.5:9b ~20s/completion on this hardware; router LLM-first
    design makes skill creation slow — use `OLLAMA_ROUTER_MODEL` for a faster model.

- **2026-08-29 — Character quotes + story-board showcase.**
  - `Character` gained `quotes: List[str]` (schema). `CharacterRosterView` has a new **Quotes**
    detail tab (between Notes and Timeline) to add / edit / delete memorable lines; the
    character save payload preserves `quotes` on create/edit.
  - `DashboardView` fetches all characters and shows a **Memorable Quotes** section (a grid
    of quote cards attributed to their speaker) on the story board/dashboard.

- **2026-08-29 — City/location images + character origin locations.**
  - **Cities & Locations** in the worldbuilding tab now support uploaded images: `City`
    gained `image_url` in the schema; the city form has an Upload/URL toggle with preview
    (reusing the shared `imageSourceMode`/`handleFileUpload`, which now routes to
    `cityForm.image_url` when the active section is `cities`); city cards show a hero
    image and gained an **Edit** button (city form opens pre-filled).
  - City images are surfaced in the unified image library (`get_image_library`) under
    `source: "city"` with category "Cities & Locations", so they're searchable in the
    Gallery tab (read-only, like character images). They are **not** added to
    `background_images` rotation.
  - **Characters** gained `location` (where a character is from) on the schema; the
    create/edit modal has a "Home / Origin Location" text field backed by a `<datalist>`
    of the story's existing city names; the location shows on roster cards and the
    profile header badge next to the role.

- **2026-08-29 — Home page + dedicated story dashboard with overview & fun-facts.**
  - New **Home** section (`HomeView`, activeTab `home`, default tab). It hosts the all-stories
    story gallery grid, tag filter, background-image manager, and "New Story" creation that
    previously lived on the dashboard. Opening a story from home navigates to its dashboard.
  - **Story Dashboard** (`DashboardView`) is now **dedicated to the active story** (no longer a
    gallery). It shows: a header with tags, a **Story Overview** editor (add/remove paragraphs —
    a `List[str]` mirroring character `notes`, persisted on `Story.overview`), a **Summary ·
    Fun Fact** card, and the story's aesthetic theme picker.
  - Backend: added `Story.overview: List[str]` to the schema and
    `FileManager.get_story_fun_facts(slug)` which gathers randomizable summary facts from live
    data (counts/spotlights for characters, factions, cities, artifacts, glossary, books,
    chapters, word count, and world mechanics). New route:
    `GET /api/stories/{id}/fun-facts` → `List[str]`. The dashboard fetches these and shuffles
    through them client-side.
  - `Sidebar.NAV_ITEMS` gained a `home` entry ahead of `dashboard`; `App.jsx` activeTab switch
    and default tab updated accordingly.

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