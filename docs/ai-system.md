# AI System (Ollama) + Creator Pipeline

## Ollama AI package (`backend/app/ai/`)

Lives as a sub-package; module-level `ollama_client = OllamaClient()` singleton in
`main.py`. Design source of truth: `plans/implemented/ollama-ai-skills.md` (gated phases 0–7).

### Core modules

- `ollama.py` — **generic transport**: `OllamaRequest`/`OllamaResponse`,
  `detect_capabilities` (families + name heuristics → text/vision/ocr/code),
  `complete()` (OAI-style messages incl. base64 `images`), `resolve_model` (by
  needs/family/preferred), `cached_models` (30s TTL).
- `io.py` — `prepare_images(fm, story_id, refs)` → base64 list; raises 400 with
  `{bad_images, reason}`. Rejects non-image extensions, >8MB files, `..`
  traversal, other-story refs, and >`OLLAMA_MAX_IMAGES_PER_RUN` count.
- `schemas.py` — `AIStatus`, `ModelInfo`, `AIConfig`, `RunInput`/`RunRequest`,
  `AIJob`, `AIResult`, `PipelineSummary`, `CustomSkillPayload`, `RoutingBlock`,
  `CustomSkill`, `RouterRequest`, `RouterDecision`.
- `prompts.py` — `SYSTEM_PREFIXES`, `TASKS` for all 22 pipelines, `STAGE_LABELS`,
  `ROUTER_SYSTEM`, `step_messages` helper.

### Pipelines

- `pipelines.py` — `PipelineDef` registry: 22 analysis + 3 import pipelines.
  Built-in `StepSpec`s may set `model_preferred` to pin a specific installed model
  (`perspective_rewrite` → `qwen2.5:7b`, `chapter_draft` → `qwen2.5:7b`). `StepSpec`
  carries `kind` (`"llm"` default | `"generate"`) — `"generate"` steps run via
  `generator.py` (local diffusion) instead of an Ollama call. `to_summary` adds a
  `required_models` list to each `PipelineSummary` — shown as chips on AI Panel skill cards.

### Context & Storage

- `context.py` — 21 context builders + `SOURCE_BUILDERS` + `build_context_from_sources`
  with budget/drop logic and "sampled N" notes. Uniform signature `(fm, story, params=None)`.
  Custom-skill runs assemble context from `routing.sources`; built-in pipelines use `build_context`.
- `store.py` — `AiStore`: per-story `ai/{config.json,jobs/,results/}` persistence.

### Custom Skills & Router

- `custom.py` — async custom skill CRUD + duplicate + auto-routing (`route_skill`).
  `create`/`update` skip the router when `routing_mode=="locked"` + explicit
  `routing_sources` are provided.
- `router.py` — Context Router: LLM routing (format=json, temp=0, think=false) + keyword
  fallback; bounded by `OLLAMA_ROUTER_TIMEOUT_S` (`asyncio.wait_for`). Returns
  `RouterDecision` with `routed_by` badge.

### Jobs

- `jobs.py` — `JobManager`: per-story FIFO queue, one runner per story, cancel,
  `recover_interrupted` startup hook, per-step model resolution, image staging, and
  `kind="generate"` step execution (local diffusion via `generator.py`). Vision/OCR LLM
  steps attach a job's staged images to the last message.

### Generator

- `generator.py` — async wrapper around the local `juggernaut_xl_generate.py` script
  (`GENERATE_SCRIPT`). `generate_image()` runs the script via subprocess and returns the
  output PNG path; `is_generation_enabled()` reports whether generation is configured.

### Notable pipelines

- `perspective_rewrite` — rewrites prose from a character's POV.
- `chapter_draft` — "Draft Chapter from Breakdown": writes an entire chapter from scene
  breakdown + characters' personas + world context.
- `chapter_interconnect` — "Chapter Judge": carries **no tabs**, driven only from the
  Book Outliner's "Chapter Judge" sub-tab.
- `chapter_art` — multi-step illustration: vision LLM writes a detailed image prompt
  → local Juggernaut XL script renders → saves to assets → attaches as chapter's `image_url`.

### Model notes

- `qwen3.5:9b` is a **reasoning model**: `content` is empty while thinking is in
  progress, and `message.thinking` holds the chain. Keep `num_predict` generous (or
  unset) and rely on `options.think=false` only when you want reasoning off.
- **Known latency**: on this hardware qwen3.5:9b takes ~20s/completion; LLM-first
  router makes skill creation slow. Use `OLLAMA_ROUTER_MODEL` to point to a faster model.

### AI Routes

- `GET /api/ai/status` → `AIStatus`
- `GET /api/ai/pipelines?story_id=&tab=` — list pipelines with enable flags
- `GET/PUT /api/ai/config/{story_id}` — per-story model overrides + enabled_skills
- `POST /api/ai/run` (202) — enqueue a pipeline run
- `GET /api/ai/jobs/{story_id}` — list jobs
- `GET /api/ai/jobs/{story_id}/{job_id}` — get job status
- `POST /api/ai/jobs/{job_id}/cancel?story_id=` — cancel job
- `GET /api/ai/results/{story_id}/{pipeline}` — get stored result
- `GET/POST /api/ai/custom` — list / create custom skill
- `PUT/DELETE /api/ai/custom/{skill_id}` — update / delete custom skill
- `POST /api/ai/custom/{skill_id}/duplicate` — duplicate custom skill
- `POST /api/ai/custom/route` — dry-run router

---

## Creator Pipeline (`backend/app/ai/creator/`) — Pro-tier story import

Separate from one-shot AI skills: an iterative, review-gated pipeline that turns pasted
raw prose into a populated story. Source of truth: `plans/implemented/creator-pipeline.md`.

### Flow

`split` (no LLM) → 4 extraction stages (`characters`, `world`, `plot`, `arcs`) →
user reviews/edits each draft → `approve` merges into the story → next batch. Each stage is
independent; the user picks which to run. Closing a batch auto-completes at `arcs`.

### Iterative batches

Processing chapters in batches merges via **append + dedupe** (never replace).
State persisted under `<story-slug>/creator/` (`CreatorStore`): `state.json` +
`batches/<batch>/<stage>.json` (draft) and `<stage>-approved.json` (post-approval copy).

### Modules

- `split.py` — `split_chapters(text)` → `[(title, content)]`. Preference: explicit
  `Chapter/Part <N>` markers → markdown `##` headings → paragraph chunking (~1500 words).
  Creates a `Book` + `Chapter` per split chapter; `BOOK_ID` = `"1"`.
- `stages.py` — `StageRunner` calls Ollama (`format="json"`, `temperature=0.0`,
  `options.think=false`) pinned to `_CREATOR_MODEL = "qwen2.5:7b"`. Tolerant parsing
  with up to 3 retries + `_extract_json` (cleans triple-backtick fences).
- `pipeline.py` — `CreatorPipeline(fm, client, base_data_dir)` orchestrator.
  `_drop_nulls()` recursively strips `None` before building stage models. `_merge` routes
  to `EntityMerger` methods.
- `merge.py` — `EntityMerger` appends + dedupes by normalized name. `merge_plot`
  maps 1-based `chapter_index` → chapter id via the batch's added chapters.
- `prompts.py` — `stage_messages()` prompts for characters/world/plot/arcs.
- `schemas.py` — Stage-result models + `CreatorState`/`CreatorBatchInfo`/`CreatorSummary`,
  `STAGE_NAMES`.
- `store.py` — `CreatorStore`: per-story creator state + batch persistence.

### Creator Routes

- `GET .../creator/{story_id}/state` — pipeline state
- `POST .../creator/{story_id}/split` — split raw prose into book + chapters
- `POST .../creator/{story_id}/run-stage` — run one extraction stage
- `GET .../creator/{story_id}/draft/{stage}` — get saved draft for review
- `PUT .../creator/{story_id}/approve/{stage}` — merge into story
- `POST .../creator/{story_id}/batch` — start a new batch
- `GET .../creator/{story_id}/summary` — counts for Done screen

### Frontend

`CreatorPipelineView.jsx` (activeTab `'creator'`, Pro-gated): wizard stepper
Split → Characters → World → Plot → Arcs → Done, a paste pane, per-stage review/edit/approve,
and a Done screen with summary counts.

---

## Config via environment variables

- `DATA_DIR` — base data directory (default `data/stories`).
- `GOOGLE_CLIENT_SECRET_PATH` — path to `client_secret.json` for OAuth (default
  `client_secret.json`).
- **Ollama AI settings** (defaults in parentheses): `OLLAMA_BASE_URL`
  (`http://localhost:11434`), `OLLAMA_DEFAULT_MODEL` (`qwen3.5:9b`),
  `OLLAMA_OCR_MODEL` (`glm-ocr:latest`), `OLLAMA_VISION_MODEL` (`minicpm-v:latest`),
  `OLLAMA_ROUTER_MODEL` (`defaults to OLLAMA_DEFAULT_MODEL`), `OLLAMA_TIMEOUT_S` (`300`),
  `OLLAMA_ROUTER_TIMEOUT_S` (`20`), `OLLAMA_CONTEXT_BUDGET_CHARS` (`40000`),
  `OLLAMA_TEMPERATURE` (`0.2`), `OLLAMA_MAX_IMAGES_PER_RUN` (`6`),
  `OLLAMA_CAPABILITY_OVERRIDES` (empty; format `family:caps;[...]`).
- **Local diffusion generation** (the `chapter_art` skill): `GENERATE_SCRIPT` (path to
  `juggernaut_xl_generate.py` — defaults to vendored copy under `backend/scripts/`),
  `GENERATE_PYTHON` (python used to run it — auto-resolves if unset), `GENERATE_STEPS` (`25`),
  `GENERATE_SEED` (unset → random), `GENERATE_GUIDANCE` (`5.0`),
  `GENERATE_WIDTH`/`GENERATE_HEIGHT` (`1024`/`1024`).
- The generator script `backend/scripts/juggernaut_xl_generate.py` is **vendored** (owned by the
  repo): shells out to a subprocess that renders with
  `StableDiffusionXLPipeline.from_single_file("RunDiffusion/Juggernaut-XL-v9")` on MPS/CUDA.
