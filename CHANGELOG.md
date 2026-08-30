# CHANGELOG — codebase knowledge updates

Every time you change functionality, add a dated entry here summarizing what changed and
update the relevant section(s) in AGENTS.md.

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