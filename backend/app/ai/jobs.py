"""JobManager — async, click-to-run execution with per-story FIFO queuing.

Non-goal: streaming. Goal: POST /run ack instantly → a background asyncio task talks
to Ollama → the frontend polls job status. One runner per story (Ollama serializes
generations anyway); extra runs queue and run in order. Job history + results persist
to `ai/jobs/` + `ai/results/` so they survive restarts; startup marks stragglers
`interrupted`.
"""
import asyncio
import time
import uuid
from collections import deque
from typing import Any, Dict, List, Optional

from app.ai import config as ai_config
from app.ai import context as context_mod
from app.ai import custom as custom_registry
from app.ai import pipelines as pipeline_registry
from app.ai import prompts as prompt_mod
from app.ai import router as router_mod
from app.ai.io import prepare_images
from app.ai.ollama import (
    OllamaClient,
    OllamaError,
    OllamaMessage,
    OllamaRequest,
    cached_models,
    resolve_model,
)
from app.ai.schemas import AIJob, AIResult, RunInput


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


class JobManager:
    def __init__(self, file_manager, store, base_data_dir):
        self.fm = file_manager
        self.store = store
        self.client = OllamaClient()
        self.base_data_dir = base_data_dir
        self._running: Dict[str, bool] = {}
        self._queues: Dict[str, deque] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        # models cached here so model resolution is instant (transport cache governs TTL)
        self._models: Optional[List] = None

    # --- public API ---------------------------------------------------------

    def running_count(self) -> int:
        return sum(1 for v in self._running.values() if v)

    def queued_count(self) -> int:
        return sum(len(q) for q in self._queues.values())

    async def enqueue(self, story_id: str, pipeline_id: str, run_input: RunInput) -> AIJob:
        story = self.fm.get_story(story_id)
        if not story:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Story '{story_id}' not found")

        pipeline = self._resolve_pipeline(pipeline_id)
        if pipeline is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Unknown pipeline '{pipeline_id}'")

        cfg = self.store.read_config(story_id)

        images_b64: List[str] = []
        if pipeline.needs_images or run_input.images:
            images_b64 = prepare_images(self.fm, story_id, run_input.images)

        params = run_input.params or {}
        if pipeline.needs_selection:
            sel = pipeline.selection_param or "character_id"
            if not params.get(sel):
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail=f"Pipeline '{pipeline_id}' needs a selection: missing '{sel}'",
                )

        jobs = self.store.list_jobs(story_id, limit=50)
        queue = self._queues.setdefault(story_id, deque())
        job = AIJob(
            id=uuid.uuid4().hex[:12],
            story_id=story_id,
            pipeline=pipeline_id,
            family=pipeline.family,
            status="pending",
            created_at=_now(),
            input_summary=self._summarize(run_input, images_b64),
            steps_total=len(pipeline.steps),
            steps_done=0,
            progress=0.0,
            queue_position=len(queue),
        )
        # keep a private hold on staged images for this job
        image_hold = getattr(self, "_image_holds", None)
        if image_hold is None:
            image_hold = self._image_holds = {}
        image_hold[job.id] = images_b64 or None

        self.store.write_job(job)
        self._persist_input(story_id, job.id, run_input)
        self.store.prune_jobs(story_id)
        self.store.write_job(job)

        queue.append(job.id)
        if not self._running.get(story_id):
            self._start_next(story_id)
        return job

    async def cancel(self, story_id: str, job_id: str) -> Optional[AIJob]:
        # pending (queued) → remove from queue
        queue = self._queues.get(story_id)
        if queue and job_id in queue:
            queue.remove(job_id)
            job = self.store.read_job(story_id, job_id)
            if job and job.status == "pending":
                job.status = "cancelled"
                job.completed_at = _now()
                self.store.write_job(job)
            return job or None
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
        job = self.store.read_job(story_id, job_id)
        if job and job.status in ("pending", "running"):
            job.status = "cancelled"
            job.completed_at = _now()
            self.store.write_job(job)
        return job or None

    async def recover_interrupted(self):
        """Startup hook: mark pending/running jobs interrupted (crash-safe)."""
        base = self.base_data_dir
        if not base.exists():
            return
        for story_dir in base.iterdir():
            if not story_dir.is_dir():
                continue
            jobs_dir = story_dir / "ai" / "jobs"
            if not jobs_dir.exists():
                continue
            for p in jobs_dir.glob("*.json"):
                job = self.store.read_job(story_dir.name, p.stem)
                if job and job.status in ("pending", "running"):
                    job.status = "interrupted"
                    job.completed_at = _now()
                    job.stage = "Interrupted by restart"
                    self.store.write_job(job)

    # --- pipeline resolution ------------------------------------------------

    def _resolve_pipeline(self, pipeline_id: str):
        builtin = pipeline_registry.get_builtin(pipeline_id)
        if builtin is not None:
            setattr(builtin, "_custom_skill", None)
            return builtin
        if pipeline_id.startswith("custom-"):
            skill = custom_registry.get_custom(self.base_data_dir, pipeline_id)
            if skill:
                return self._custom_pipeline(skill)
        return None

    def _custom_pipeline(self, skill) -> pipeline_registry.PipelineDef:
        from app.ai.schemas import CustomSkill
        p = pipeline_registry.PipelineDef(
            id=skill.id,
            name=skill.name,
            description=skill.description,
            family="analysis",
            tabs=skill.tabs or [],
            input_kind=skill.input_kind,
            needs_images=(skill.input_kind == "images"),
            needs_selection=(skill.input_kind == "selection"),
            selection_param=(skill.routing.params_hint or ["character_id"])[0],
            max_images=skill.max_images,
            model_family=skill.model_family,
            temperature=skill.temperature,
            save_targets=skill.save_targets,
            is_custom=True,
            context_builder=None,
            steps=[
                pipeline_registry.StepSpec(
                    prompt_key=skill.id,
                    model_family=skill.model_family,
                    temperature=skill.temperature,
                )
            ],
        )
        setattr(p, "_custom_skill", skill)
        return p

    # --- queueing -------------------------------------------------------------

    def _start_next(self, story_id: str) -> None:
        queue = self._queues.setdefault(story_id, deque())
        if self._running.get(story_id) or not queue:
            return
        job_id = queue.popleft()
        self._running[story_id] = True
        self._tasks[job_id] = asyncio.create_task(self._run_job(story_id, job_id))

    async def _run_job(self, story_id: str, job_id: str) -> None:
        try:
            await self._execute(story_id, job_id)
        except asyncio.CancelledError:
            job = self.store.read_job(story_id, job_id)
            if job and job.status == "running":
                job.status = "cancelled"
                job.completed_at = _now()
                self.store.write_job(job)
        finally:
            self._running[story_id] = False
            self._tasks.pop(job_id, None)
            self._image_holds.pop(job_id, None)
            self._start_next(story_id)

    # --- execution -------------------------------------------------------------

    async def _execute(self, story_id: str, job_id: str) -> None:
        job = self.store.read_job(story_id, job_id)
        if not job:
            return
        job.status = "running"
        job.started_at = _now()
        job.queue_position = 0
        job.stage = "Starting…"
        self.store.write_job(job)

        notes: List[str] = []
        images_b64 = (getattr(self, "_image_holds", {}) or {}).get(job_id) or []
        try:
            models = await cached_models(self.client)
            if not models:
                raise OllamaError(
                    "Ollama is not running. Start it with: ollama serve"
                )
            pipeline = self._resolve_pipeline(job.pipeline)
            if pipeline is None:
                raise OllamaError(f"Unknown pipeline '{job.pipeline}'")
            cfg = self.store.read_config(story_id)
            story = self.fm.get_story(story_id)
            if not story:
                raise OllamaError("Story was deleted while the job waited")

            params = {}
            run_input = self._input_for_job(job, story_id)
            if run_input:
                params = run_input.params or {}

            await self._maybe_route_custom(pipeline, job, cfg, notes)

            context_str = ""
            attach_context = not (job.family == "import")
            custom_skill = getattr(pipeline, "_custom_skill", None)
            if custom_skill is not None and pipeline.input_kind != "text":
                if pipeline.input_kind == "story_context" or pipeline.input_kind == "selection":
                    sources = custom_skill.routing.sources
                    context_str = context_mod.build_context_from_sources(
                        sources, params, story, self.fm, notes=notes,
                    )
            elif custom_skill is None:
                context_str = context_mod.build_context(
                    pipeline.id, story, self.fm, params, notes=notes,
                )

            prev_output = ""
            final_output = ""
            for idx, step in enumerate(pipeline.steps):
                job.steps_done = idx
                job.stage = prompt_mod.STAGE_LABELS.get(step.prompt_key, "Asking the editor…")
                model_name = await self._resolve_step_model(step, pipeline, cfg, models)
                job.model = model_name
                self.store.write_job(job)

                custom_prompt = custom_skill.prompt if custom_skill else None
                messages = prompt_mod.step_messages(
                    step.prompt_key,
                    context=context_str,
                    prev_output=prev_output,
                    custom_prompt=custom_prompt,
                    input_kind=pipeline.input_kind,
                    attach_context=attach_context,
                )
                if custom_skill and run_input is not None and run_input.text:
                    messages[-1]["content"] = (
                        f"{custom_skill.prompt}\n\nText:\n{run_input.text}"
                    )

                resp = await self.client.complete(OllamaRequest(
                    model=model_name,
                    messages=[OllamaMessage(**m) for m in messages],
                    temperature=step.temperature if step.temperature is not None else pipeline.temperature,
                    num_predict=step.num_predict,
                    format=step.format,
                    options={
                        "think": False if step.model_family != "text" else None,
                    },
                ))
                if resp.error:
                    raise OllamaError(resp.error)
                content = resp.content.strip()
                if content:
                    prev_output = content
                    final_output = content

                job.steps_done = idx + 1
                job.progress = job.steps_done / max(job.steps_total, 1)
                self.store.write_job(job)

            if not final_output:
                raise OllamaError("The model returned an empty answer")

            result = AIResult(
                pipeline=job.pipeline,
                family=job.family,
                model=job.model or "",
                created_at=_now(),
                content=final_output,
                save_targets=list(pipeline.save_targets),
                notes=notes,
                is_custom=pipeline.is_custom,
            )
            self.store.write_result(story_id, result)
            job.status = "done"
            job.completed_at = _now()
            job.progress = 1.0
            job.result_path = str(self.store.result_path(story_id, job.pipeline))
            self.store.write_job(job)
        except asyncio.CancelledError:
            raise
        except OllamaError as e:
            job.status = "error"
            job.error_message = str(e)
            job.completed_at = _now()
            self.store.write_job(job)
        except Exception as e:
            job.status = "error"
            job.error_message = f"{type(e).__name__}: {e}"
            job.completed_at = _now()
            self.store.write_job(job)

    async def _maybe_route_custom(self, pipeline, job, cfg, notes) -> None:
        skill = getattr(pipeline, "_custom_skill", None)
        if skill is None or skill.routing.mode != "auto":
            return
        if skill.routing.sources:
            return  # eager routing already stored; auto re-routes every run (costs one gen)
        job.stage = "Routing context…"
        self.store.write_job(job)
        decision = await router_mod.route_skill(self.client, {
            "name": skill.name, "description": skill.description,
            "prompt": skill.prompt, "hint": None,
        })
        skill.routing.sources = decision.sources
        skill.routing.params_hint = decision.params_hint
        skill.routing.reason = decision.reason
        skill.routing.routed_at = _now()
        skill.routing.routed_by = decision.routed_by

    # --- resolution helpers ------------------------------------------------------

    async def _resolve_step_model(self, step, pipeline, cfg, models) -> str:
        family = step.model_family
        preferred = {
            "ocr": cfg.ocr_model or ai_config.get_ocr_model(),
            "vision": cfg.vision_model or ai_config.get_vision_model(),
            "text": cfg.model or ai_config.get_default_model(),
        }.get(family, ai_config.get_default_model())
        needs = {"text"}
        if family in ("vision", "ocr"):
            needs.add("vision")
        if family == "ocr":
            needs.add("ocr")
        try:
            m = await resolve_model(self.client, models, preferred, needs=needs)
            return m.name
        except OllamaError:
            # last resort: the preferred model itself (Ollama may still serve it)
            return preferred

    def _input_for_job(self, job: AIJob, story_id: str) -> Optional[RunInput]:
        from app.file_utils import read_json_safe
        raw = read_json_safe(
            self.store.ai_dir(story_id) / "inputs" / f"{job.id}.json", default={}
        )
        if not raw:
            return RunInput()
        try:
            return RunInput(**raw)
        except Exception:
            return RunInput()

    def _persist_input(self, story_id: str, job_id: str, run_input: RunInput) -> None:
        inputs_dir = self.store.ai_dir(story_id) / "inputs"
        inputs_dir.mkdir(parents=True, exist_ok=True)
        from app.file_utils import write_json_safe
        write_json_safe(inputs_dir / f"{job_id}.json", run_input.model_dump())

    def _summarize(self, run_input: RunInput, images: List[str]) -> str:
        parts = []
        if images:
            parts.append(f"{len(images)} image(s)")
        if run_input.text:
            parts.append("text snippet")
        if run_input.params:
            for k, v in run_input.params.items():
                if isinstance(v, str) and v:
                    parts.append(f"{k}={v}")
        return ", ".join(parts) or "story context"