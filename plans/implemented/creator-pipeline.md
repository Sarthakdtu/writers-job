# Creator Pipeline — Story Import from Raw Prose

> **STATUS: Implemented.** This document is the implementation plan for a new
> **Pro-tier feature** that lets users paste raw prose (e.g. 5 chapters of Anna
> Karenina) and automatically extract characters, world entities, plot beats,
> arcs, and chapter structure into a fully populated LoreSmith story.
> Backend (`backend/app/ai/creator/`) and frontend wizard
> (`CreatorPipelineView.jsx`) are implemented; see `plans/features.md`.

---

## 1. Goal

Build a **multi-stage, iterative pipeline** that ingests raw text and
auto-generates a complete LoreSmith story. Key properties:

- **Correctness first** — every stage produces reviewable JSON; user approves
  before the next stage runs.
- **Iterative** — process chapters in batches (e.g. 1–5, then 6–9); each batch
  merges into the existing story without clobbering prior extractions.
- **Separate from existing AI skills** — lives in its own `creator/` sub-package
  and dedicated frontend view; not part of the AIPanel/SkillStudio.
- **Pro-tier gated** — only available to Pro users.

### Example flow
1. User pastes chapters 1–5 of Anna Karenina.
2. System splits into 5 chapters, creates a Story + Book.
3. Stage 1 → extracts characters (Anna, Levin, Karenin, Kitty, Stiva, …)
4. Stage 2 → extracts world (St. Petersburg, Moscow, countryside, high society)
5. Stage 3 → extracts plot beats per chapter + story themes
6. Stage 4 → character arcs (Anna's trajectory, Levin's spiritual arc, …)
7. User reviews each stage, edits as needed, approves.
8. User pastes chapters 6–9 → system adds new chapters, extracts new/updated
   entities, merges with existing data (e.g. new beats for existing characters).

---

## 2. Architecture Overview

```
backend/app/ai/creator/
├── __init__.py
├── schemas.py          # Pipeline state, stage results, review models
├── pipeline.py         # Stage runner (orchestrates extraction calls)
├── stages.py           # Individual stage logic (characters, world, plot, arcs)
├── merge.py            # Diff + merge logic (new vs existing entities)
├── prompts.py          # System prompts + task templates per stage
└── store.py            # File persistence for pipeline state + draft results

backend/app/main.py     # New REST routes (§4)

frontend/src/components/modules/
└── CreatorPipelineView.jsx   # Dedicated Pro-tab wizard UI

frontend/src/components/Sidebar.jsx     # New NAV_ITEM entry
frontend/src/context/SkillLevelContext.jsx  # New FEATURE_LEVELS entry
frontend/src/App.jsx                     # New case in renderActiveModule
```

### Why a separate sub-package (not reusing `ai/jobs.py`)?
The Creator Pipeline has fundamentally different execution semantics:
- **Multi-step with user review between steps** — the existing pipeline runs
  all steps in one shot; Creator Pipeline pauses between stages for approval.
- **Merge semantics** — results are diffed against existing story data before
  writing, not just persisted as-is.
- **Batch-aware** — state tracks which chapters have been processed and what
  was extracted in prior batches.
- **Own storage** — pipeline state lives in `creator/` not `ai/`, keeping the
  two systems independent.

It **does** reuse: `OllamaClient` (transport), `FileManager` (entity CRUD),
`file_utils` (atomic I/O), `cached_models`/`resolve_model` (model resolution).

---

## 3. Data Model

### 3.1 Pipeline State (`creator/state.json`)

Tracks the overall progress of the import pipeline for a story.

```python
class CreatorBatchInfo(BaseModel):
    batch_id: str                          # "batch-1", "batch-2", ...
    chapter_range: str                     # "1-5", "6-9"
    created_at: str
    completed_at: Optional[str]
    stages_completed: List[str]            # ["split", "characters", "world", "plot", "arcs"]
    chapters_added: List[str]              # ["ch-1", "ch-2", ...]

class CreatorState(BaseModel):
    story_id: str
    status: Literal["draft", "in_progress", "review", "complete"]
    current_batch: Optional[str]           # active batch_id
    current_stage: Optional[str]           # "split"|"characters"|"world"|"plot"|"arcs"|"review"
    batches: List[CreatorBatchInfo]
    created_at: str
    updated_at: str
```

### 3.2 Stage Results (`creator/batches/<batch-id>/<stage>.json`)

Each stage writes a draft result that the user reviews before approving.

```python
# Characters stage output
class ExtractedCharacter(BaseModel):
    name: str
    role: str                             # "protagonist"|"antagonist"|"supporting"|"minor"
    bio: str
    aliases: List[str] = []               # alternative names
    traits: List[str] = []                # personality traits
    relationships: List[ExtractedRelationship] = []  # to other extracted chars

class ExtractedRelationship(BaseModel):
    target: str                           # character name
    type: str                             # "sibling"|"lover"|"rival"|"colleague"|"friend"|"parent"|"child"|"spouse"
    description: str

class CharactersStageResult(BaseModel):
    characters: List[ExtractedCharacter]
    notes: List[str] = []                 # extraction notes / confidence flags

# World stage output
class ExtractedCity(BaseModel):
    name: str
    region: str
    atmosphere: str
    key_locations: List[str] = []

class ExtractedFaction(BaseModel):
    name: str
    description: str
    leader: str
    alignment: str

class ExtractedArtifact(BaseModel):
    name: str
    type: str
    properties: str
    location: str
    belongs_to: List[str] = []            # character names

class WorldStageResult(BaseModel):
    cities: List[ExtractedCity]
    factions: List[ExtractedFaction]
    artifacts: List[ExtractedArtifact]
    magic_system: str                     # description of the world's rules
    technology_level: str
    global_rules: List[str]
    glossary: List[Dict[str, str]]        # [{term, definition, category}]
    notes: List[str] = []

# Plot stage output
class ExtractedPlotBeat(BaseModel):
    id: str                               # auto-generated slug
    title: str
    description: str
    chapter_id: str                       # which chapter this beat belongs to
    character_names: List[str]            # characters involved
    importance: str                       # "major"|"minor"|"sub"

class PlotStageResult(BaseModel):
    beats: List[ExtractedPlotBeat]
    themes: List[str]                     # story-level themes
    overview: List[str]                   # narrative summary paragraphs
    chapter_summaries: Dict[str, str]     # chapter_id → one-paragraph summary
    notes: List[str] = []

# Arcs stage output
class ExtractedArc(BaseModel):
    character_name: str
    arc_summary: str
    starting_state: str
    ending_state: str
    key_milestones: List[str]

class ArcsStageResult(BaseModel):
    arcs: List[ExtractedArc]
    notes: List[str] = []
```

### 3.3 Review Record (`creator/batches/<batch-id>/<stage>-approved.json`)

After user approves, the approved (possibly edited) result is saved here.
This is the version that gets merged into the story.

### 3.4 On-disk layout

```
<story-slug>/
├── story.json
├── creator/                          ← NEW
│   ├── state.json                    # CreatorState
│   └── batches/
│       ├── batch-1/
│       │   ├── split.json            # which raw text became which chapters
│       │   ├── characters.json       # CharactersStageResult (draft)
│       │   ├── characters-approved.json  # after user review
│       │   ├── world.json            # WorldStageResult (draft)
│       │   ├── world-approved.json
│       │   ├── plot.json             # PlotStageResult (draft)
│       │   ├── plot-approved.json
│       │   ├── arcs.json             # ArcsStageResult (draft)
│       │   └── arcs-approved.json
│       └── batch-2/
│           └── ...
├── characters/                       # populated by merge
├── world/                            # populated by merge
├── books/                            # populated by split + merge
└── assets/
```

---

## 4. Backend Routes

All new routes in `main.py`, under `/api/creator/`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/creator/{story_id}/start` | Initialize pipeline state for a story. Body: `{}`. Returns `CreatorState`. |
| `POST` | `/api/creator/{story_id}/split` | Submit raw text → split into chapters. Body: `{ text, book_title? }`. Runs stage 0 (structural split), creates Book + Chapters, returns `CreatorState`. |
| `POST` | `/api/creator/{story_id}/run-stage` | Run the next extraction stage. Body: `{ stage: "characters"\|"world"\|"plot"\|"arcs" }`. Returns draft `StageResult` + `CreatorState`. |
| `GET` | `/api/creator/{story_id}/state` | Get current pipeline state. |
| `GET` | `/api/creator/{story_id}/draft/{stage}` | Get draft result for a stage (pre-approval). |
| `PUT` | `/api/creator/{story_id}/approve/{stage}` | Approve (and optionally edit) a stage result. Body: `{ result: StageResult }`. Merges into story, advances state. |
| `POST` | `/api/creator/{story_id}/batch` | Submit a new batch of raw text (iterative). Body: `{ text, book_title? }`. Creates new batch, runs split, returns state. |
| `GET` | `/api/creator/{story_id}/summary` | Final summary: total entities, chapters, batches processed. |

---

## 5. Backend Modules — Detailed Design

### 5.1 `prompts.py` — Extraction Prompts

Each stage has a system prompt and a task template. All prompts request
**strict JSON output** for reliable parsing.

```python
CREATOR_SYSTEM = (
    "You are a literary analyst extracting structured data from prose fiction. "
    "Be precise and cite specific details from the text. Output strict JSON only. "
    "Never invent entities not present in the source text."
)

STAGE_TASKS = {
    "characters": (
        "Analyze the following prose chapters and extract ALL named characters. "
        "For each character provide: name, role (protagonist/antagonist/supporting/minor), "
        "a 1-2 sentence bio, any aliases or alternative names, key personality traits, "
        "and relationships to other extracted characters.\n\n"
        "Return strict JSON:\n"
        '{"characters": [{"name": str, "role": str, "bio": str, "aliases": [str], '
        '"traits": [str], "relationships": [{"target": str, "type": str, "description": str}]}], '
        '"notes": [str]}\n\n'
        "IMPORTANT: Only include characters who are actually named or clearly referred to in the text. "
        "Distinguish between characters who speak/act and those merely mentioned."
    ),
    "world": (
        "Analyze the following prose and extract the world-building elements. "
        "Identify: locations/cities (with region and atmosphere), factions/groups "
        "(with leader and alignment), artifacts/objects of significance, the governing "
        "rules of the world (magic system or social/technological rules), and any "
        "domain-specific terms for the glossary.\n\n"
        "Return strict JSON with keys: cities, factions, artifacts, magic_system, "
        "technology_level, global_rules, glossary, notes."
    ),
    "plot": (
        "Analyze the following prose chapters and extract the plot structure. "
        "For each chapter, identify the key plot beats (2-5 per chapter). "
        "Each beat should have: a short title, a 1-2 sentence description, "
        "which chapter it belongs to, which characters are involved, and "
        "its importance (major/minor/sub).\n\n"
        "Also extract: story-level themes (2-5), a narrative overview (2-3 paragraphs), "
        "and a one-paragraph summary per chapter.\n\n"
        "Return strict JSON with keys: beats, themes, overview, chapter_summaries, notes."
    ),
    "arcs": (
        "Analyze the following prose and the previously extracted characters and plot. "
        "For each significant character, describe their arc: a summary of their journey, "
        "their starting state (first appearance), their ending state (last appearance), "
        "and 2-4 key milestones that mark their development.\n\n"
        "Return strict JSON with keys: arcs (list of character arcs), notes."
    ),
}
```

### 5.2 `stages.py` — Stage Runners

Each stage function takes `FileManager`, `story_id`, batch context, and the
Ollama client, calls the LLM, and returns the parsed `StageResult`.

```python
class StageRunner:
    def __init__(self, fm: FileManager, client: OllamaClient):
        self.fm = fm
        self.client = client

    async def run_split(self, story_id: str, raw_text: str, book_title: str) -> SplitResult:
        """Stage 0: Split raw text into chapters.
        
        Strategy:
        1. Try pattern-based splitting first (## Chapter N, # Part N, etc.)
        2. If no patterns found, split by double-newline into ~2000-word chunks
        3. Create Book + Chapters via FileManager
        4. Return mapping of chapter IDs to text
        """

    async def run_characters(self, story_id: str, batch_id: str) -> CharactersStageResult:
        """Stage 1: Extract characters from batch chapters.
        
        - Gather prose from all chapters in this batch
        - Also gather any previously approved character names (for relationship context)
        - Call Ollama with character extraction prompt
        - Parse JSON response with retry logic
        - Save draft to creator/batches/<batch>/characters.json
        """

    async def run_world(self, story_id: str, batch_id: str) -> WorldStageResult:
        """Stage 2: Extract world entities.
        
        - Gather prose + already-approved characters (for context)
        - Call Ollama with world extraction prompt
        - Save draft
        """

    async def run_plot(self, story_id: str, batch_id: str) -> PlotStageResult:
        """Stage 3: Extract plot beats + themes.
        
        - Gather prose + approved characters + approved world
        - Call Ollama with plot extraction prompt
        - Save draft
        """

    async def run_arcs(self, story_id: str, batch_id: str) -> ArcsStageResult:
        """Stage 4: Extract character arcs.
        
        - Gather prose + approved characters + approved plot
        - Call Ollama with arcs extraction prompt
        - Save draft
        """
```

### 5.3 `merge.py` — Entity Merge Logic

After user approves a stage, the approved result is merged into the story.
This is the critical correctness layer.

```python
class EntityMerger:
    def __init__(self, fm: FileManager):
        self.fm = fm

    def merge_characters(self, story_id: str, extracted: List[ExtractedCharacter]):
        """Merge extracted characters into the story.
        
        Strategy:
        - Load existing characters from disk
        - For each extracted character:
          - If name matches an existing character (case-insensitive): UPDATE
            (append new bio text, merge traits, add new relationships)
          - If new: CREATE via save_character
        - Return { created: N, updated: N, skipped: N }
        """

    def merge_world(self, story_id: str, result: WorldStageResult):
        """Merge world entities.
        
        - Cities: dedupe by name, append new ones
        - Factions: dedupe by name, append new ones
        - Artifacts: dedupe by name, append new ones
        - Glossary: dedupe by term, append new ones
        - Mechanics: merge global_rules (append new rules, don't replace)
        """

    def merge_plot(self, story_id: str, batch_id: str, result: PlotStageResult):
        """Merge plot beats into the relevant book's plot.json.
        
        - Existing beats are preserved
        - New beats are appended (dedupe by title within same chapter)
        - Chapter summaries are merged into Story.overview
        - Themes are merged into Story.tags
        """

    def merge_arcs(self, story_id: str, result: ArcsStageResult):
        """Merge character arcs.
        
        - For each extracted arc:
          - If character already has an arc: APPEND milestones, update
            ending_state if the new batch extends further
          - If new: CREATE arc
        """

    def merge_chapters(self, story_id: str, batch_id: str, chapters: List[ChapterInfo]):
        """Create new chapters in the story's book.
        
        - Each chapter gets a sequential ID
        - Prose is written to .md files
        - Chapter metadata is saved
        """
```

### 5.4 `store.py` — Pipeline State Persistence

```python
class CreatorStore:
    def __init__(self, base_data_dir: str):
        self.base = Path(base_data_dir)

    def state_path(self, story_id: str) -> Path
    def batch_dir(self, story_id: str, batch_id: str) -> Path
    def draft_path(self, story_id: str, batch_id: str, stage: str) -> Path
    def approved_path(self, story_id: str, batch_id: str, stage: str) -> Path

    def get_state(self, story_id: str) -> Optional[CreatorState]
    def save_state(self, state: CreatorState)
    def save_draft(self, story_id: str, batch_id: str, stage: str, result: dict)
    def load_draft(self, story_id: str, batch_id: str, stage: str) -> Optional[dict]
    def save_approved(self, story_id: str, batch_id: str, stage: str, result: dict)
    def load_approved(self, story_id: str, batch_id: str, stage: str) -> Optional[dict]
```

### 5.5 `pipeline.py` — Orchestrator

```python
class CreatorPipeline:
    def __init__(self, fm: FileManager, client: OllamaClient, base_data_dir: str):
        self.fm = fm
        self.client = client
        self.store = CreatorStore(base_data_dir)
        self.stages = StageRunner(fm, client)
        self.merger = EntityMerger(fm)

    async def initialize(self, story_id: str) -> CreatorState:
        """Create initial pipeline state for a story."""

    async def split_text(self, story_id: str, raw_text: str, book_title: str) -> CreatorState:
        """Stage 0: Split text into chapters, create book + chapter files."""

    async def run_stage(self, story_id: str, stage: str) -> dict:
        """Run a single extraction stage, save draft, return result for review."""

    async def approve_stage(self, story_id: str, stage: str, edited_result: dict) -> CreatorState:
        """User approved a stage — merge into story, advance state."""

    async def start_new_batch(self, story_id: str, raw_text: str, book_title: str) -> CreatorState:
        """Submit a new batch of text (iterative processing)."""

    def get_summary(self, story_id: str) -> dict:
        """Return summary stats: entities created, chapters, batches, etc."""
```

---

## 6. Frontend — Creator Pipeline View

### 6.1 Tab Registration

**Sidebar.jsx** — add new NAV_ITEM:
```js
{ id: 'creator', label: 'Creator Pipeline', icon: Wand2, desc: 'Import prose into a story', feature: 'nav.creator' },
```

**SkillLevelContext.jsx** — add to FEATURE_LEVELS:
```js
'nav.creator': 'pro',
'creator.pipeline': 'pro',
```

**App.jsx** — add case in `renderActiveModule()`:
```jsx
case 'creator':
  return <LevelGate feature="nav.creator" title="Creator Pipeline" hint="Level up to Pro for story import."><CreatorPipelineView /></LevelGate>;
```

### 6.2 `CreatorPipelineView.jsx` — UI Design

A **stepper/wizard layout** with 5 phases:

```
┌─────────────────────────────────────────────────────────────┐
│  Creator Pipeline — Anna Karenina                          │
│                                                             │
│  ● Split  ● Characters  ● World  ● Plot  ● Arcs  ● Done   │
│  ──────── ──────────── ─────── ─────── ─────── ────────    │
│                                                             │
│  ┌─ Paste Text ──────────────────────────────────────────┐  │
│  │  [ Large textarea for raw prose ]                     │  │
│  │  [ Book Title: input ]                                │  │
│  │  [ Split into Chapters → ]                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Chapter Preview (after split) ───────────────────────┐  │
│  │  Ch 1: "Anna arrives..." (1,234 words)     [Edit] [x]│  │
│  │  Ch 2: "Levin mows..."    (2,156 words)    [Edit] [x]│  │
│  │  ...                                                  │  │
│  │  [ Run Character Extraction → ]                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Extracted Characters (draft) ────────────────────────┐  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ 👤 Anna Karenina — protagonist                   │  │  │
│  │  │ Bio: Married to Karenin, affair with Vronsky...  │  │  │
│  │  │ Traits: [passionate] [impulsive] [social]        │  │  │
│  │  │ Relationships: wife-of Karenin, lover-of Vronsky │  │  │
│  │  │                                    [Edit] [ Approve ]│ │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ 👤 Levin — protagonist                           │  │  │
│  │  │ ...                                              │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  [+ Add Character]                                    │  │
│  │  [Approve All & Run World Extraction →]               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ... (same pattern for World → Plot → Arcs)                │
│                                                             │
│  ┌─ Final Summary ───────────────────────────────────────┐  │
│  │  Story: Anna Karenina                                 │  │
│  │  Chapters: 5  Characters: 12  Cities: 3  Beats: 24   │  │
│  │  [Start New Batch]  [Open in Dashboard →]             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 UI Components

The view is a single `CreatorPipelineView.jsx` (large component) with internal
sub-components:

1. **TextInputPane** — textarea + book title input + "Split" button
2. **ChapterList** — list of split chapters with word counts, edit/delete
3. **ExtractionStage** — generic stage display:
   - Header: stage name + status (pending/running/draft/approved)
   - Body: editable cards for each extracted entity (character card, city card, etc.)
   - Footer: "Approve" / "Approve & Next" button + "Skip" option
4. **ProgressBar** — horizontal stepper showing stages and completion
5. **BatchHistory** — collapsible section showing prior batches
6. **SummaryView** — final stats + navigation buttons

### 6.4 State Management

```js
// Local state in CreatorPipelineView:
const [state, setState] = useState(null);           // CreatorState from backend
const [rawText, setRawText] = useState('');          // paste area text
const [bookTitle, setBookTitle] = useState('');      // optional book title
const [draft, setDraft] = useState(null);            // current stage draft result
const [editingDraft, setEditingDraft] = useState(null); // user-modified copy
const [loading, setLoading] = useState(false);       // loading spinner
const [error, setError] = useState(null);            // error message
```

API calls:
- `POST /api/creator/{id}/split` → creates chapters, returns state
- `POST /api/creator/{id}/run-stage` with `{ stage }` → returns draft
- `PUT /api/creator/{id}/approve/{stage}` with `{ result }` → merges, returns state
- `POST /api/creator/{id}/batch` → new batch, returns state

---

## 7. Phase-Wise Implementation Plan

### Phase 1 — Backend Foundation (core pipeline + split)
**Files to create/modify:**
- `backend/app/ai/creator/__init__.py`
- `backend/app/ai/creator/schemas.py` — all Pydantic models
- `backend/app/ai/creator/store.py` — state persistence
- `backend/app/ai/creator/prompts.py` — extraction prompts
- `backend/app/ai/creator/pipeline.py` — orchestrator (split + stage runners)
- `backend/app/ai/creator/stages.py` — individual stage logic
- `backend/app/ai/creator/merge.py` — entity merge logic
- `backend/app/main.py` — new routes
- `backend/app/schemas.py` — add new models (or keep in creator/schemas.py)

**What works after Phase 1:**
- `POST /api/creator/{id}/split` — paste text, split into chapters
- `POST /api/creator/{id}/run-stage` — run character extraction
- Manual merge via API (no review UI yet)
- Full backend is testable via curl/Postman

### Phase 2 — All Extraction Stages
**Add to Phase 1 files:**
- World extraction stage + merge
- Plot extraction stage + merge
- Arc extraction stage + merge
- Batch submission (iterative processing)

**What works after Phase 2:**
- Full pipeline end-to-end via API
- Iterative batches merge correctly
- Entity deduplication across batches

### Phase 3 — Frontend Wizard UI
**Files to create:**
- `frontend/src/components/modules/CreatorPipelineView.jsx`

**Files to modify:**
- `frontend/src/App.jsx` — add case + import
- `frontend/src/components/Sidebar.jsx` — add NAV_ITEM
- `frontend/src/context/SkillLevelContext.jsx` — add FEATURE_LEVEL

**What works after Phase 3:**
- Full UI: paste → split → review characters → review world → review plot → review arcs → done
- Each stage shows extracted entities as editable cards
- Approve/save flow works end-to-end
- Batch history visible

### Phase 4 — Polish & Edge Cases
- Better chapter-split heuristics (handle various formatting styles)
- Larger text handling (chunking for Ollama context limits)
- Error recovery (Ollama timeout, bad JSON, etc.)
- Loading states and progress indicators
- "Skip stage" option (e.g. skip arcs for non-fiction)
- Edit individual entity cards inline
- Relationship visualization in character stage
- Preview of how merged data will look before approving

### Phase 5 — Advanced Features (future)
- Image/concept art import per batch
- Character portrait generation hints
- Conflict resolution UI (when merge detects contradictions)
- Export/import pipeline state (resume on different machine)
- Batch size recommendations based on Ollama context budget

---

## 8. Key Design Decisions & Rationale

### 8.1 Why not reuse the existing `ai/jobs.py` job queue?
The Creator Pipeline has **user-in-the-loop** semantics: each stage runs,
pauses for review, then the user triggers the next. The existing job queue is
designed for fire-and-forget batch runs. Forcing the Creator Pipeline into that
model would require complex "pause between steps" state that doesn't exist today
and would complicate the existing system.

### 8.2 Why not use the existing import pipeline family?
The 3 existing import pipelines (`handwriting_ocr`, `concept_art_caption`,
`sticky_notes_dump`) are single-shot image→text converters. The Creator Pipeline
is a multi-stage, iterative, review-gated system with merge semantics — a
fundamentally different execution model.

### 8.3 Merge strategy: append + dedupe, never replace
When processing batch 2 (chapters 6–9), we must not overwrite batch 1's
extractions. The merge logic:
- **Characters**: match by normalized name → update bio/traits if new info, never delete
- **World entities**: match by name → append new, skip duplicates
- **Plot beats**: match by (chapter_id, title) → append new beats
- **Arcs**: match by character name → extend milestones, update ending_state

### 8.4 JSON parsing with retry
Following the pattern in `notion_enrich.py`, all LLM responses are parsed with
`_extract_json` (tolerates markdown fences, finds first `{…}` block). Failed
parses trigger up to 3 retries with the same prompt.

### 8.5 Model selection
The Creator Pipeline uses the story's configured text model (or the default
`OLLAMA_DEFAULT_MODEL`). For extraction tasks requiring structured JSON, we set
`format="json"` and `think=False` (following the Notion enrichment pattern).
The `perspective_rewrite` pinning of `qwen2.5:7b` is not needed here because
extraction is not latency-sensitive — the user is reviewing between stages.

---

## 9. Verification Plan

Since there is no automated test suite, verification is manual:

1. **Phase 1:** Boot backend, use `curl` to test split + character extraction
   with a pasted text block. Verify chapters appear on disk, characters are
   extracted correctly.

2. **Phase 2:** Run full pipeline via curl for a known text (e.g. 3 chapters of
   a public-domain story). Verify all entities are created, batch 2 merges
   correctly with batch 1.

3. **Phase 3:** Boot frontend, navigate to Creator Pipeline tab (verify Pro
   gating), paste text, walk through the full wizard. Verify entities appear
   in other views (Character Roster, Worldbuilding Hub, Book Outliner).

4. **Lint:** Run `npm run lint` and `npm run build` in `frontend/` after any
   frontend changes.

---

## 10. Estimated Complexity

| Phase | Backend | Frontend | Total |
|-------|---------|----------|-------|
| Phase 1 | ~600 lines (7 new files) | 0 | ~600 |
| Phase 2 | ~200 lines (extend stages + merge) | 0 | ~200 |
| Phase 3 | ~50 lines (route tweaks) | ~800 lines (1 new view) | ~850 |
| Phase 4 | ~150 lines | ~200 lines | ~350 |
| **Total** | **~1000** | **~1000** | **~2000** |
