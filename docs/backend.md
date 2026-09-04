# Backend Architecture

## `file_utils.py` — atomic + thread-safe I/O primitives

Lowest layer. All higher-level file operations must go through these helpers:

- `read_json_safe(path, default)` — returns `default` if missing/parse fails.
- `write_json_safe(path, data, indent=2)` — atomic temp-file + `fsync` + `os.replace`.
- `read_text_safe(path, default="")` / `write_text_safe(path, content)` — same for text.
- `delete_file_safe(path)`.

**Convention:** These use a global dict of per-path `threading.Lock` objects
(`get_file_lock`) so concurrent saves on the same file don't corrupt it. **Do not write
to data files directly with `open()`** — always use these helpers.

## `file_manager.py` — `FileManager` class

Single class instantiated once in `main.py` (`file_manager = FileManager()`). All CRUD
logic lives here, organized by feature (stories, assets, characters, world, books/plot/
arcs, chapters/prose). Key behaviors to maintain:

- `ensure_story_structure(slug)` creates the per-story dirs + default world files
  (including the `gallery.json` default `[]`, and the `mechanics.json` default array
  with one `WorldMechanics` entry).
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
  `books/book-<book_id>/chapters/ch-<id>.md` and re-derives `word_count`. When the payload
  does not supply `order`, it assigns `max(existing order) + 1`.
- `list_chapters(..., reverse=False)` returns chapters sorted by `order` (with
  numeric-id tiebreak) — the order users set via drag-and-drop in the Book Outliner tree
  view. Passing `reverse=True` returns the descending order (driven by `?sort=desc`).
- `get_character_appearances` does a **live filesystem scan** across books, plot beats,
  character arcs, and chapters to compute a character's books/chapters/plot-points.
- `get_character_map(slug)` derives a **CharacterMap** live: every plot beat listing 2+
  characters contributes one interaction between each pair (carrying the book and the
  beat's chapter when `beat.chapter_id` resolves). Edge `weight` = number of shared beats;
  `degree` per node = number of distinct bonds. Declared `CharacterRelationship`s are
  merged in as edges (weight ≥ 1, carrying the `relationship_label`). Single source for
  the Character Map view.
- `find_replace_across_chapters(slug, payload)` — cross-chapter **Find & Replace** across
  every chapter `.md` file in the story. Supports case sensitivity and whole-word matching,
  returns matched contexts (chapter id, book id, surrounding text) so the frontend can
  preview, and performs the replace atomically (rewriting each matched chapter's `.md` via
  `write_text_safe` and re-deriving its word count).
- `get_writing_stats(slug)` derives **WritingStats** live from the filesystem modification
  times of every chapter's `.md` file (no persistent model): groups each chapter's current
  `word_count` by the calendar day it was last edited, computes current/longest streaks
  (90-day backward scan), total writing days, and a 14-day `recent_activity` list. Used by
  the dashboard's "Writing Progress" card.

## `main.py` — FastAPI routes

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
- **Chapters:** `GET/POST .../books/{book_id}/chapters` (`GET` accepts optional
  `?sort=asc|desc`, default `asc`, controlling chapter display order),
  `GET/PUT/DELETE .../chapters/{ch_id}`,
  `POST .../books/{book_id}/chapters/reorder` (body `{chapter_ids: []}` — writes 1-based
  `order` back to each chapter for the drag-and-drop reorder feature),
  `GET .../chapters/{ch_id}/content` (alias `/prose`),
  `PUT/POST .../chapters/{ch_id}/content` (alias `/prose`),
  `POST .../books/{book_id}/chapters/from-ai` (body
  `SaveAIDraftPayload {title, content, scene_breakdown, pov_character_id}` — creates a new
  chapter with the given prose, used by the AI "Draft Chapter from Breakdown" result's
  "Save as chapter" action),
  `GET .../chapters/{ch_id}/art-suggestions` (returns `{chapter_id, character_id,
  location, images[]}` — auto-detects the POV character's portrait + region city image for the
  one-click "Generate Cover Art" inline buttons; `character_id`/`location`/`images` may be
  null/empty when no POV or no matching images exist)
- **Find & Replace:** `POST /api/stories/{id}/find-replace` (body
  `{find, replace, case_sensitive, whole_word, dry_run}`) → `{ count, replacements[] }`
  (each with `book_id`, `chapter_id`, `context`). Runs on every chapter `.md` in the story.
