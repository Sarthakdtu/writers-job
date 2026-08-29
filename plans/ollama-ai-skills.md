# Ollama AI Pipelines & Skills Plan

**Status:** Draft / Design only (no code written)
**Built for:** Local-first Fiction Writer Suite (FastAPI + React, file-system storage)
**Requirement:** A generic, extensible Ollama integration — offline, per-story,
context-aware. It powers story-analysis **skills** (insights, plot/loop-hole detection,
character trajectory, …), input/transform **pipelines** (upload handwritten or concept-art
images → OCR / description extraction → text that flows back into the story), and a
**Skill Studio** tab where the user authors **custom skills** (a prompt) and a **Context
Router** pipeline decides which data stores ground that prompt. Everything runs **async in
the background** without blocking existing features, triggered on demand, per-skill
**enabled per story**, surfacing **whatever is relevant to the menu (tab) the user is in**.

---

## 1. Requirements → Design Mapping

| User asks | Design answer |
|---|---|
| "Ollama LLM migration" | Never send data off-machine. Talk to the local `ollama` daemon at `http://localhost:11434` over its native REST API using `httpx` (already a dependency). |
| "Make the client generic" | The client is a **transport layer** with typed request/response models (`text`, `text+images` base64, format hints). Models are routed by **capability** (text, vision/OCR, coder) from a local registry, not hard-coded per skill. |
| "Upload hand-written images → text extraction pipeline" | A new **Import & Transform** pipeline family: image upload (reuses the existing `/assets/upload`) → vision model (`glm-ocr`, `minicpm-v`) extracts text → optional clean-up pass (`qwen3.5:9b`) → results saved back (character note, story note, overview). |
| "Separate tab in the app to create a skill (a prompt)" | A new **"AI Studio"** sidebar tab (`activeTab: 'ai'`) hosting **SkillStudioView**: create/edit/duplicate/delete custom skills with a name, description, prompt, model family, input kind, and visibility tabs. |
| "When added, another pipeline decides which data stores the Ollama client reads" | A **Context Router** pipeline (`ai/router.py`): given a custom skill's prompt (and its author's hints), it returns which **data stores** (overview, world sections, characters, books, plots, arcs, chapter prose, …) to stitch into the prompt context. Runs on save (eager) with optional run-time re-routing. |
| "Edit skills as well" | Full CRUD for custom skills: built-in skills are read-only (code-defined), custom skills are JSON-backed and editable. |
| "Insights, loop holes, plot holes, character trajectory, + more" | A **built-in skill catalog** (18 skills, §5) covering story/dashboard, worldbuilding, characters, outliner, and editor contexts — each implemented as a pipeline step over story context. |
| "Enabled as a skill per story" | Every skill/pipeline (built-in *and* custom) has a stable id; each story has an `ai_config.json` with `enabled_skills[]` (defaults = all enabled). Toggle per story, persisted on disk. |
| "Not real time; click AI suggestion button; runs asynchronously" | Click → `POST /api/ai/run` returns a `job_id` instantly → background `asyncio` task talks to Ollama → frontend **polls** status. No streaming, no blocking. |
| "Without hampering current functionality" | Every route is additive; job runner is isolated (see §8); the AI panel is a z-above overlay that never touches autosave/other views. |
| "AI section & skills depend on the menu I'm at" | The panel reads `activeTab` (already global via `useStory()`); skills/pipelines are tagged with applicable tabs and filtered by it (§5.6). |
| "Implement in phases, load the next phase only after the previous is verified" | The work is split into 8 gated phases (§11). Each phase ends at a working, manually verified milestone; the next phase is only started once the current one is accepted. |

### Locked decisions (confirmed 2026-08-29)
1. **Result rendering:** add `react-markdown` to the frontend — LLM answers render as real
   markdown (tables, headers, lists). Single small dependency, best readability.
2. **Concurrency:** jobs are **queued sequentially per story** (FIFO, one runner). Queue
   depth is surfaced in the panel; no parallel generation, no 409 rejection.
3. **Trigger model:** click-to-run, poll-based. No streaming, no background auto-runs in
   v1. "Keeps working in background" = the job runs on the backend while the user does
   anything else in the app.
4. **Custom-skill grounding:** the **Context Router is an LLM pipeline** (not a form).
   It reads the skill's prompt + an author hint and returns the data stores to use; the
   author can review/lock sources afterward (§4.5).
5. **Phased delivery:** 8 phases, each end-to-end verified before the next begins (§11).

---

## 2. Architecture Overview

```
┌──────────────────────────  Ollama daemon (localhost:11434)  ──────────────────────────┐
│  qwen3.5:9b (text, default) · gemma4:26b (text) · qwen2.5:7b (text)                  │
│  minicpm-v:latest (vision) │ glm-ocr:latest (OCR) │ qwen2.5-coder:latest (code)     │
└────────────────────────────────────────▲──────────────────────────────────────────────┘
                                          │  GET/POST  /api/tags, /api/chat  (text+base64 images)
┌───────────────────── Backend (FastAPI, :8000) ─────────────────────┐
│  main.py routes:  /api/ai/*  (status, pipelines, config, run,      │
│                   jobs, results, cancel, custom, route)            │
│  ai/ollama.py         ← GENERIC transport: typed requests          │
│                         (text / text+images), capability-aware     │
│                         model routing, vision/OCR support          │
│  ai/pipelines.py      ← Pipeline registry (everything is a         │
│                         pipeline: built-in skills + import/extract │
│                         + user custom skills)                      │
│  ai/custom.py         ← Custom-skill registry CRUD (Skill Studio)  │
│  ai/router.py         ← CONTEXT ROUTER: decides which data stores  │
│                         (overview/world/chars/books/plot/arcs/     │
│                         prose/…) ground a custom skill's prompt    │
│  ai/context.py        ← per-pipeline context assembly + budgets    │
│  ai/prompts.py        ← system prefixes + per-pipeline templates   │
│  ai/io.py             ← image staging: resolve asset URL → base64, │
│                         file-type guards, downscaling              │
│  ai/jobs.py           ← JobManager (background asyncio tasks)      │
│  ai/store.py          ← ai_config.json + job/result JSON via       │
│                         file_utils (atomic, thread-safe)           │
│  FileManager (existing) → data access for contexts + image assets   │
└───────────────────────────────────────────────┬────────────────────┘
                                                 │ /api/ai/* via Vite proxy
┌───────────────────── Frontend (React, :3000) ─────────────────────┐
│  StoryContext: add `aiPanelOpen`, hotkey  ⌘⇧A / ⌘⌥A              │
│  Navbar: "AI" button (Sparkles) + status dot                       │
│  <AIPanel />  right-side drawer mounted in MainLayout              │
│    ├─ header: ollama status + model selector (by capability)       │
│    ├─ "AI Studio" grouped by tab: analysis skills                  │
│    └─ "Import & Extract": image-drop pipelines (OCR …)             │
│  NEW TAB `ai`: <SkillStudioView />  (Sidebar NAV_ITEMS + App.jsx  │
│    switch): custom-skill CRUD, prompt authoring, Context-Router    │
│    result chips (review/lock sources), test-run button             │
└────────────────────────────────────────────────────────────────────┘
```

Custom-skill files (`data/custom_pipelines.json`, app-wide registry) + per-story
`enabled_skills` in `ai_config.json` determine which custom skills any story may run.

Stack: Python 3.13 / FastAPI 0.141 / httpx 0.28 + aiofiles (already pinned). Ollama
`ollama` binary present at `/usr/local/bin/ollama` (0.32.6); models already pulled
locally, including the vision models `minicpm-v:latest` and `glm-ocr:latest` that the
OCR/image pipelines depend on. No `openai`/`langchain` SDK needed — the native HTTP API is
enough.

---

## 3. Generic Ollama Client (`backend/app/ai/ollama.py`)

A **transport layer**, deliberately not tied to any feature. It knows *how* to talk to
Ollama (requests, capabilities, base64 images, timeouts) — not *what* the app asks.

### 3.1 Typed request/response
```python
class OllamaMessage(BaseModel):
    role: Literal["system","user","assistant"]
    content: str
    images: List[str] = []        # base64-encoded PNG/JPEG/WebP

class OllamaRequest(BaseModel):
    model: str
    messages: List[OllamaMessage] # chat form; single user msg == generate form
    temperature: float = 0.2
    max_tokens: int = 4096
    format: Literal["json", None] = None      # structured-output hint
    options: dict = {}                        # num_ctx, top_p, etc.

class OllamaResponse(BaseModel):
    content: str
    model: str
    done: bool
    prompt_eval_count: int = 0
    eval_count: int = 0
    error: str | None = None
```

### 3.2 Client API
- `async def health() -> OllamaStatus` — `GET /api/tags`; reports daemon reachable,
  list of installed models.
- `async def list_models() -> List[OllamaModel]` — from `/api/tags` + `model_info`;
  each tagged with `capabilities` (§3.3), size, family.
- `async def complete(req: OllamaRequest) -> OllamaResponse` — **the only generation
  entry point** for skills *and* pipelines. `POST /api/chat` (or `/api/generate` when
  there's a single user message and no images). `stream=False` always (UI is poll-based).
- `async def resolve_model(preferred: str | None, needs: Capabilities) -> str` — pick the
  best installed model: explicit override → pipeline default → first installed model that
  satisfies `needs` → first installed model → error with "run `ollama pull …`" hint.

### 3.3 Capability registry (not hard-coded per feature)
Ollama `/api/tags` exposes `model_info` → `general.architecture` / `families`. Multimodal
models carry a vision encoder (e.g. `clip` family). Detection strategy is a local
registry with a fallback heuristic — never fail on unknown names:

```
capabilities(model) =
    explicit override in config         → config (user wins)
    details.families contains vision    → {vision: true, ocr: (model-name hint)}
    name matches r/(vl|vision|llava|ocr|minicpm|glm|gemma3|finetuna)/ → vision
    else                                → {text: true}
OCR = vision + model name/preset in the pipeline's OCR_model list (glm-ocr recommended)
```
- `glm-ocr:latest`   → `{text, vision, ocr}` — default OCR engine (handwriting/print).
- `minicpm-v:latest` → `{text, vision}`     — general image understanding + OCR fallback.
- `qwen3.5:9b` / `qwen2.5:7b` / `gemma4:26b` → `{text}` — analysis & creative.
- `qwen2.5-coder`   → `{text, code}`        — future-proof for code/structure tasks.
`GET /api/ai/status` returns each installed model with its capabilities so the frontend
dropdown can label them (e.g. `minicpm-v  · vision`).

### 3.4 Image input (the OCR / concept-art path)
Ollama accepts `images: ["base64…"]` in chat messages. `ai/io.py` handles the story side:
- `prepare_images(story_id, image_refs) -> List[bytes/base64]` — resolves each ref
  (`/api/stories/{id}/assets/{file}` URL, raw filename, or data-URL) to a local file via
  `FileManager.get_asset_path`, validates extension (`png|jpeg|jpg|webp|gif`), size-caps
  (≤ ~8 MB each, ≤ 6 images per run), and base64-encodes.
- Path traversal guard: only files inside the story's `assets/` dir are accepted.
- Optional `downscale()` (Pillow) if the client already has it — **flagged optional**;
  base64-pass-through works with zero new deps.

**Config (env vars, matching existing `GOOGLE_CLIENT_SECRET_PATH` style):**
- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_DEFAULT_MODEL` (default `qwen3.5:9b` — installed, 6.6 GB, good analysis balance)
- `OLLAMA_OCR_MODEL` (default `glm-ocr:latest`), `OLLAMA_VISION_MODEL` (default
  `minicpm-v:latest`)
- `OLLAMA_TIMEOUT_S` (default 300; long generations)
- `OLLAMA_CONTEXT_BUDGET_CHARS` (default 40_000; per-run trimming, see §7)
- `OLLAMA_TEMPERATURE` (default 0.2 for analysis — deterministic; 0.8 for creative skills)
- `OLLAMA_MAX_IMAGES_PER_RUN` (default 6)

**Failure handling:** if Ollama isn't running, `GET /api/ai/status` reports
`available:false` with a hint, and runs fail fast with
`error_message: "Ollama is not running. Start it with: ollama serve"`. Never crash the
app. Model auto-pick fallback: first installed model; "pull a model" hint if none.

---

## 4. Everything Is a Pipeline (generic model)

The app exposes **one registry of capabilities**, called *pipelines*. Two families share
the same job/async/result machinery:

- **Analysis skills** — read story context, return markdown insights (§5).
- **Import & Transform pipelines** — take images/text input, extract structured text,
  and offer **save-back targets** (§6, e.g. handwritten notes → character note).

A pipeline therefore cannot assume "text in, text out". Its shape must describe inputs,
steps, and optional outputs.

### 4.1 Pipeline definition
```python
PipelineDef = {
  "id": str,                    # snake_case, e.g. "plot_holes", "handwriting_ocr"
  "name": str,                  # human label in the panel
  "description": str,           # one-liner
  "family": "analysis" | "import",
  "tabs": ["dashboard","outliner","editor", ...] + "ai"/"import",
                                # where it's offered; "import" = always in Import tab
  "input": {
      "kind": "story_context" | "selection" | "images" | "text",
      "images": False | True,   # needs image attachments
      "max_images": int,
  },
  "steps": [StepSpec, ...],     # §4.2 — composes the generic client
  "model": {"family": "text"|"vision"|"ocr", "default": "qwen3.5:9b"},
  "temperature": float,         # 0.2 analysis / 0.8 creative
  "context_builder": str,       # key into ai/context.py
  "system_prompt": str,         # role + output rules
  "save_targets": [str],        # for imports: ["character.notes","story.notes", ...]
  "scope": "story" | "selection",
}
```
Registry is a plain ordered dict `PIPELINES` in `ai/pipelines.py`. `GET /api/ai/pipelines`
serializes it (Pydantic), merged with per-story `enabled` flags. Skills in §5 and import
pipelines in §6 are just rows in that one registry.

### 4.2 Multi-step composition (`steps`)
A step = one call to the generic client with a prepared prompt. Steps chain so the output
of one can feed the next:

```python
class StepSpec:
    prompt_key: str            # template in ai/prompts.py
    model: {"family":"ocr"}    # capability-driven resolution
    temperature?: float
    max_tokens?: int
    post_process?: str         # "strip_markdown_fences" | "as_is" | None
    pass_prev_output?: bool    # prepend previous step's text to this prompt
```
Example — **handwriting OCR** is two steps:
1. `ocr_extract` (glm-ocr, vision) → raw extracted text.
2. `ocr_cleanup` (qwen3.5:9b, text) → de-noised, structured text fed by step 1 output
   (`pass_prev_output: true`), optional `format: "json"` for a strict
   (e.g. `{title, date, body}`) grammar.

Single-step pipelines (most analysis skills) are just `steps: [one text step]`.

### 4.3 Per-story configuration (storage)
`data/stories/<slug>/ai/config.json`:
```json
{
  "enabled_skills": ["story_overview","plot_holes","handwriting_ocr","..."],
  "model": "qwen3.5:9b",
  "ocr_model": "glm-ocr:latest",
  "vision_model": "minicpm-v:latest",
  "temperature_override": null
}
```
- Created by default on `ensure_story_structure` with **all pipelines enabled** (new
  stories get everything; old stories backfilled lazily — absent file means "all
  enabled").
- Written via `file_utils.write_json_safe` (atomic + thread-safe). Kept **out of the
  `Story` schema** so the core model doesn't bloat; the file is small.

### 4.4 Where files live (no DB — follows the existing on-disk convention)
```
data/stories/<slug>/
├── ai/
│   ├── config.json               # §4.3  (skill + model overrides)
│   ├── jobs/                     # every run anywhere (history)
│   │   ├── <job-uuid>.json       # status + params + error
│   │   └── ...
│   ├── results/                  # latest result / extracted text per pipeline
│   │   ├── <pipeline_id>.json    # { id, family, model, created_at, content, save_targets }
│   │   └── ...
│   └── queue.json                # (optional) pending queued runs for startup recovery
```
Image attachments are **not copied** — pipelines reference the story's existing
`assets/` files so the same upload powers the gallery and AI.

### 4.5 Skill Studio — custom skills + the Context Router

#### What the user creates (Skill Studio tab, `activeTab: 'ai'`)
A **custom skill** is a user-authored pipeline: they write the prompt and pick
structural options; they must **not** manually wire which data goes in. Built-in skills are
read-only (code-defined); custom skills live in an editable JSON registry.

```python
CustomSkill = {
  "id": str,                    # auto `custom-<slug>` in a `custom:` namespace
  "name": str, "description": str,
  "prompt": str,                # THE user-written instruction (may include {{}} placeholders)
  "model_family": "text"|"vision"|"ocr",
  "temperature": float = 0.2,
  "input_kind": "story_context"|"selection"|"text"|"images",
  "tabs": ["dashboard","world",...],       # where it's offered; [] = everywhere
  "max_images": int = 0,
  "save_targets": [str] = [],   # like imports: character.notes, story.notes, ...
  # context wiring (computed by the Router, overridable):
  "routing": {
      "mode": "auto" | "locked",
      "sources": ["overview","characters","plot","arcs", ...],  # chosen stores
      "params_hint": ["character_id"] ,        # if a selection is needed
      "routed_at": "…", "routed_by": "qwen3.5:9b",
  },
  "created_at": "…", "updated_at": "…",
}
```

#### The Context Router (`ai/router.py`) — "another pipeline decides the data stores"
For every new/edited custom skill, the **Router** answers: *"given this prompt, which of
the story's data stores must the Ollama client read to produce a good answer?"*

- **Data-store catalog** (the `sources` vocabulary the router may pick):
  `overview` · `characters` · `world_cities` · `world_factions` ·
  `world_artifacts` · `world_glossary` · `world_mechanics` · `books` · `plot` ·
  `arcs` · `chapter_prose` · `timeline` · `gallery` · `none` (pure creative)
- **Input to the router:** the custom skill's `name`, `description`, `prompt`, plus an
  optional **author hint** (dropdown in the Studio: "whole story / my characters / plot &
  structure / the open chapter / world lore / nothing"). Cheap, quick.
- **Mechanics:** a single call to the generic client (`qwen2.5-coder` or `qwen3.5:9b`,
  `format:"json"`, `temperature≈0`) with a fixed router system prompt:
  `They return {"sources": [...], "params_hint": [...], "reason": "…text..."}`
- **Deterministic fallback** when Ollama is unreachable or output is malformed:
  a keyword matcher (prompt mentions "character" → `characters,sorter` etc.) so creating
  a skill never hard-fails offline; the Studio flags `routed_by: "fallback"`.

#### Eager vs run-time routing
- **Eager (default):** route on Save and on "Re-route sources" in the Studio. The result
  is stored in `routing.sources` and used by every run → zero extra latency per run.
- **Run-time (optional, per skill):** `routing.mode: "auto"` re-runs the router at the
  start of each job so the grounding always tracks the *current* story state. Costs one
  extra (small, json) generation per run. Default remains eager.
The Studio shows the routed sources as **review chips** the author can add/remove/lock.

#### Custom runs in the job runner
A custom skill is a **single-step pipeline**: `steps = [prompt]`, generated on the fly by
`custom.py` from the stored definition. At run time the job runner assembles context via
`build_context_from_sources(routing.sources, params)` (§7), injects it into the custom
prompt (or into `{{story_context}}` when the prompt uses it), and runs once. Everything
else (queue, poll, results, save-back) is shared.

### 4.6 Custom-skill storage
```
data/custom_pipelines.json        # app-wide registry: [CustomSkill, ...] (atomic writes)
data/stories/<slug>/ai/config.json # per-story enabled_skills includes custom-<id>
```
- Editing a custom skill updates the registry; per-story toggles are untouched (stable id).
- Deleting a custom skill removes it from the registry and from every story's
  `enabled_skills` (garbage-collect on the next config read).
- Duplicating a skill copies it with a new id (`custom-<slug>-copy`).

---

## 5. Pipeline Catalog (analysis skills + import/extract)

Analysis skills are grouped by the primary menus they serve. A skill may appear in several
tabs. Import/extract pipelines follow in §5.5.

### 5.1 Home & Dashboard
| id | name | tabs | context → prompt inputs |
|---|---|---|---|
| `story_overview` | Story Overview & Insights | dashboard, home | story.json, overview[], world mechanics, characters summary, book/plot summaries → **narrative summary, stated themes, strengths, watch-outs** |
| `plot_holes` | Plot Hole Scan (high-level) | dashboard, outliner, editor | all books + plots + arcs + overview, sampled chapter prose → **table: hole \| severity \| location \| suggested fix** |
| `pacing_analysis` | Pacing & Structure | dashboard, outliner, editor | beats + chapter word counts + POV → **pacing notes, sagging/raced stretches, beat rhythm** |
| `pitch_blurb` | Blurb / Logline / Hook Generator | home, dashboard | overview + first chapters + premise → **logline, 3 blurbs, one-line hook** |

### 5.2 Worldbuilding Hub
| id | name | tabs | context |
|---|---|---|---|
| `lore_check` | Lore & Continuity Check | world | glossary, cities, factions, artifacts, mechanics, character timeline → **contradictions, undefined rules, timeline jitter** |
| `mechanics_review` | Magic / Mechanics Review | world | mechanics + artifacts + artifact timeline + key lore → **rule gaps, deus-ex risk, power-balance drift** |
| `world_scene_ideas` | Setting Detail Enhancer | world | per-city region/atmosphere/key_locations + faction flavor → **sensory + scene-settable details per location/faction** |

### 5.3 Character Roster
| id | name | tabs | context |
|---|---|---|---|
| `character_trajectory` | Character Trajectory Recommendation | characters | selected char (bio/notes/timeline) + arcs + appearances + plot beats tagged to them → **recommended arc, milestones, conflicts, motivation refocus** |
| `character_consistency` | Character Consistency Check | characters, editor | char profile + prose excerpts where they appear (POV + appearances) → **contradictions, trait drift, forgotten facts** |
| `dialogue_voice` | Dialogue & Voice Coach | characters, editor | char role/bio + dialogue samples from prose → **voice profile, consistent tics, before/after example lines** |

### 5.4 Book Outliner
| id | name | tabs | context |
|---|---|---|---|
| `gap_finder` | Missing Scene / Thread Finder | outliner | beats + arcs + subplot(s) in `plot_subsections` + character timelines → **dangling threads, unmotivated beats, missing bridges** |
| `arc_trajectories` | Cast Arc Trajectories | outliner, characters | all arcs + beats w/ `character_ids` + chapter POV → **per-character arc assessment + trajectory advice** |
| `pov_balance` | POV Balance Check | outliner | chapters (`pov_character_id`) + word counts → **POV distribution, under-used POVs, recency gaps** |
| `twist_check` | Twist / Reveal Fairness | outliner | beats + theme + foreshadowing cues in scene breakdowns → **unearned twists, missing setup, payoff timing** |

### 5.5 Draft Editor
| id | name | tabs | context |
|---|---|---|---|
| `prose_critique` | Prose Critique | editor | current chapter `.md` → **line-referenced strengths, dead weight, quick wins** |
| `continue_writing` | Continue the Scene | editor | current chapter `.md` + nearby beats → **continuation draft (2–3 paragraphs), tone-matched** |
| `continuity_check` | Chapter × Outline Continuity | editor | current chapter prose vs its plot beats + book plot → **deviations, dropped beats, retcons** |
| `show_tell` | Show vs Tell Audit | editor | current chapter prose → **specific instances + micro-rewrites** |

> Total: **18 built-in skills** across menus + **3 import/extract pipelines**, all local.
> Custom skills from the Skill Studio register themselves into the same catalog and appear
> in the tabs they opt into. Stable ids mean `config.json` survives catalog additions.

### 5.5 Import & Transform pipelines (image → text extraction)

Surfaced in the AI panel's **"Import & Extract"** section (present on every tab) and by
per-view pills where relevant. All accept images already uploaded to the story's
`assets/` (so the existing `/assets/upload` + gallery picks remain the only upload path).

| id | name | input | steps (models) | save targets | example use |
|---|---|---|---|---|---|
| `handwriting_ocr` | Handwriting → Text | images ×≤6 | 1. `glm-ocr` extract raw → 2. `qwen3.5:9b` clean/format (optional `format:"json"` grammar) | character.notes, story.notes, overview, prose.insert, clip | Scan a character sheet, worldbuilding bullet, or scene sketch written by hand |
| `concept_art_caption` | Concept Art → Lore Caption | images ×≤1 | 1. `minicpm-v` describe → 2. optional `qwen3.5:9b` lore-tone polish | gallery.context, character.gallery | Auto-caption concept art and fold it into the gallery (becomes a StoryImageItem) |
| `sticky_notes_dump` | Photo Sticky-Notes → Notes | images ×≤6 | 1. `glm-ocr` extract all → 2. `qwen3.5:9b` de-dup + group by topic | story.notes, character.notes, clipboard | Photograph a wall of sticky notes → tidy bulk note list |

**Where extracted text lands** (frontend-driven "save" so we add no backend write APIs):
- `character.notes` → `POST /api/stories/{id}/characters` (upsert, app convention) with
  notes appended.
- `story.notes` → `PUT /api/stories/{id}` with `overview` appended.
- `gallery.context` → `PUT /api/stories/{id}/world/gallery` item update.
- `prose.insert` → the panel offers "Insert into chapter" → `PUT /content`.
- `clipboard` → `navigator.clipboard.writeText`; no backend round-trip.
Each pipeline's `save_targets` tells the panel which buttons to show under the result.

### 5.6 Tab → offered-pipelines map (frontend filter)
```
home        → story_overview, pitch_blurb + [I&E] + [any custom tagged 'home']
dashboard   → story_overview, plot_holes, pacing_analysis, pitch_blurb + [I&E]
world       → lore_check, mechanics_review, world_scene_ideas + [I&E]
characters  → character_trajectory, character_consistency, dialogue_voice,
              arc_trajectories + [I&E]
outliner    → plot_holes, pacing_analysis, gap_finder, arc_trajectories,
              pov_balance, twist_check + [I&E]
editor      → prose_critique, continue_writing, continuity_check, show_tell,
              dialogue_voice, pacing_analysis + [I&E]
ai (Studio) → Skill authoring UI; "test run" runs any selected custom skill
```
`GET /api/ai/pipelines?tab=editor` lets the panel fetch exactly the right set (built-ins +
enabled customs merged), but the panel can also filter client-side using the same static
map (keeps it offline-friendly).

---

## 6. Backend Changes (`backend/app/`)

### 6.1 New package `ai/` (kept out of `main.py`; routes stay in `main.py` per convention)
```
ai/
├── __init__.py
├── ollama.py       # §3 GENERIC transport + model capability registry
├── io.py           # image prep: resolve asset refs → validated base64
├── pipelines.py    # PIPELINES registry (built-ins + import/extract), merges customs
├── custom.py       # §4.5 Custom-skill registry CRUD (app-wide JSON store)
├── router.py       # §4.5 Context Router: prompt → data-store sources (LLM + fallback)
├── context.py      # §7 context builders + trimming + build_context_from_sources()
├── prompts.py      # shared system prefixes + per-pipeline templates + router prompt
├── jobs.py         # JobManager (async runner, queue, cancel, recovery)
└── store.py        # AiStore: read/write config, jobs, results via file_utils
```
- **`store.py`** is the only place that touches the `ai/` files; it uses
  `file_utils.{read,write}_json_safe` for atomicity (upholds the "no raw `open()`" rule
  while keeping `FileManager` from bloating with AI bookkeeping).
- **Context reads** go through the existing `FileManager` (characters, books, plot,
  chapters prose, world sections) so there's one source of truth.
- **`custom.py`** owns `data/custom_pipelines.json` (app-wide); per-story enablement stays
  in `ai_config.json`.

### 6.2 Schemas (`ai/schemas.py` — AI-specific, kept out of `schemas.py` to avoid bloat)
- `AIStatus` — `available: bool`, `ollama_base_url`, `models: List[ModelInfo]`
  (`ModelInfo`: `name, size, capabilities: List[str]`), `default_model`, `active_model`,
  `running_jobs: int`, `queued_jobs: int`.
- `PipelineSummary` — `id, name, description, family, input_kind, tabs,
  needs_images: bool, needs_selection: bool, save_targets, temperatures, enabled`.
- `AIConfig` — `enabled_skills: List[str]`, `model`, `ocr_model`, `vision_model`,
  `temperature_override: float|None`.
- `RunInput` — `images: List[str] = []` (asset URLs/filenames), `text: str|None` (raw
  text or selection, e.g. a pasted snippet), `params: dict|None` (`{ character_id,
  book_id, chapter_id }`).
- `RunRequest` — `story_id, skill: str (pipeline id, built-in `plot_holes` or custom
  `custom:<id>`), input: RunInput|None`.
- `AIJob` — `id, story_id, pipeline, family, status, input_summary, created_at,
  started_at, completed_at, error_message, result_path, model, steps_done`.
- `AIResult` — `pipeline, family, model, created_at, content, save_targets`.
- `CustomSkillPayload` — §4.5 fields minus `routing` provenance (server-owned).
- `CustomSkill` — payload + `routing` (with `sources`, `mode`, `routed_by`).
- `RouterDecision` — `sources: List[str]`, `params_hint: List[str]`, `reason: str`,
  `routed_by: "llm"|"fallback"`.
- `RouterRequest` — `name, description, prompt, hint: str|None`.

### 6.3 New routes (`main.py`, all under `/api/ai`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ai/status` | Ollama reachable? models (with capabilities), active model, running jobs |
| GET | `/api/ai/pipelines` | full registry (built-ins + customs); query `?tab=` filters; merged with per-story `enabled` |
| GET | `/api/ai/config/{story_id}` | per-story `AIConfig` (backfills defaults) |
| PUT | `/api/ai/config/{story_id}` | save `AIConfig` (pipeline toggles + model + ocr/vision) |
| POST | `/api/ai/run` | `RunRequest` → fires background job, returns `AIJob` (202-style) |
| GET | `/api/ai/jobs/{story_id}` | job history (newest first) |
| GET | `/api/ai/jobs/{story_id}/{job_id}` | one job status (frontend polls this) |
| POST | `/api/ai/jobs/{job_id}/cancel` | cancel a running/pending job |
| GET | `/api/ai/results/{story_id}/{pipeline}` | latest `AIResult` (resume/show-last) |
| GET | `/api/ai/custom` | list custom skills (full defs) |
| POST | `/api/ai/custom` | create a custom skill (auto-id, **routes context**, persists) |
| PUT | `/api/ai/custom/{id}` | edit a custom skill (**re-routes** unless `routing.mode=="locked"`), persisted |
| DELETE | `/api/ai/custom/{id}` | delete; GCs from stories' `enabled_skills` |
| POST | `/api/ai/custom/{id}/duplicate` | copy with new id |
| POST | `/api/ai/custom/route` | dry-run the Context Router on a draft (`RouterRequest` → `RouterDecision`) without saving — used by the Studio's "Preview sources" |

All handlers `async def`, all reads/writes via `store.py`/`FileManager`, all responses
typed with the `ai/schemas.py` models — consistent with the existing conventions in
AGENTS.md §8.

---

## 7. Context Engineering (`ai/context.py`, `ai/prompts.py`)

- Each analysis skill has a `context_builder(story_id, params, file_manager) -> dict` that
  returns the **smallest useful slice** of the story (not the whole thing). Import
  pipelines skip story context entirely — their context is the attached images (+ optional
  `params` like a target character).
- **Custom skills use the Router's output:** `build_context_from_sources(sources, params,
  file_manager)` iterates the chosen data stores and reuses the *same* per-source builders
  (§15) to stitch a context dict (`{"character": {...}, "plot": {...}, ...}`), subject to
  the shared budget. `sources==["none"]` → empty context (pure creative prompt).
- **Budget arbitration:** when a custom skill's sources exceed the budget, sources are
  trimmed by `params_hint` priority first (selected character before whole cast), then
  largest-first; the result notes "sampled N chapters".
- **Budgets:** each builder trims to `OLLAMA_CONTEXT_BUDGET_CHARS` with a per-pipeline plan —
  e.g. `plot_holes` keeps full beats + arcs + brief overview, then samples chapter prose
  (first 800 chars of each chapter, cap 5 chapters) rather than dumping 200k words.
- **Prose sampling:** helper `sample_prose(prose, cap_chars=1400)` (head + a middle + tail
  slice) so pacing/continuity skills see the shape without token blowout.
- **Serialization:** builders emit JSON dicts; `prompts.py` wraps them in a stable
  template:
  > system: "You are a professional fiction editor & continuity analyst… Follow the
  > requested output structure. Be specific and cite the JSON context. Reply in Markdown."
  > user: `Story context (JSON):\n{...}\n\nTask: {skill-specific instruction}\nOutput:`
- **Determinism:** `temperature` per pipeline (0.2 analysis, 0.8 creative). Ask the model to
  structure output (tables, headers) the panel can render.
- **No secrets/external calls:** contexts and images contain only user fiction; nothing
  leaves the machine.

---

## 8. Async Execution Model (`ai/jobs.py`)

**Non-goal:** near-realtime streaming. **Goal:** click → immediate ack → background work
→ user keeps using the app → poll shows "done".

- `JobManager` is a module-level singleton (like `file_manager`). In-memory `dict` of
  active jobs; job history + results always persisted to `ai/jobs/` + `ai/results/` so
  they survive restarts.
- Lifecycle:
```
enqueue(story_id, pipeline_id, run_input)
  ├─ validates & stages input: images resolved to base64 by ai/io.py,
  │    selection resolved to story params; fail fast (no job) on bad input
  ├─ create AIJob{status:"pending", steps_done:0} → persist → return immediately
  └─ asyncio.create_task(run_job(job))
run_job(job):
  set status:"running", started_at, persist
  images = await asyncio.to_thread(prepare_images, ...)   # disk read off-loop
  if pipeline is custom and routing.mode == "auto":
      routing = await ollama.complete(router_request(custom))   # optional re-route
  for idx, step in enumerate(pipeline.steps):
      context = await asyncio.to_thread(build_context, step, ...)  # sync FileManager reads
      content  = await ollama.complete(OllamaRequest(... step, images ...))  # async httpx
      (optional post_process; step output feeds next step)
      job.steps_done = idx+1 ; persist                       # progress granularity
  final = last non-empty step output (or joined, per pipeline spec)
  store result → ai/results/<pipeline>.json (+ history job file)
  status:"done", completed_at, persist
  on asyncio.CancelledError: status:"cancelled", persist partial, re-raise
  on Exception:             status:"error" + error_message (Ollama-down hint, API, timeout)
```
- **Isolation:** Ollama calls are `await`-ed async HTTP (event loop stays free; autosave
  PUTs, world saves proceed). File reads are offloaded with `asyncio.to_thread`;
  `file_utils` locks make concurrent saves safe.
- **Concurrency:** **one running job per story** (Ollama serializes generations anyway).
  Extra runs queue up (`queue.json`), run sequentially; `queue_position` returned at
  enqueue. `GET /api/ai/jobs` surfaces queue depth.
- **Step progress:** `progress = steps_done / len(steps)` → panel labels
  ("Routing context…" for custom `mode:auto`, then per-step →
  "Extracting text…" vs "Asking the editor…" vs "Cleaning up…").
- **Cancellation:** `cancel` → `task.cancel()`; mark `cancelled` + persist partial result
  if any tokens arrived.
- **Startup recovery:** on `startup` hook, jobs left `pending/running` are marked
  `interrupted` (crash-safe), so the UI never shows a stuck spinner.
- **Memory safety:** job count capped (e.g. 50 persisted per story per day); results
  pruned to newest 1 per pipeline + last 20 jobs. Keeps `data/` from growing unbounded.

---

## 9. Frontend Changes

### 9.1 State + hotkeys (`StoryContext.jsx`)
- Add `aiPanelOpen / setAiPanelOpen` (alongside `quickSearchOpen`).
- Add hotkey **`Ctrl/Cmd+Shift+A`** (and `Esc` closes) to the existing hotkey effect.

### 9.2 Navbar button (the "AI suggestion button")
- New accent-tinted button (Sparkles / Bot icon) labelled **"AI"** next to Drive Backup.
- Static badge shows Ollama status dot (green local / red offline), polled from
  `GET /api/ai/status` on open + every 15s while panel open.

### 9.3 Main component `AIPanel.jsx` (right-side drawer, mounted in `MainLayout`)
Reuses the app's visual system (`--bg-panel`, `--border-color`, `--accent`, `glass-panel`,
`animate-in`). Fixed `inset-y-0 right-0 w-[420px] z-40 border-l`, slides over content;
focus mode unaffected.

**Panel structure:**
- Header: "AI Studio", Ollama status dot, model `<select>` (from `/api/ai/status`, grouped
  by capability — "text · vision · OCR"), close X.
- **Skill section header** = current tab name (reads `activeTab`), subtitle
  "Skills for Character Roster" etc.
- Skill cards (filtered by tab, §5.6). Each card:
  - Name + description; per-story **enable toggle** (persists via `PUT /api/ai/config`);
    a disabled skill is greyed and cannot run.
  - **Run button** ("AI Suggestion") → `POST /api/ai/run` → begins polling
    `GET /api/ai/jobs/{story}/{job}` every 2s → spinner + elapsed + step label.
  - **Result area:** when `done`, fetch `GET /api/ai/results/{story}/{pipeline}` and render
    with `react-markdown` (analysis answers are markdown). "Run again" + timestamp shown.
  - On `error`: inline error box with the Ollama hint.
- **"Import & Extract" section** (always visible, §5.5). Each card additionally shows:
  - an **image attachment zone** (click/paste/drag) whose hits call
    `POST /api/stories/{id}/assets/upload` (existing route), previewing the returned
    asset URLs as thumbnails; capped at the pipeline's `max_images`.
  - on result: **save-back buttons** from `save_targets` —
    "Save to character notes", "Save to story overview", "Set as gallery caption",
    "Insert into chapter", "Copy"; these call the existing REST endpoints (§5.5).
- Footer pills: "1 job running", "queued: 0", Cancel-all.

### 9.4 Per-view contextual buttons (optional but nice)
Each module header gets a small Sparkles pill that opens the panel **already filtered to
that tab**:
- `DraftEditorView`: "AI Critique" → runs `prose_critique` for the open chapter.
- `CharacterRosterView`: "AI Trajectory" → runs `character_trajectory{character_id}`;
  "Scan my handwriting" → opens `handwriting_ocr` with the character selected as default
  `character.notes` target.
- `BookOutlinerView`: "Scan Plot Holes" → runs `plot_holes`.
- `WorldbuildingView`: "Lore Check" → runs `lore_check`; gallery tab → "Caption concept
  art" → `concept_art_caption`.
- `DashboardView`: "Story Insight" → runs `story_overview`.
These are thin conveniences — each just sets `aiPanelOpen=true` + preselected pipeline. All
logic stays in the panel (AGENTS §10 duplication warning applies — do not copy async
logic into views).

### 9.5 No interference guarantees
- Panel is a pure overlay (z-40); never re-mounts or swaps `activeTab`.
- Polling uses `setInterval` inside effect cleanup — no overlap, no state writes to
  story/theme contexts.
- `DraftEditorView` autosave debounce untouched.
- New dependency: `react-markdown` (+ `remark-gfm` optional) — the single new frontend
  dep, needed to render analysis output properly.

### 9.6 NEW TAB — `SkillStudioView.jsx` (`activeTab: 'ai'`, "AI Studio" in the sidebar)
Registered the same way as every other module (AGENTS §8 Frontend #6):
- **`Sidebar.jsx`** `NAV_ITEMS` gains `{ id: 'ai', label: 'AI Studio', icon: Bot, desc:
  'Create & edit AI skills' }` (placed after `editor`).
- **`App.jsx`** `renderActiveModule()` switch gains `case 'ai': return <SkillStudioView />`.
- `main` layout width: Studio is a workbench, rendered with a wide max-width (not the
  `max-w-4xl` editor constraint).

**Layout (two columns):**
1. **Custom skills list** (left): cards from `GET /api/ai/custom` — name, description,
   model-family pill, tabs chips, routing-mode badge (`auto`/`locked`), last-updated.
   Buttons: **New skill**, **Duplicate**, **Edit**, **Delete** (confirm). A small footer
   note shows built-ins are read-only here (they're managed in code).
2. **Editor panel** (right, shows when creating/editing):
   - Name, Description, Prompt (large textarea; hint chips for `{{story_context}}`,
     `{{characters}}`, `{{open_chapter}}` placeholders).
   - Structural: model family (`text|vision|ocr`), temperature, input kind
     (story context / selection / text / images + max images), visibility **tabs**
     (checkbox grid + "everywhere"), optional save targets.
   - **Data sources group:** an "author hint" dropdown; **"Preview sources"** button →
     `POST /api/ai/custom/route` → the **Context Router result** renders as review chips
     (source names + reason line + `routed_by` badge). Chips are editable; "Lock routing"
     sets `mode:"locked"` so edits/prompt changes won't silently re-route.
   - **Test run** button → `POST /api/ai/run` for the current story with the draft saved
     as a temp skill → shows the poll/result inline (reuses the panel's poll logic).
   - Save / Cancel (footer). Save = `POST` or `PUT /api/ai/custom[/{id}]`, which re-routes
     (unless locked) and persists.
**Hotkey:** `⌘⇧A` opens the AI *panel* from anywhere; the Studio tab is navigated to via
the sidebar (no extra hotkey needed).

---

## 10. Config Summary (env vars)
| Var | Default | Meaning |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama daemon |
| `OLLAMA_DEFAULT_MODEL` | `qwen3.5:9b` | First-selected model (analysis) |
| `OLLAMA_OCR_MODEL` | `glm-ocr:latest` | OCR engine for import pipelines |
| `OLLAMA_VISION_MODEL` | `minicpm-v:latest` | General vision (captioning) |
| `OLLAMA_ROUTER_MODEL` | `qwen3.5:9b` | Context Router (json, temp 0) |
| `OLLAMA_TIMEOUT_S` | `300` | Per-generation timeout |
| `OLLAMA_CONTEXT_BUDGET_CHARS` | `40000` | Context trim budget |
| `OLLAMA_TEMPERATURE` | `0.2` | Analysis default (skills may override) |
| `OLLAMA_MAX_IMAGES_PER_RUN` | `6` | Ceiling for image input |

---

## 11. Implementation Phases (gated — load the NEXT phase only after THIS one is verified)

**Working rule:** each phase heads a living document up to §X. When we start implementing,
each phase is built, manually verified (§18 → that phase's checklist), and only **then**
is the next phase loaded and worked on. No phase starts while the previous one is open.

| # | Phase | Scope (ends at) | Depends on | Gate = checklist §18 |
|---|---|---|---|---|
| 0 | **Generic transport** | `ai/ollama.py` (typed req/resp, capabilities, vision/OCR detection), `ai/io.py`, `ai/prompts.py` skeleton, `GET /api/ai/status`. | — | Phase 0 |
| 1 | **Jobs infra** | `ai/store.py`, `ai/jobs.py` (multi-step, `steps_done` progress, FIFO queue/story, cancel, restart recovery), `ai/pipelines.py` registry, run/jobs/cancel routes. | 0 | Phase 1 |
| 2 | **Seed built-in skills** | `ai/context.py` (builders + `build_context_from_sources` + budget), `story_overview`, `plot_holes`, `character_trajectory` + results route. | 1 | Phase 2 |
| 3 | **AI panel + run UX** | StoryContext state/hotkey, Navbar AI button + status dot, `AIPanel` drawer (tab filters, toggles, run/poll, `react-markdown`), config routes. | 1, 2 | Phase 3 |
| 4 | **Import & Extract (OCR)** | `handwriting_ocr`, `concept_art_caption`, `sticky_notes_dump` with image attachment + save-back. Verify against real photos. | 1, 3 | Phase 4 |
| 5 | **Skill Studio + Context Router** | `ai/custom.py`, `ai/router.py` (LLM routing + keyword fallback), custom CRUD + route endpoints, `SkillStudioView` tab + routing chips + test run. **Custom skills now appear in the panel catalog.** | 1, 2, 3 | Phase 5 |
| 6 | **Full built-in catalog + pills** | remaining 15 built-in skills, per-view AI pills, `?tab=` filtering polish, empty-Ollama UX, capability-override escape hatch. | 2, 3 | Phase 6 |
| 7 | **Polish** (optional) | queued-run status UI, cancel-all, result history view, "summarize since last run" delta prompts, markdown export of results. | all | Phase 7 |

Notes: Phase 7 is optional/nice-to-have; 0–6 are the delivery path. Phases 4 and 5 are
sized as isolated verticals so each is independently testable. Total ≈ 7–9 focused units.

---

## 12. Risks & Open Questions

- **Model choice/cost:** `qwen3.5:9b` is the default (installed). `gemma4:26b` (17 GB) is
  sharper but slower on CPU/limited RAM. Model is selectable per run + per story — no
  hard-coded pick. OCR/vision are separate (`glm-ocr`, `minicpm-v`), both installed.
- **`qwen3.5:9b` is a reasoning model** (confirmed Phase 0): `message.content` stays empty
  while it thinks, the chain lives in `message.thinking`, and a too-small `num_predict`
  truncates mid-thought (`done_reason: "length"`, empty content). So: leave `num_predict`
  unset by default (Ollama picks), or size it generously; `options.think=false` reliably
  disables reasoning for output-only jobs (verified).
- **Ollama availability:** gracefully degrade to an "Ollama is offline" state everywhere.
  First-run hint: `ollama serve` + `ollama pull <model>`.
- **OCR accuracy:** handwriting quality varies; the 2-step OCR + cleanup design mitigates
  noise, and `prompt_eval_count`/`eval_count` are stored so quality regressions are
  debuggable. `glm-ocr` may need a `num_ctx` bump for dense sheets — options dict is
  configurable per step.
- **`react-markdown` dependency:** locked — will be added (`react-markdown` +
  `remark-gfm`). This is the only new frontend package; it renders analysis output.
- **Context size on huge stories:** solved with §7 budgets/sampling; worst case →
  report "story too large, check fewer chapters".
- **No DB:** all AI state is JSON files under `data/stories/<slug>/ai/` (git-ignored with
  the rest of `data/`). Quotas (§8) keep it flat.
- **Pipeline registry is additive:** stable ids mean existing `config.json` files don't
  break when new pipelines ship (new ones default to enabled for stories without a
  `config.json`).
- **Capability detection is heuristic:** a registry + regex fallback may misjudge a brand
  new exotic model; a manual per-model capability override in `AIConfig.capability_overrides`
  (not yet in schema) is the escape hatch — flagged for Phase 6.
- **Context Router quality:** relies on a local LLM for smart grounding; the keyword
  fallback guarantees the Studio still works offline. Routing is reviewable ("Preview
  sources") and lockable; worst case the author picks sources manually. Router output is
  cached with each custom skill so it's paid for once, not per run.
- **Custom-skill prompt injection:** prompts are user-authored and run locally only; no
  risk to other users. Prompts may reference `{{story_context}}` — verify a skill that
  omits it still gets context attached by default (it does — context is prepended unless
  `input_kind=="text"`).

### Resolved question log
| Question | Decision |
|---|---|
| Client genericity | Transport only: typed `OllamaRequest` (text + base64 images, format hints), model-by-capability, one `complete()` entry point |
| Result rendering | `react-markdown` (+`remark-gfm`) |
| Multiple jobs per story | FIFO queue, 1 runner per story |
| Polling cadence | 2s fixed while a job is running |
| Result persistence | JSON in `ai/results/` per pipeline (markdown export is a later nicety) |
| Handwritten-image upload path | Reuse the existing `/assets/upload`; AI runs reference asset URLs, backend base64-encodes locally |
| New tab for custom skills | `activeTab:'ai'` → `SkillStudioView`, registered in `NAV_ITEMS` + App switch (per AGENTS §8 Frontend #6) |
| Skill edit surface | Studio CRUD (`/api/ai/custom`); built-ins are read-only code |
| "Which data stores to use" | Context Router pipeline (LLM + keyword fallback), eager by default, editable + lockable chips |
| Delivery model | Gated phases (§11); next phase loads only after the current one verifies (§18) |
| Reasoning model | `qwen3.5:9b` thinks by default; leave `num_predict` unset or use `options.think=false` (both verified on the transport) |

---

## 13. API Contract Examples (concrete payloads)

### 13.1 `GET /api/ai/status`
```json
{
  "available": true,
  "ollama_base_url": "http://localhost:11434",
  "models": [
    {"name": "qwen3.5:9b",       "size": "6.6 GB", "capabilities": ["text"]},
    {"name": "gemma4:26b",       "size": "17 GB",  "capabilities": ["text"]},
    {"name": "qwen2.5-coder:latest","size": "4.7 GB","capabilities": ["text","code"]},
    {"name": "minicpm-v:latest", "size": "5.5 GB", "capabilities": ["text","vision"]},
    {"name": "glm-ocr:latest",   "size": "2.2 GB", "capabilities": ["text","vision","ocr"]},
    {"name": "qwen2.5:7b",       "size": "4.7 GB", "capabilities": ["text"]}
  ],
  "default_model": "qwen3.5:9b",
  "ocr_model": "glm-ocr:latest",
  "vision_model": "minicpm-v:latest",
  "running_jobs": 0,
  "queued_jobs": 0
}
```
Capabilities come from §3.3 (registry + heuristic). Backend caches `models` for 30s
(Ollama `/api/tags` is cheap but the status route is polled). When offline:
`{"available": false, "error_hint": "Start it with: ollama serve"}`.

### 13.2 `GET /api/ai/pipelines?tab=characters&story_id=<slug>`
Returns `List[PipelineSummary]`, only pipelines whose `tabs` includes `characters` (plus
always the `import` family when requested), each merged with the story's `enabled` flag:
```json
[
  {
    "id": "character_trajectory",
    "name": "Character Trajectory Recommendation",
    "description": "Recommended arc, milestones, conflicts, motivation refocus",
    "family": "analysis",
    "input_kind": "selection",
    "tabs": ["characters"],
    "enabled": true,
    "needs_selection": true,
    "needs_images": false,
    "save_targets": []
  },
  {
    "id": "handwriting_ocr",
    "name": "Handwriting → Text",
    "family": "import",
    "input_kind": "images",
    "tabs": ["import", "characters"],
    "enabled": true,
    "needs_selection": false,
    "needs_images": true,
    "max_images": 6,
    "save_targets": ["character.notes","story.notes","overview","clipboard"]
  }
]
```
`needs_selection: true` → panel disables Run until a character/chapter/book is current in
that tab. `needs_images: true` → Run is disabled until ≥1 image is attached.

### 13.3 `GET/PUT /api/ai/config/{story_id}`
```json
{ "enabled_skills": ["story_overview","plot_holes","handwriting_ocr"],
  "model": "qwen3.5:9b",
  "ocr_model": "glm-ocr:latest",
  "vision_model": "minicpm-v:latest",
  "temperature_override": null }
```
Backfill rule: missing file → `enabled_skills` = all pipeline ids, models = defaults.

### 13.4 `POST /api/ai/run`
Request (analysis skill):
```json
{ "story_id": "my-book", "skill": "character_trajectory",
  "input": { "params": { "character_id": "arya" } } }
```
Request (handwriting OCR — images are the story's existing asset URLs):
```json
{ "story_id": "my-book", "skill": "handwriting_ocr",
  "input": { "images": ["/api/stories/my-book/assets/scan-1.png"],
             "params": { "character_id": "arya" } } }
```
Response (job created, 202):
```json
{ "id": "9f3c…", "story_id": "my-book", "pipeline": "handwriting_ocr",
  "family": "import", "status": "pending", "created_at": "2026-08-29T19:00:00Z",
  "model": "glm-ocr:latest", "steps_done": 0, "input_summary": "1 image",
  "queue_position": 0, "error_message": null, "result_path": "" }
```
If Ollama is offline → 503 with `{"detail": {"pipeline", "hint"}}`; if an image can't be
resolved/decoded → 400 listing the bad ref.

### 13.5 `GET /api/ai/jobs/{story_id}/{job_id}` (poll target)
```json
{ "id": "9f3c…", "status": "running", "started_at": "…", "completed_at": null,
  "progress": 0.5, "steps_done": 1, "steps_total": 2, "stage": "Cleaning up…",
  "error_message": null, "model": "qwen3.5:9b" }
```
`progress`: 0 = pending, `steps_done/steps_total` while running, 1.0 = done. `stage` is
derived server-side from the current step's prompt key ("Extracting text…",
"Cleaning up…", "Asking the editor…").

### 13.6 `GET /api/ai/results/{story_id}/{pipeline}`
```json
{ "pipeline": "character_trajectory", "family": "analysis", "model": "qwen3.5:9b",
  "created_at": "…", "content": "## Recommended arc\n\n…", "save_targets": [] }
```
`content` is full markdown (rendered client-side). Runs append to `ai/jobs/` history; this
route returns the newest `done` result for the pipeline. For import pipelines, `content`
is the extracted/cleaned text (same render path, plus save-back buttons).

### 13.7 `POST /api/ai/jobs/{job_id}/cancel`
```json
{ "ok": true, "new_status": "cancelled", "partial_available": true }
```

### 13.8 `POST /api/ai/custom/route` — Context Router dry-run (Studio "Preview sources")
Request:
```json
{ "name": "Vow Check", "description": "Check oaths and promises across the plot",
  "prompt": "List every sworn vow in the story, who made it, and whether it was "
            "ever followed through. Flag broken vows.",
  "hint": "plot & structure" }
```
Response:
```json
{ "sources": ["plot","characters","arcs"],
  "params_hint": [],
  "reason": "Vows bind plot events to characters; needs beats + arcs to track payoff.",
  "routed_by": "llm" }
```

### 13.9 `POST /api/ai/custom` — create a Skill-Studio skill
Request: `CustomSkillPayload` (name, description, prompt, model_family, temperature,
input_kind, tabs, save_targets, hint) — the `routing` block is set server-side.
Response (201):
```json
{ "id": "custom-vow-check", "name": "Vow Check", "description": "…",
  "prompt": "…", "model_family": "text", "temperature": 0.2,
  "input_kind": "story_context", "tabs": ["outliner","dashboard"], "max_images": 0,
  "save_targets": [],
  "routing": { "mode": "auto", "sources": ["plot","characters","arcs"],
               "params_hint": [], "routed_at": "…", "routed_by": "qwen3.5:9b" },
  "created_at": "…", "updated_at": "…" }
```
`PUT /api/ai/custom/{id}` behaves identically but preserves `routing` when
`routing.mode=="locked"`. `DELETE` returns `{"deleted": true, "purged_from_stories": 2}`.

### 13.10 Running a custom skill (`POST /api/ai/run`)
```json
{ "story_id": "my-book", "skill": "custom-vow-check",
  "input": { "params": {} } }
```
Job pipeline id echoes `custom-vow-check`; `family: "analysis"`. The job runner assembles
context from `routing.sources` via `build_context_from_sources` before the single prompt
step. If `mode=="auto"`, a router pass happens first (§8).

---

## 14. Per-Pipeline Prompt & Output Spec (authoring reference)

Shared system prefix per skill family:
- **Analysis:** "You are a senior fiction editor and continuity analyst for the story
  described in the JSON context below. Be concrete, cite the context, never invent
  events. Answer in Markdown using the requested structure. If nothing is wrong, say so."
- **Creative:** "…literary stylist. Match the voice of the provided prose. Do not
  summarize; produce usable text."

| skill | Task instruction (user prompt) | Required output structure |
|---|---|---|
| `story_overview` | "Summarize the story from its context. List stated themes, strengths, and 3 watch-outs a first reader or beta reader might hit." | `## Synopsis` / `## Themes` / `## Strengths` / `## Watch-outs` |
| `plot_holes` | "Find plot holes, unresolved setups, and logic gaps. A hole = something established earlier that contradicts or goes unused later. Rule out benign gaps." | `### Hole 1 **severity** — where · why · **suggested fix**` … / `## No holes found` fallback |
| `pacing_analysis` | "Score pacing per beat/chapter arc from word counts. Identify sagging or rushed stretches and their beats." | `## Pacing notes` / `## Sagging` / `## Rushed` / `## Beat rhythm` |
| `pitch_blurb` | "Write one logline, three blurbs (25 / 50 / 100 words), and one hook line, all genre-faithful." | `## Logline` / `## Blurb 25 / 50 / 100` / `## Hook` |
| `lore_check` | "Cross-check glossary, cities, factions, artifacts, mechanics, and character timelines for internal contradictions, undefined rules, or date/era jitter." | `## Contradictions` / `## Undefined rules` / `## Timeline notes` |
| `mechanics_review` | "Review the magic/tech system for rule gaps, deus-ex-machina risk, and power-balance drift across mechanics + artifacts." | `## Rule gaps` / `## Deus-ex risk` / `## Power balance` |
| `world_scene_ideas` | "For each city/faction, give 2–3 concrete, scene-settable sensory or social details that make it alive." | `### <city/faction>` bullet lists |
| `character_trajectory` | "Recommend the next arc segment for <char>: motivation gaps, 2–3 milestones, a believable conflict to force growth, and how it touches the story theme." | `## Motivation gap` / `## Suggested milestones` / `## Conflict engine` / `## Theme tie-in` |
| `character_consistency` | "Compare the character's profile to every prose excerpt where they appear. List contradictions, trait drift, forgotten facts." | `### Contradiction — <chapter>` quotes + fix |
| `dialogue_voice` | "Build a voice profile from the character's dialogue. Give 3 consistent verbal tics and 2 rewrite examples that fight flat dialogue." | `## Voice profile` / `## Tics` / `## Rewrites` |
| `gap_finder` | "Find dangling threads: subplot setups with no payoff, introduced-but-unused items, beats that don't follow their causes." | `## Dangling threads` / `## Unused setups` / `## Missing bridges` |
| `arc_trajectories` | "Assess every character arc against the beats they appear in. Flag arcs that stall or jump, and recommend a next milestone." | `### <char>` — `stalled|on-track|jumped` + next milestone |
| `pov_balance` | "From POV + word counts, show distribution. Flag under-used POVs and long POV droughts between appearances." | `## Distribution table` / `## Droughts` / `## Suggestions` |
| `twist_check` | "For each twist/reveal beat, list what setup the reader already has and what's missing for it to be fair." | `### Twist — setup ✓ / missing ✗ / payoff timing` |
| `prose_critique` | "Critique the provided chapter: quote line numbers. 3 strengths, 5 concrete cuts/rewrites, 1 sentence on voice." | `## Strengths` / `## Cuts & rewrites (quote → fix)` / `## Voice` |
| `continue_writing` | "Continue the scene in the same voice for 2–3 paragraphs, advancing toward the attached beat (if any)." | Continuation prose only |
| `continuity_check` | "Compare chapter to its plot beats + book plot. List deviations, dropped beats, and accidental retcons." | `## Deviations` / `## Dropped beats` / `## Retcons` |
| `show_tell` | "Point to specific tell sentences and give 1-line show alternatives." | `### Told → shown` pairs |
| `handwriting_ocr` | Step 1: "Transcribe the handwritten text in the image verbatim, preserving structure." Step 2: "Clean the transcription: fix obvious OCR noise, normalize lists, return as `{notes: [..]}` with `format:'json'` when grammar requested." | Raw → cleaned structured text |
| `concept_art_caption` | Step 1: "Describe this concept art in 2–3 sentences: subject, mood, palette, key details." Step 2 (polish): "Rewrite the caption in lore-appropriate, gallery-ready prose." | Caption markdown |
| `sticky_notes_dump` | Step 1: "Transcribe every sticky note from the photo." Step 2: "Group duplicates, merge fragments, drop illegible, output a tidy list." | Grouped bullet list |

---

## 15. Context Builder Algorithms (`ai/context.py`)

Every builder returns a JSON-outline dict; nothing exceeds `CONTEXT_BUDGET`.

| builder | Steps (each trimmed to a char cap; caps sum ≈ budget) |
|---|---|
| `story_overview` | overview[] (≤4000) + tags/theme + mechanics (≤2500) + city/faction/artifact head counts + first 1500 chars each of ≤2 chapter openings. |
| `plot_holes` | all books: books' plot_subsections → beats (full, ≤12000) + arcs (full, ≤8000) + overview (≤3000) + sampled prose (≤1400/ch, ≤5 ch). |
| `pacing_analysis` | beats (id, title) + chapter rows (title, word_count, pov) as a compact table (≤8000) + note of chapters > 1.5× median. |
| `pitch_blurb` | overview (≤3000) + premise line from book/plot theme + opening 1200 chars of book 1 ch 1. |
| `lore_check` | glossary (all ≤6000) + cities (≤5000) + factions (≤5000) + mechanics (≤2500) + artifacts (≤4000) + timeline events (≤4000). |
| `mechanics_review` | mechanics (≤3000) + artifacts w/ timeline (≤6000) + glossary terms tagged "magic/rule" (≤3000). |
| `world_scene_ideas` | cities (all ≤6000) + factions (≤4000). |
| `character_trajectory` | target character full (bio/notes/timeline ≤6000) + their arcs across books (≤4000) + beats where `character_ids` includes them (≤6000) + appearances matrix (≤2000). |
| `character_consistency` | target char profile (≤4000) + prose excerpts from chapters where `pov_character_id` or appearances flagged (≤1400/ch, ≤4 ch). |
| `dialogue_voice` | char role/bio (≤2500) + quoted dialogue lines pulled from prose (regex for `"…"` runs, ≤4000) + one sample scene (≤2000). |
| `gap_finder` | beats + plot_subsections full (≤12000) + arcs (≤6000) + timeline events (≤3000). **Heuristic input:** beats/items whose id appears ≤1 time across the whole outline ("appear once" = likely dangling). |
| `arc_trajectories` | all arcs full (≤9000) + beats mapping character_ids (≤12000). |
| `pov_balance` | chapters table (title, pov, word_count) all books (≤12000). |
| `twist_check` | beats full (≤12000) + theme + scene_breakdown text for flagged beats (≤4000). |
| `prose_critique` | current chapter full (≤CONTEXT_BUDGET−2000) — the target text gets the largest slice. |
| `continue_writing` | current chapter tail (last 3000) + following beat description (≤1500) + style cues (≤1500). |
| `continuity_check` | current chapter (≤6000) + its book beats (≤5000) + arcs of POV char (≤3000). |
| `show_tell` | current chapter full (≤CONTEXT_BUDGET−2000). |

Sampling helper `slice_span(text, cap)`: head 40% + middle 30% + tail 30%, joined with
`[…]`, preserving word boundaries. `word_count`-aware truncation avoids cutting mid-word.

---

## 16. UI Wireframe (`AIPanel.jsx` — right drawer, w-[420px])

```
┌──────────────────────────────┐   ┌────────────────────────────────┐
│ Editor header…               │   │ AI Studio             ● live ✕ │
│                              │   │ Model: [ qwen3.5:9b ▼ ]        │
│   main content (unaffected)  │   ├────────────────────────────────┤
│                              │   │ CHARACTER ROSTER               │
│                              │   │┌──────────────────────────────┐│
│                              │   ││ Character Trajectory  [○] Run││
│                              │   ││ Recommended arc from notes   ││
│                              │   ││ and appearances. ────────────││
│                              │   ││ ⟳ Reading your story… 0:12s   ││
│                              │   │└──────────────────────────────┘│
│                              │   │┌──────────────────────────────┐│
│                              │   ││ Character Consistency   [●] ✓││
│                              │   ││ … ◀ latest result shown      ││
│                              │   │└──────────────────────────────┘│
│                              │   │ IMPORT & EXTRACT               │
│                              │   │┌──────────────────────────────┐│
│                              │   ││ Handwriting → Text  ┌───────┐││
│                              │   ││ [  + Add image(s)    │ thmb  │││
│                              │   ││  ▼ scanned sheet ]  └───────┘││
│                              │   ││ [○] Extract      [Run ▸]     ││
│                              │   ││ done: Save to char notes ✔  ││
│                              │   │└──────────────────────────────┘│
├──────────────────────────────┘   │ … Concept Art → Caption  [○]   │
                                   │                                │
                                   │ footer: [⏳ 1 running] [Cancel] │
                                   └────────────────────────────────┘
```
- Drawer chrome: `fixed inset-y-0 right-0 w-[420px] z-40 border-l border-[var(--border-color)]
  bg-[var(--bg-panel)] backdrop-blur-xl shadow-2xl animate-in slide-in-from-right` (Tailwind v4
  animate-in family is already used by modals).
- Collapses to `w-full max-w-[420px]` on small screens; closes on Esc / outside click.
- Pipeline card states: `enabled off` (grey, no Run) · `enabled idle` (Run) · `running`
  (spinner + step label + elapsed) · `done` (result + "Run again" [+ save-back buttons for
  imports]) · `error` (inline box, retry).

### 16.1 Skill Studio wireframe (`SkillStudioView.jsx` — `ai` tab, full-width workbench)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AI STUDIO                                    [ + New skill ]        readonly │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ Your skills                   │ Untitled skill                          Save │
│ ┌───────────────────────────┐ │ Name [ Vow Check                     ]     │
│ │ Vow Check           text  │ │ Desc [ Check oaths and promises…     ]     │
│ │ custom-vow-check · auto  ✎ │ │ Prompt                               ……   │
│ └───────────────────────────┘ │ ▸ {{story_context}} → inject routed data    │
│ ┌───────────────────────────┐ │ ┌───────────────────────────────────────┐ │
│ │ Revision Sniffer    text  │ │ │ Prompt text …                         │ │
│ │ custom-rev-sniff · locked │ │ └───────────────────────────────────────┘ │
│ └───────────────────────────┘ │ Model [ text ▼ ]  Temp [ 0.2 ]           │
│ Built-ins (read-only)  ⓘ    │ Input: (○ story ● selection ○ images)      │
│  ▸ plot_holes · pacing…      │ Show in: [x] home [x] dashboard [x] outlr. │
│                              │ Author hint [ plot & structure ▼ ]        │
│                              │ [Preview sources ▸]                       │
│                              │ Sources: [plot] [characters] [arcs]  ↻  ⚿ │
│                              │    "Vows bind plot to characters…" (llm)  │
│                              │ [ Test run ▸ ]  ⟳ Vow Check… 0:00         │
└───────────────────────────────┴─────────────────────────────────────────────┘
```
- Left column: custom-skill cards (name, family pill, routing-mode badge, edit/dup/delete).
  Built-in skills shown read-only below.
- Right column: the editor form + **routing chips** (Context-Router output, editable,
  "🔒 lock" toggle) + test-run output.
- `hint` dropdown feeds the Router; `Preview sources` is the §13.8 dry-run.

---

## 17. Error-Handling Matrix

| Situation | Backend behavior | Panel UX |
|---|---|---|
| Ollama daemon down (conn refused/timeout) | `/status` → available:false; `/run` → 503 + hint | Red dot; cards show "Ollama offline"; Run disabled; hint box "start with `ollama serve`" |
| Model missing (e.g. picked a name not pulled) | `/run` → 400 `{model_missing}` | Model selector warns; "Consider `ollama pull …`" |
| Vision/OCR pipeline but no vision model installed | capability resolution fails w/ 400 + `{need:"vision", have:[...]}` | Card warns "No vision model installed"; lists installed |
| Image ref not in story assets / bad file | `/run` → 400 `{bad_images:[...]}` | Attached thumbnail marked invalid, Run disabled until fixed |
| Image too large or > max_images | `/run` → 400 (cap exceeded) | Truncation note on upload; thumbnails enforce the cap |
| Generation times out (300s) | job → `error` `timeout` | Error box + "Run again" |
| A pipeline step fails after earlier steps | job → `error`, partial steps kept; earlier step output still readable | Error box + "View partial" |
| Malformed/empty model output | falls back to raw text result; never empty JSON | Result shows raw text, flagged "raw" |
| Story missing / deleted mid-run | job → `error` | Box with story name; panel continues for others |
| Context exceeds budget | builder trims to caps (never fails); last resort reduces chapter samples | Possible note "sampled N chapters" in result header |
| Backend restart while running | startup recovery marks jobs `interrupted` | Panel shows interrupted badge with "Run again" |
| Duplicate rapid clicks on Run | queue position returned; button becomes queue chip "Queued #1" | Queue chip until executing |
| Router unreachable / malformed JSON on skill save | `route()` falls back to keyword matcher, `routed_by:"fallback"`; save still succeeds | Studio chips show "(rule-based, llm offline)" badge; user can lock sources |
| Custom-skill prompt unchanged after a re-route | only `updated_at` bumps; routing stored as-is | Routing chips refresh without disturbing locked ones |
| Editing a locked skill | backend skips re-route entirely | Studio shows "Routing locked" |

---

## 18. Verification & Acceptance Checklist (manual, per AGENTS §7)

Phase 0 (generic client)
- [ ] `curl localhost:8000/api/ai/status` lists the 6 installed models with correct
      capabilities (glm-ocr → ocr, minicpm-v → vision, text models → text); `available:true`.
- [ ] Kill `ollama` → status flips to `available:false`; restart → recovers.
- [ ] Direct vision check: run `handwriting_ocr` back-to-back on a sample scan via `curl`
      against a story asset → base64 round-trip works, `glm-ocr` returns text.

Phase 1 (jobs infra)
- [ ] `POST /run` on a tiny story returns 202 instantly (< 50ms) with a job id.
- [ ] While a job runs, autosave PUT, world PUT, and story list still respond fast.
- [ ] `GET /jobs/{id}` transitions pending → running → done with persisted files under `ai/jobs/`.
- [ ] Multi-step job reports `steps_done` incrementing and `stage` labels track the step.
- [ ] `POST /cancel` on a running job flips to cancelled; restart uvicorn mid-run → job shows
      `interrupted`, panel offers rerun.
- [ ] Two rapid runs → second reports `queue_position: 1`, runs after the first.

Phase 2 (seed skills)
- [ ] `story_overview`, `plot_holes`, `character_trajectory` produce structured markdown cached in `ai/results/`.
- [ ] Bad image ref / non-image file → 400 with `bad_images:[...]`; no job created.
- [ ] Deleting a still-open story cleans its `ai/` dir (delete_story already removes the whole dir).

Phase 3 (panel)
- [ ] ⌘⇧A opens/closes panel from every tab; panel header shows live status dot.
- [ ] Pipeline list changes with `activeTab` (editor shows prose skills, outliner shows beats/arcs).
- [ ] Toggling a skill persists via `PUT /api/ai/config` and survives reload.
- [ ] Run → 2s polling → markdown renders; navigating tabs mid-run doesn't cancel the job.

Phase 4 (OCR/import)
- [ ] Upload a handwritten photo via the panel's attachment zone (reuses `/assets/upload`)
      → thumbnail preview → run → extracted text renders → "Save to character notes" appends
      to the chosen character's notes (verify via `/characters`).
- [ ] Concept art → caption flow writes into a gallery item's `context`.
- [ ] Sticky-notes photo (multi-image) → grouped bullet list → Copy works.
- [ ] Saving to prose inserts into the open chapter and re-derives `word_count`; autosave
      still behaves normally.

Phase 5 (Skill Studio + Context Router)
- [ ] Sidebar shows "AI Studio"; `setActiveTab('ai')` renders SkillStudioView; nav works
      from the home page across themes; focus mode unaffected.
- [ ] Create a custom skill ("Vow Check") → `POST /api/ai/custom` returns `routing.sources`
      from the Router (`routed_by:"llm"`) → chips render with reason line.
- [ ] Kill `ollama`, then create a second skill → save still succeeds with
      `routed_by:"fallback"` (keyword matcher) and an explicit badge.
- [ ] Edit the skill (change prompt) → routing re-runs unless `mode:"locked"`; lock a skill,
      edit, confirm routing is untouched.
- [ ] Duplicate a skill → new `custom-…-copy` id persists; delete it → gone from the
      registry and from every story's `enabled_skills`.
- [ ] Test run from the Studio uses the routed sources; context is attached even when the
      prompt has no `{{story_context}}` placeholder.
- [ ] The new custom skill appears in the AI panel for the tabs it opted into, and is
      togglable per story.

Phase 6 (full catalog)
- [ ] All 18 built-in analysis skills + 3 import pipelines run end-to-end; per-view pills
      (AI Critique, AI Trajectory, Scan my handwriting, …) preselect the right pipeline.
- [ ] Interactive "sampled N chapters" note visible for large stories.

Phase 7 (polish, optional)
- [ ] Result history list per story; "summarize since last run" delta works; markdown
      export downloads a `.md` file.
- [ ] `npm run lint` + `npm run build` pass in `frontend/`; backend imports clean.