# LoreSmith — Deep Architecture Reference

Supplementary reference to `AGENTS.md`. This file gives a model the "how it actually
works" level of detail for each module so it can make correct, convention-aligned
changes without re-reading every source file. **`AGENTS.md` remains the authoritative
conventions/contract doc — keep both in sync when behavior changes.**

---

## 1. Data flow overview

```
React component (useStory/useTheme)
        │  fetch('/api/...') via Vite dev proxy (port 3000 → 8000)
        ▼
FastAPI route (backend/app/main.py)
        │  calls FileManager method
        ▼
FileManager (backend/app/file_manager.py) — one instance, module-level `file_manager`
        │  uses file_utils helpers (per-path locks + atomic os.replace)
        ▼
data/stories/<slug>/....json | .md   (git-ignored)
```

Every write is **atomic** (write temp file → fsync → `os.replace`) and **lock-protected**
(one `threading.Lock` per canonical path via `get_file_lock`). Always use
`read_*_safe` / `write_*_safe` / `delete_file_safe` — never raw `open()` on data files.

---

## 2. Backend module internals

### 2.1 `file_utils.py`
- Module-level `_file_locks: Dict[str, threading.Lock]` + `_lock_mgr_lock` guard.
- `get_file_lock(path)` → resolves canonical absolute path, returns existing/creates lock.
- `write_json_safe` / `write_text_safe` write to `path.with_name(f"{name}.tmp.{uuid}")`,
  `fsync`, then `os.replace` onto the target (atomic on same filesystem). Cleans up temp
  file on failure.
- `read_json_safe` returns `default` when the file is missing or unparsable (never
  raises). `delete_file_safe` is idempotent (missing file → `True`).

### 2.2 `file_manager.py` (`FileManager`)
Constructor resolves `base_data_dir` from `DATA_DIR` env (default `data/stories`),
`mkdir(parents=True)`.

Directory helpers:
- `get_story_dir(slug)` → `<base>/<slug>`
- `get_book_dir(slug, book_id)` → `<base>/<slug>/books/book-<book_id>`

Structure builders (call these before writing into a subtree):
- `ensure_story_structure(slug)` → creates `characters/`, `assets/`, `world/`,
  `books/` and default world files if missing (`cities/factions/artifacts/glossary/
  gallery` → `[]`, **`mechanics` → object**).
- `ensure_book_structure(slug, book_id)` → `chapters/` + default `plot.json`
  (`{beats:[],theme:""}`) and `character_arcs.json` (`[]`).

Per-feature method groups (all either read `read_json_safe`/`read_text_safe` or write
`write_*_safe`):
- **Stories:** `save/get/list/delete_story`. `delete_story` uses `shutil.rmtree`.
- **Assets:** `save_asset(slug, bytes, filename)` writes into `assets/` with
  `uuid4().hex[:10]` + original suffix; returns `/api/stories/{slug}/assets/{name}`.
  `get_asset_path` locates the file (route serves it via `FileResponse`).
- **Characters:** one JSON file per character (`characters/<id>.json`).
  `get_character_appearances` is a **live scan** (§4 below). `list_characters` globs
  `*.json` and wraps in `Character`, tolerating parse errors.
- **World:** generic `get_world_section`/`save_world_section` read/write any
  `world/<section>.json` (default `{}` for `mechanics`, `[]` otherwise). Plus typed
  accessors for cities/factions/artifacts/glossary (cast lists to models).
- **Books/Plot/Arcs:** `save/get/list/delete_book`; `get/save_plot`;
  `get/save_character_arcs`. Books sorted by `.order`. `delete_book` = `rmtree`.
- **Chapters:** two files, `chapters/ch-<id>.json` + `chapters/ch-<id>.md`.
  - `save_chapter` writes `markdown_file_path`, seeds the `.md` with a title header
    **if the md file doesn't already exist**, and re-derives `word_count` from the md
    via `len(re.findall(r'\b\w+\b', prose))`.
  - `save_chapter_prose` writes the `.md`, re-derives `word_count`, then re-writes the
    `.json` with the new count.
  - `delete_chapter` deletes **both** files and returns `ok1 and ok2`.

### 2.3 `main.py` (routes)
- Instantiates `file_manager = FileManager()` once at import.
- Module-level `_backup_status` dict (in-memory).
- Every route is thin: validates id → calls `file_manager` → returns the Pydantic model
  (via `response_model`) or JSON, raising `HTTPException(404/400/500)` on failure.
- Story `PUT`/char `PUT`/book `PUT`/chapter `PUT` force `id = <path id>` if mismatched.
- Plot (PUT+POST) and arcs (PUT+POST) are registered with two decorators each.
- Chapter content has aliases `/content` and `/prose` (GET read, PUT/POST write).
- Backup endpoint walks all story dirs counting non-`.tmp` files, sets
  `_backup_status["status"]="syncing"` → `"in_sync"` (or `"error"`), and returns a JSON
  summary. It does **not** do real Drive writes today.

### 2.4 Schemas notes
- All models inherit `pydantic.BaseModel`.
- Optional-with-default fields use `Optional[str] = ""` (str) or `Optional[int] = 0` —
  not `None`, for text fields; `None` is used only where absence is meaningful
  (e.g. `google_doc_url`, `pov_character_id`).
- List fields use `Field(default_factory=list)`.
- `Story.theme` `Literal["sepia","midnight","paper"]` (note: "paper" vs frontend
  "typewriter" — see AGENTS.md §10).

---

## 3. Frontend module internals

### 3.1 Contexts
- `StoryContext` holds all cross-cutting state. `fetchStories` runs on mount; resolves
  `activeStory` from `localStorage['writer_job_active_story_id']` or `data[0]`.
  Hotkeys registered in a `useEffect`.
- `ThemeContext` default `sepia`; sets `document.documentElement.dataset.theme` and
  `localStorage['writer_theme']`.

### 3.2 View behaviors (what each does, so refactors stay correct)
- **DashboardView:** lists stories filtered by `selectedTag`; per-card background URL
  editor and tag add/remove. Non-active stories updated via direct `PUT
  /api/stories/{id}` with `{...target, field}`; active story via
  `updateActiveStory({...})` (which PUTs under the hood).
- **WorldbuildingView:** `activeSection` state drives which `world/<section>` is fetched
  and which form/modal renders. `mechanics` renders an **object** form; all other
  sections array-card grids. `saveSectionData` PUTs the whole array/object.
  `syncArtifactCharacters` (duplicated in CharacterRosterView) updates each affected
  character's `artifact_ids` via POST `/characters`. Gallery/artifact images upload to
  `/assets/upload`.
- **CharacterRosterView:** left roster list + right detail pane. **Characters are
  upserted with POST** (`handleSaveCharacter`, `persistCharacter`,
  `handleAddTimelineEvent`). Supports gallery upload, primary-image switching, notes
  (falls back to legacy `bio`), timeline events, artifact attach/detach (via
  `saveArtifactData` + `syncArtifactCharacters`), and the appearances matrix
  (`GET .../characters/{id}/appearances`). `editingArtifact=null` is passed to
  `ArtifactFormModal` for the create path.
- **BookOutlinerView:** books/chapters/plot/arcs/characters fetched together; four
  sub-tabs (tree/beats/arcs/pov). Book via POST `/books`, chapter via POST `/chapters`,
  plot via POST `/plot`, arcs via POST `/arcs`. Computes POV distribution from chapter
  `pov_character_id` and per-chapter `word_count`.
- **DraftEditorView:** buys books → chapters; loads metadata + prose (`/content`).
  Markdown mode = split editor/preview with 1000ms debounced autosave PUT
  (`{ content }`) and `saveState`. Google Docs mode = iframe
  `https://docs.google.com/document/d/<id>/edit?embedded=true`; doc id saved via
  chapter PUT. Formatting buttons use `insertFormatting` on the textarea selection.
- **QuickSearchModal:** 200ms-debounced search across stories (in-memory), characters,
  cities, books, chapters (fetched per active story). Results set `activeTab` on click.
- **Navbar:** story selector, new-story modal (slug from title), tag filter, theme
  dropdown, Drive backup button (opens `GoogleDriveModal`), focus-mode toggle. Creates
  stories via `createStory`.
- **Sidebar:** `NAV_ITEMS` list → `setActiveTab`. Collapsible width `w-64` / `w-16`.
- **AmbientBackground:** cross-fades `background_url || background_path` behind content.
- **ArtifactFormModal:** shared create/edit artifact form. Props:
  `storyId`, `characters`, `initialArtifact`, `defaultBelongsTo`, `submitLabel`,
  `onClose`, `onSubmit`. Converts `timeline[].book_ids` to/from comma-separated string
  in the form. Image upload to `/assets/upload`.

### 3.3 Registering a new view (checklist)
1. Create `frontend/src/components/modules/<Name>View.jsx` exporting `export const`.
2. Add a case in the `renderActiveModule` switch in `App.jsx`.
3. Add an entry to `NAV_ITEMS` in `Sidebar.jsx` (`id`, `label`, `icon`, `desc`).
4. Use theme CSS variables + `useStory()`/`useTheme()`.
5. Add any new backend route to `main.py`, logic to `FileManager`, model to `schemas.py`.

---

## 4. Appearances matrix algorithm (`get_character_appearances`)

Given `story_slug` + `char_id`:
1. Load the character; gather `linked_plot_point_ids = set(character.plot_point_ids)` and
   `linked_book_ids` from every `timeline_event.book_ids`.
2. For each book in the story:
   - If `book.id in linked_book_ids` → add book to `found_books`.
   - For each plot beat: if `char_id in beat.character_ids` **or** `beat.id in
     linked_plot_point_ids` → add plot point + book.
   - If any `character_arc.character_id == char_id` → add book.
   - For each chapter: `is_pov = ch.pov_character_id == char_id`; a chapter counts as a
     match if `is_pov` **or** `char_id` appears in the `scene_breakdown` string; if so,
     add chapter (with `is_pov`) + book.
3. Return `CharacterAppearances` with deduped books/chapters/plot_points.

---

## 5. Storage/auth edge cases to respect
- `data/` is git-ignored — do not commit story content.
- `client_secret.json` (Google OAuth) must never be committed; the app degrades to a
  "local developer mode" auth_message when absent.
- Because `_backup_status` is in-memory, a backend restart resets backup state; real
  status is only surfaced inside `GoogleDriveModal`, not the Navbar badge.

---

## 6. Keeping docs in sync (tooling)
- `AGENTS.md` is loaded by agents automatically; keep §3 (schemas), §4.3 (routes),
  §6 (frontend↔backend contract), and the CHANGELOG-current.
- `docs/ARCHITECTURE.md` holds deep internals; update when a module's internal behavior
  changes meaningfully (algorithm changes, new feature flow, new context/state).
- The `# CHANGELOG` in `AGENTS.md` is the place to record a dated one-line summary of
  every functional change.
