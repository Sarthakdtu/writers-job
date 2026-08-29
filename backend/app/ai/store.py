"""AiStore — the only place that touches `data/stories/<slug>/ai/` files.

Uses `file_utils` atomic + thread-safe helpers, consistent with the rest of the app
(a "no raw open()" on data files" rule). Kept out of `FileManager` so bookkeeping
stays separate from the core story reads.
"""
from pathlib import Path
from typing import Dict, List, Optional

from app.ai import config as ai_config
from app.ai.schemas import AIConfig, AIJob, AIResult
from app.file_utils import read_json_safe, write_json_safe

MAX_JOBS_PER_STORY = 50
MAX_JOBS_KEPT = 20


class AiStore:
    def __init__(self, base_data_dir: Path):
        self.base = Path(base_data_dir)

    def ai_dir(self, story_id: str) -> Path:
        return self.base / story_id / "ai"

    def ensure_ai(self, story_id: str) -> Path:
        d = self.ai_dir(story_id)
        (d / "jobs").mkdir(parents=True, exist_ok=True)
        (d / "results").mkdir(parents=True, exist_ok=True)
        return d

    # --- config ---

    def default_config(self) -> Dict[str, object]:
        return {
            "enabled_skills": None,  # None → all pipelines enabled
            "model": ai_config.get_default_model(),
            "ocr_model": ai_config.get_ocr_model(),
            "vision_model": ai_config.get_vision_model(),
            "router_model": ai_config.get_router_model(),
            "temperature_override": None,
        }

    def read_config(self, story_id: str) -> AIConfig:
        raw = read_json_safe(self.ai_dir(story_id) / "config.json", default=None) or {}
        d = {**self.default_config(), **raw}
        return AIConfig(**d)

    def write_config(self, story_id: str, cfg: AIConfig) -> AIConfig:
        self.ensure_ai(story_id)
        write_json_safe(self.ai_dir(story_id) / "config.json", cfg.model_dump(exclude_none=True))
        return cfg

    def skill_enabled_map(self, story_id: str, all_ids: List[str]) -> Dict[str, bool]:
        cfg = self.read_config(story_id)
        if cfg.enabled_skills is None:
            return {pid: True for pid in all_ids}
        enabled = set(cfg.enabled_skills)
        return {pid: pid in enabled for pid in all_ids}

    # --- jobs ---

    def job_path(self, story_id: str, job_id: str) -> Path:
        return self.ai_dir(story_id) / "jobs" / f"{job_id}.json"

    def write_job(self, job: AIJob) -> AIJob:
        self.ensure_ai(job.story_id)
        write_json_safe(self.job_path(job.story_id, job.id), job.model_dump())
        return job

    def read_job(self, story_id: str, job_id: str) -> Optional[AIJob]:
        data = read_json_safe(self.job_path(story_id, job_id), default=None)
        if not data:
            return None
        try:
            return AIJob(**data)
        except Exception:
            return None

    def list_jobs(self, story_id: str, limit: int = MAX_JOBS_KEPT) -> List[AIJob]:
        self.ensure_ai(story_id)
        jobs = []
        for p in (self.ai_dir(story_id) / "jobs").glob("*.json"):
            j = self.read_job(story_id, p.stem)
            if j:
                jobs.append(j)
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def prune_jobs(self, story_id: str) -> None:
        jobs = self.list_jobs(story_id, limit=MAX_JOBS_PER_STORY)
        keep = {j.id for j in jobs[:MAX_JOBS_KEPT]}
        jobs_dir = self.ai_dir(story_id) / "jobs"
        for p in jobs_dir.glob("*.json"):
            if p.stem not in keep:
                try:
                    p.unlink(missing_ok=True)
                except OSError:
                    pass

    # --- results ---

    def result_path(self, story_id: str, pipeline_id: str) -> Path:
        return self.ai_dir(story_id) / "results" / f"{pipeline_id}.json"

    def write_result(self, story_id: str, result: AIResult) -> AIResult:
        self.ensure_ai(story_id)
        write_json_safe(self.result_path(story_id, result.pipeline), result.model_dump())
        return result

    def read_result(self, story_id: str, pipeline_id: str) -> Optional[AIResult]:
        data = read_json_safe(self.result_path(story_id, pipeline_id), default=None)
        if not data:
            return None
        try:
            return AIResult(**data)
        except Exception:
            return None