# Dashboard Insights — Design Plan

> Goal: Surface actionable, data-driven insights on the per-story dashboard that help
> writers understand their productivity, story depth, narrative health, and creative
> patterns — all derived live from existing data (no new persistent storage required).

---

## 1. Insight Categories

### Category 1: Productivity & Writing Momentum

| # | Insight | Data Source | What It Tells You |
|---|---------|-------------|-------------------|
| P1 | **Word Count vs. Target** | `Book.target_word_count` vs sum of chapter `word_count` per book | % complete per book — "Book 1: 47,200 / 80,000 words (59%)" |
| P2 | **Writing Velocity** | `WritingStats.recent_activity` (14-day window) | Average words/day over last 7 and 14 days, with trend arrow (up/down/steady) |
| P3 | **Chapter Completion Rate** | Chapters with `word_count > 0` vs total chapters | "12 of 20 chapters drafted" |
| P4 | **Days Since Last Session** | `WritingStats.last_active` | Motivational nudge: "You last wrote 3 days ago" |
| P5 | **Longest Silent Gap** | `WritingStats.recent_activity` | Largest gap between writing days in the 90-day window |
| P6 | **Session Consistency Score** | `WritingStats.writing_days_total` / 90 | Percentage of days with writing activity |

### Category 2: Story Comprehension & Depth

| # | Insight | Data Source | What It Tells You |
|---|---------|-------------|-------------------|
| C1 | **Character-to-World Ratio** | Character count vs (cities + factions) | "5 characters spread across 2 cities and 3 factions" — detects thin worlds |
| C2 | **Orphaned Characters** | Characters with 0 plot points, 0 timeline events, 0 artifact links | Characters not connected to anything — prompts integration |
| C3 | **POV Balance** | `Chapter.pov_character_id` distribution | Which characters get the most POV time — detects imbalance |
| C4 | **Faction Coverage** | Factions with no linked characters | Under-developed factions |
| C5 | **Artifact Ownership Web** | `Artifact.belongs_to[]` cross-referenced with characters | Who holds what — spotlights unowned artifacts or overloaded characters |
| C6 | **Glossary Category Spread** | `GlossaryTerm.category` distribution | "Magic: 12 terms, Culture: 3 terms" — shows where worldbuilding is thin |
| C7 | **World Rules Coverage** | `WorldMechanics.global_rules[]` count + `magic_system` + `technology_level` richness | Quick health check of the magic/tech system |
| C8 | **Timeline Density** | Characters with timeline events vs without | How many characters have backstory history defined |
| C9 | **City Richness** | Average `key_locations[]` per city | Cities with 0-1 key locations are under-developed |

### Category 3: Plot & Narrative Coherence

| # | Insight | Data Source | What It Tells You |
|---|---------|-------------|-------------------|
| N1 | **Beat-to-Chapter Coverage** | `PlotBeat.chapter_id` (set vs unset) | "8 of 15 beats are linked to a chapter" — prompts drafting |
| N2 | **Beats Without Characters** | `PlotBeat.character_ids` empty | Beats with no character assigned — narrative gaps |
| N3 | **Character Arc Completeness** | `CharacterArc.key_milestones[]` count per arc | Arcs with 0-1 milestones vs richly developed ones |
| N4 | **Arc Transformation Summary** | `CharacterArc.starting_state` → `ending_state` | Quick view of all arcs: who changes and how |
| N5 | **Plot Density Per Book** | Beat count / chapter count per book | Books with too many beats per chapter (rushed) or too few (sparse) |
| N6 | **Cross-Book Character Presence** | Characters appearing in multiple books via `CharacterAppearances` | Who carries across books vs who's single-book |
| N7 | **Unused Subsections** | `Book.plot_subsections[]` with no linked beats | Plot structure slots that haven't been filled |

### Category 4: Creative & Qualitative

| # | Insight | Data Source | What It Tells You |
|---|---------|-------------|-------------------|
| Q1 | **Quote Richness** | Character `quotes[]` count + standalone `Quote` count | "47 memorable quotes across 8 characters" |
| Q2 | **Most Quoted Character** | Max(`Character.quotes[]` length) | Who has the most memorable lines |
| Q3 | **Gallery Health** | `GalleryItem` count + `category` distribution | Visual concept coverage — "Characters: 12, Locations: 3" |
| Q4 | **Tag Diversity** | `Story.tags[]` + Quote `tags[]` frequency | Most used tags across quotes — reveals themes |
| Q5 | **Naming Patterns** | Character/City/Faction name lengths, initial letters | Fun linguistic insight: "Most characters have names starting with A-C" |

### Category 5: Cross-Entity Relationship Health

| # | Insight | Data Source | What It Tells You |
|---|---------|-------------|-------------------|
| R1 | **Relationship Density** | `CharacterMap.edge count` / possible edges | How interconnected the cast is (0 = isolated, 1 = fully connected) |
| R2 | **Most Connected Character** | `CharacterMap.nodes` with max `degree` | The hub character — "Elara connects to 7 others" |
| R3 | **Isolated Characters** | `CharacterMap.nodes` with `degree = 0` | Characters with zero plot-beat connections |
| R4 | **Strongest Bond** | `CharacterMap.edges` with max `weight` | The pair most frequently in the same scenes |
| R5 | **World Entity Count Summary** | Total entities across all types | Big-picture: "8 characters, 4 cities, 3 factions, 12 artifacts, 25 glossary terms" |

---

## 2. Backend Implementation

### New endpoint: `GET /api/stories/{id}/insights`

Returns a structured `StoryInsights` Pydantic model. All values are **derived live**
from the filesystem (same pattern as `get_writing_stats` and `get_character_map`).

```python
# backend/app/schemas.py — new models

class ProductivityInsights(BaseModel):
    books_progress: List[dict]       # [{book_id, title, target, actual, percent}]
    velocity_7d: float               # avg words/day last 7 days
    velocity_14d: float              # avg words/day last 14 days
    velocity_trend: str              # "up" | "down" | "steady" | "new"
    chapters_completed: int          # chapters with word_count > 0
    chapters_total: int
    days_since_last_session: Optional[int]
    longest_silent_gap: Optional[int]
    consistency_score: float         # 0-100

class ComprehensionInsights(BaseModel):
    character_count: int
    city_count: int
    faction_count: int
    character_to_world_ratio: str    # human-readable
    orphaned_characters: List[dict]  # [{id, name}]
    pov_distribution: List[dict]     # [{character_id, name, count}]
    faction_coverage: List[dict]     # [{id, name, linked_characters: int}]
    artifact_ownership: List[dict]   # [{id, name, owners: List[str], unowned: bool}]
    glossary_spread: List[dict]      # [{category, count}]
    world_rules_count: int
    has_magic_system: bool
    has_tech_level: bool
    characters_with_timeline: int
    characters_without_timeline: int
    avg_key_locations_per_city: float
    underdeveloped_cities: List[dict]  # [{id, name, key_locations_count}]

class NarrativeInsights(BaseModel):
    total_beats: int
    beats_with_chapter: int
    beats_without_characters: int
    arc_count: int
    arcs_with_milestones: int
    arcs_without_milestones: List[dict]  # [{character_id, name}]
    arc_summaries: List[dict]            # [{character_id, name, from, to}]
    plot_density_per_book: List[dict]    # [{book_id, title, beats_per_chapter: float}]
    cross_book_characters: List[dict]    # [{character_id, name, book_count: int, books: List[str]}]
    unused_subsections: List[dict]       # [{book_id, book_title, subsection_title}]

class CreativeInsights(BaseModel):
    total_quotes: int
    character_quotes_count: int
    standalone_quotes_count: int
    most_quoted_character: Optional[dict]  # {id, name, count}
    gallery_total: int
    gallery_by_category: List[dict]   # [{category, count}]
    top_tags: List[dict]              # [{tag, count}]
    naming_initials: List[dict]       # [{letter, count}] across characters+cities+factions

class RelationshipInsights(BaseModel):
    total_nodes: int
    total_edges: int
    relationship_density: float       # 0-1
    most_connected: Optional[dict]    # {id, name, degree}
    isolated_characters: List[dict]   # [{id, name}]
    strongest_bond: Optional[dict]    # {source, target, weight}
    world_entity_summary: dict        # {characters, cities, factions, artifacts, glossary, total}

class StoryInsights(BaseModel):
    productivity: ProductivityInsights
    comprehension: ComprehensionInsights
    narrative: NarrativeInsights
    creative: CreativeInsights
    relationships: RelationshipInsights
    generated_at: str                 # ISO timestamp
```

### Method: `FileManager.get_story_insights(story_slug)`

Location: `backend/app/file_manager.py`

This method:
1. Loads all story data (characters, books, chapters, world sections, plots, arcs).
2. Reuses existing helpers (`get_character_map`, `get_writing_stats`) where applicable.
3. Computes each sub-section.
4. Returns a `StoryInsights` instance.

Estimated complexity: ~150-200 lines in `file_manager.py`. Mostly aggregation over
already-loaded data. No external calls, no new storage.

### Route in `main.py`

```python
@app.get("/api/stories/{story_id}/insights", response_model=StoryInsights)
async def get_story_insights(story_id: str):
    return file_manager.get_story_insights(story_id)
```

---

## 3. Frontend Implementation

### New section in `DashboardView.jsx`

Insert a **"Story Insights"** section between Writing Progress and Overview.

**Layout:**
- A **"Story Health Score"** banner at the top: a single 0-100 number with a
  semi-circle gauge. Weighted average of:
  - Word count progress toward targets (25%)
  - Character connectivity / relationship density (20%)
  - Plot beat coverage (20%)
  - World depth (cities + factions + glossary richness) (15%)
  - Narrative completeness (arcs, POV coverage) (10%)
  - Creative richness (quotes, gallery) (10%)

- **Five accordion/tab sections**, each a collapsible card with:
  - Header: category icon + label + expand chevron
  - Body: grid of compact stat cards

- **Each stat card** shows:
  - Lucide icon (relevant to the metric)
  - Label text
  - Primary value (number or percentage)
  - Optional secondary text (e.g., "3 orphaned characters")
  - Optional progress bar (for P1 word count targets)
  - Optional trend badge (for P2 velocity)

**Icons mapping:**
| Category | Icon |
|----------|------|
| Productivity | `TrendingUp` |
| Comprehension | `Brain` |
| Narrative | `BookOpen` |
| Creative | `Sparkles` |
| Relationships | `GitBranch` |

**Interaction:**
- Clicking an insight card with a list of items (orphaned characters, underdeveloped
  cities, etc.) opens a **detail modal** listing the items with links to navigate
  to them.
- A **refresh button** re-fetches the insights endpoint.

### Phase 3 (Optional): Health Score History

Store a lightweight `insights_history.json` in the story dir:
```json
[
  { "date": "2026-09-01", "score": 42 },
  { "date": "2026-09-08", "score": 51 }
]
```
Render a small sparkline in the health score banner showing score over time.

---

## 4. Implementation Order

1. **Schemas** — Add all new Pydantic models to `schemas.py`
2. **FileManager** — Implement `get_story_insights()` in `file_manager.py`
3. **Route** — Add `GET /api/stories/{id}/insights` in `main.py`
4. **Frontend** — Add insights section to `DashboardView.jsx`
5. **Detail modals** — Click-through for list-based insights
6. **Health score history** — Optional time-series tracking

---

## 5. Files to Modify

| File | Change |
|------|--------|
| `backend/app/schemas.py` | Add `ProductivityInsights`, `ComprehensionInsights`, `NarrativeInsights`, `CreativeInsights`, `RelationshipInsights`, `StoryInsights` |
| `backend/app/file_manager.py` | Add `get_story_insights(story_slug)` method (~150-200 lines) |
| `backend/app/main.py` | Add `GET /api/stories/{story_id}/insights` route |
| `frontend/src/components/modules/DashboardView.jsx` | Add insights section with health score + 5 accordion categories |
