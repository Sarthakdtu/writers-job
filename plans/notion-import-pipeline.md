# Notion → LoreSmith Import Pipeline

> **STATUS: Implemented (Stages A–D).** See `backend/scripts/import_notion.py` (import) and
> `backend/app/ai/notion_enrich.py` (Stage C Ollama enrichment). This file is the design
> reference; deviations from the original design are noted inline.

## 1. Goal

Build a one-off **import script** that ingests a Notion Markdown export
(`~/Downloads/notion_export`) into LoreSmith's local filesystem data model
(`data/stories/<slug>/…`), using the **existing `FileManager` / `file_utils`**
helpers so we never write to disk directly. After the structural import, the
**existing Ollama AI layer** enriches the result by classifying prose vs. notes
and extracting entities (characters, locations, plot beats, tags).

## 2. What the export looks like (from sampling)

Notion exports to a Markdown folder. Observed structure:

- **Database index file** — e.g. `First Steps 2489….md`. It is *only* a list of
  `[Page Name](subpath/Page%20Name%20<id>.md)` links to the member pages. It
  carries no content itself.
- **Page files** — one `.md` per Notion page, named `Title <blockhash>.md`.
  Content is messy and heterogeneous:
  - finished/near-finished **prose** (e.g. `Dear Mr Mao`, the `GPT Chapter 1` file),
  - **outline / idea fragments** and planning notes mixed right into the prose
    (e.g. `Cricket Story`: *“the killer will say you didn’t deserve…”*),
  - **interleaved `CHAPTER n` markers** inside a single file
    (`Werewolves Of Baner, Pune …md` has `CHAPTER 1`, `CHAPTER 2`, `CHAPTER 3`
    inline), plus links to separate chapter child-pages.
  - many pages are just short idea seeds (`The Tragic Love Story` = 2 sentences).
- **Nested sub-folders** — some pages have child pages. `Werewolves Of Baner,
  Pune/` contains real chapter files (`GPT Chapter 1 …md`,
  `CHAPTER 2 — The Apartment That Never Was …md`) containing finished prose.

Key takeaways:
1. The Notion export is **flat-ish and inconsistent**: no structured metadata
   (no tags, no separate character/notes fields, no reliable order markers).
2. Chapter boundaries must be **derived** (inline `CHAPTER n` markers AND nested
   child-page files), not assumed from file name alone.
3. There is no clean prose-vs-outline split in the source — that has to be
   decided by the AI layer.

## 3. Mapping decisions (agreed)

| Notion thing | LoreSmith target |
|---|---|
| Each Notion **page** (leaf `.md`) | One `Story` |
| Inline `CHAPTER n` markers + nested chapter child-pages | `Chapter`s inside a single default `Book` per story |
| Prose paragraphs | Chapter prose (`.md`) |
| Outline/note fragments | `Story.overview` + `Plot.notes` after AI classification |
| Extracted entities | `Character`, `City`, `Faction`, `PlotBeat`, `tags` (via Ollama) |

Rationale: “Each Notion page = a Story” keeps imports granular and matches how
LoreSmith organizes per-story data, while still letting a multi-chapter page
like Werewolves become a proper Story → Book → Chapters tree.

## 4. Pipeline stages

### Stage A — Discover & build a file inventory (no writes)
- Walk `~/Downloads/notion_export` recursively.
- Classify each file:
  - **index** (only a list of `[label](relative-path)` links, no real body) →
    record it, but do **not** import as a story (it’s a database container).
  - **page** → candidate story; track whether it has nested child-pages.
- Build an in-memory tree: `story` → ordered `chapter` list by resolving both
  inline `CHAPTER n` markers and the child-page links inside the parent file.
- Produce a **dry-run report** (counts + per-story breakdown) for review before
  any disk writes.

### Stage B — Structural import (via FileManager helpers)
For each candidate page, using `FileManager`:
- Compute a slug from the page title
  (`title.toLowerCase().replace(/[^a-z0-9]+/g, '-')`).
- `ensure_story_structure(slug)`, then `save_story(Story(...))` with the page
  title and (optionally) the raw preamble as `overview`.
- Create one default `Book` (`save_book`) — ordering `1`.
- Split the page body into chapters:
  - regex on inline markers (`/^\s*(?:chapter|ch\.?)\s*([0-9ivx]+)/i`) and
    child-page boundaries;
  - for each chapter: `save_chapter` (+ auto `word_count`) then
    `save_chapter_prose` with the raw Markdown text.
- Idempotency: skip or overwrite stories whose slug already exists (configurable
  `--overwrite` flag), to make the script safe to re-run.

### Stage C — AI enrichment (via existing Ollama layer)
- Route each story’s text through the **existing** `CustomSkill`/router machinery
  (`backend/app/ai/custom.py::route_skill` + `context.py` builders) rather than
  calling Ollama directly from the script.
- Define one or two import/skill definitions (reuse the pattern of the 3 existing
  import pipelines in `pipelines.py`) that:
  1. **Classify lines** → `prose` vs `note/outline`.
  2. **Extract** structured JSON: characters (name, role, bio), locations/cities,
     factions, plot beats, and suggested `tags`.
- Persist the extracted entities through the normal FileManager writers:
  `save_character`, `save_world_section('cities'|'factions'|'glossary')`,
  `save_plot`, and set `Story.tags` via `save_story`.
- Notes/outline fragments become `Story.overview[]` and/or `Plot.notes`, keeping
  chapter `.md` files clean of planning text.

### Stage D — Report
- Emit a final summary: stories created/skipped, chapters, entities extracted,
  and any pages flagged for manual review (e.g. short seeds or ambiguous
  prose/outline splits) so the user can fix things by hand in the app.

## 5. Where the script lives

- A standalone `backend/scripts/import_notion.py` run from the terminal
  (`PYTHONPATH=backend .venv/bin/python scripts/import_notion.py --dir ~/Downloads/notion_export [--enrich]`).
- It imports `FileManager` and reuses `file_utils` — no new REST routes needed.
- Enrichment lives in `backend/app/ai/notion_enrich.py` and reuses the existing `ai/`
  transport (`OllamaClient`, `resolve_model`, `cached_models`, `app.ai.prompts`) rather than
  duplicating logic. It is invoked by the script's `--enrich` flag.

## 6. Open questions / sensible defaults
- **`--overwrite` behavior:** default to skip existing stories; offer `--force`.
- **Short idea-seed pages** (1–3 sentences): still import as stories with the
  text in `overview` only, and flag them in the report for the user to expand or
  delete — do not silently drop user content.
- **Inline CHAPTER markers vs nested files:** when both exist for the same story
  (e.g. Werewolves), prefer the **nested child-page files** as authoritative
  chapter prose and keep the parent’s inline chapters only if no child file
  exists for that number (avoids double-importing the same chapter).
- **Tagging:** derive a default tag from the parent database name (e.g.
  `First Steps`), plus LLM-suggested free-form tags.

## 7. Verification (no automated suite exists)
- Run Stage A against the real export and inspect the dry-run report.
- Run Stage B + C into a scratch `DATA_DIR` (e.g. `DATA_DIR=/tmp/loresmith-import-test`)
  so nothing pollutes real data during testing.
- Boot backend + frontend, open a few imported stories, and confirm chapters,
  characters, and cities appear; run `npm run lint` / `npm run build` if any
  frontend change is ever introduced (the script is backend-only, so usually N/A).
