# Data Model & Storage Layout

## Pydantic schemas (`backend/app/schemas.py`)

All request/response bodies are typed with Pydantic v2 models. The core entities:

- **`Story`** — `id` (slug), `title`, `tags[]`, `background_url`,
  `banner_url` (user-set dashboard banner image uploaded via the Story Dashboard title card,
  kept separate from `background_url`/`background_images` so `sync_story_backgrounds` never
  overwrites it),
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
  `artifact_ids[]`, `mechanic_ids[]` (world mechanics/powers linked to this character —
  e.g. a magic system or tech the character uses; a character can be linked to multiple
  mechanics), `timeline_events[]` (`TimelineEvent`: `year_or_era`, `title`,
  `description`, `book_ids[]`), `plot_point_ids[]`,
  `relationships[]` (`CharacterRelationship`: `character_id` + free-text `label` like
  sibling/rival/mentor — explicitly declared connections shown/merged in the Character Map).
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
- **`Chapter`** — `id`, `title`, `order` (int, 1-based reading order — set by the
  drag-and-drop reorder feature; defaulted to `max(existing)+1` on save when omitted),
  `pov_character_id`, `scene_breakdown`, `markdown_file_path`,
  `word_count`, `target_word_count` (optional per-chapter pacing target; shown as a progress
  bar on the Book Outliner chapter card), `google_doc_id`, `image_url` (optional generated
  chapter illustration, set by the `chapter_art` AI skill).
- **`Plot`** — `beats[]` (`PlotBeat`: `id`, `title`, `description`, `chapter_id`,
  `character_ids[]`), `theme`.
- **`CharacterArc`** — `character_id`, `arc_summary`, `starting_state`, `ending_state`,
  `key_milestones[]`.
- **Appearances output (`CharacterAppearances`)** — `books[]`, `chapters[]`
  (`AppearanceChapter` has `is_pov`), `plot_points[]`.
- **Character Map output (`CharacterMap`)** — `nodes[]` (`CharacterMapNode`: `id`,
  `name`, `image_url`, `role`, `degree`) + `edges[]` (`CharacterMapEdge`: `id`
  `source--target`, `weight`, `interactions[]`, `relationship_label` — optional, set from
  a declared `CharacterRelationship`). Each `CharacterMapInteraction` is one
  shared plot beat (`book_id`/`book_title`, beat `title`/`description`, optional
  `chapter` as `CharacterMapChapter`). **Derived live** from plot-beat co-occurrence —
  nothing is stored. Edges for explicitly declared character relationships are merged in
  with `weight` ≥ 1 and carry the `relationship_label`.
- **Writing stats output (`WritingStats`)** — `total_words`, `total_chapters`,
  `current_streak`, `longest_streak`, `today_words`, `today_chapters`,
  `writing_days_total`, `last_active` (ISO or None), `recent_activity[]` (`WritingStatsDay`:
  `date` `YYYY-MM-DD`, `words`, `chapters`). **Derived live** from chapter `.md` file
  modification times (no persistent model); each chapter's current `word_count` is
  attributed to the calendar day it was last edited.

## On-disk JSON structure

Every story lives at `data/stories/<story-slug>/`:

```
<story-slug>/
├── story.json                      # The Story object
├── assets/                         # Uploaded images (uuid-prefixed filenames)
├── characters/
│   └── <char-id>.json              # One Character per file
├── world/
│   ├── cities.json                 # [] of City
│   ├── mechanics.json              # [] of WorldMechanics (a world can have several)
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

### Gotchas to preserve

- `mechanics.json` is an **array** of `WorldMechanics` (a world can have several mechanics
  systems). Each entry has `id`, `name`, `magic_system`, `technology_level`, `global_rules`.
  `get_world_mechanics` auto-migrates a legacy single-object file into a 1-element list and
  backfills `id`/`name` from `magic_system`/`technology_level` when missing. `get_world_section`
  now always defaults to `[]` (no object special-case).
- A chapter is stored as **two files** (`.json` metadata + `.md` content) with the same
  `ch-<id>` base name. Deleting/editing a chapter must touch both.
- `word_count` on a chapter is **derived** from the `.md` file whenever the chapter is
  saved (`file_manager.save_chapter`) or prose is saved (`save_chapter_prose`).
