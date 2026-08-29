# CHANGELOG — codebase knowledge updates

Every time you change functionality, add a dated entry here summarizing what changed and
update the relevant section(s) in AGENTS.md.

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