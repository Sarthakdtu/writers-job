"""Creator Pipeline persistence: state + per-batch draft/approved results.

Lives under `<story-slug>/creator/` (independent of the generic `ai/` store) so
the review-gated, iterative Creator Pipeline never collides with one-shot AI jobs.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.file_utils import read_json_safe, write_json_safe, delete_file_safe
from app.ai.creator.schemas import (
    CreatorState, CreatorBatchInfo,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat() + "Z"


class CreatorStore:
    def __init__(self, base_data_dir: Path):
        self.base = Path(base_data_dir)

    # --- paths ------------------------------------------------------------

    def creator_dir(self, story_id: str) -> Path:
        return self.base / story_id / "creator"

    def batches_dir(self, story_id: str) -> Path:
        return self.creator_dir(story_id) / "batches"

    def batch_dir(self, story_id: str, batch_id: str) -> Path:
        return self.batches_dir(story_id) / batch_id

    def state_path(self, story_id: str) -> Path:
        return self.creator_dir(story_id) / "state.json"

    def draft_path(self, story_id: str, batch_id: str, stage: str) -> Path:
        return self.batch_dir(story_id, batch_id) / f"{stage}.json"

    def approved_path(self, story_id: str, batch_id: str, stage: str) -> Path:
        return self.batch_dir(story_id, batch_id) / f"{stage}-approved.json"

    # --- state ------------------------------------------------------------

    def get_state(self, story_id: str) -> Optional[CreatorState]:
        data = read_json_safe(self.state_path(story_id))
        if not data:
            return None
        return CreatorState(**data)

    def save_state(self, state: CreatorState) -> CreatorState:
        self.creator_dir(state.story_id).mkdir(parents=True, exist_ok=True)
        state.updated_at = _now()
        write_json_safe(self.state_path(state.story_id), state.model_dump())
        return state

    def init_state(self, story_id: str, book_id: str = "1") -> CreatorState:
        now = _now()
        state = CreatorState(
            story_id=story_id,
            book_id=book_id,
            status="draft",
            created_at=now,
            updated_at=now,
        )
        return self.save_state(state)

    def ensure_batch(self, story_id: str, batch_id: str) -> CreatorState:
        state = self.get_state(story_id) or self.init_state(story_id)
        if not any(b.batch_id == batch_id for b in state.batches):
            state.batches.append(CreatorBatchInfo(
                batch_id=batch_id,
                created_at=_now(),
            ))
        if state.current_batch is None:
            state.current_batch = batch_id
        self.batch_dir(story_id, batch_id).mkdir(parents=True, exist_ok=True)
        return self.save_state(state)

    # --- state helpers ----------------------------------------------------

    def add_chapters(self, story_id: str, batch_id: str, chapter_ids: List[str]) -> CreatorState:
        state = self.get_state(story_id) or self.init_state(story_id)
        for b in state.batches:
            if b.batch_id == batch_id:
                seen = set(b.chapters_added)
                b.chapters_added.extend(c for c in chapter_ids if c not in seen)
                break
        return self.save_state(state)

    def complete_stage(self, story_id: str, batch_id: str, stage: str) -> CreatorState:
        state = self.get_state(story_id) or self.init_state(story_id)
        if stage not in state.drafted_stages:
            state.drafted_stages.append(stage)
        for b in state.batches:
            if b.batch_id == batch_id and stage not in b.stages_completed:
                b.stages_completed.append(stage)
        if stage == "arcs":
            state.current_stage = None
        else:
            state.current_stage = stage
        self.complete_batch_if_done(state, batch_id)
        return self.save_state(state)

    def complete_batch_if_done(self, state: CreatorState, batch_id: str) -> CreatorState:
        done = {"split", "characters", "world", "plot", "arcs"}
        for b in state.batches:
            if b.batch_id == batch_id:
                if done.issubset(set(b.stages_completed)) and not b.completed_at:
                    b.completed_at = _now()
                    state.status = "complete"
                    state.current_batch = None
                elif b.stages_completed:
                    state.status = "review"
        return state

    # --- drafts & approvals -------------------------------------------------

    def save_draft(self, story_id: str, batch_id: str, stage: str, result: dict) -> None:
        path = self.draft_path(story_id, batch_id, stage)
        self.batch_dir(story_id, batch_id).mkdir(parents=True, exist_ok=True)
        write_json_safe(path, result)

    def load_draft(self, story_id: str, batch_id: str, stage: str) -> Optional[Dict[str, Any]]:
        return read_json_safe(self.draft_path(story_id, batch_id, stage))

    def save_approved(self, story_id: str, batch_id: str, stage: str, result: dict) -> None:
        path = self.approved_path(story_id, batch_id, stage)
        self.batch_dir(story_id, batch_id).mkdir(parents=True, exist_ok=True)
        write_json_safe(path, result)

    def load_approved(self, story_id: str, batch_id: str, stage: str) -> Optional[Dict[str, Any]]:
        return read_json_safe(self.approved_path(story_id, batch_id, stage))

    def list_approved_stages(self, story_id: str, batch_id: str) -> List[str]:
        batch_dir = self.batch_dir(story_id, batch_id)
        if not batch_dir.exists():
            return []
        return sorted(
            p.stem.replace("-approved", "")
            for p in batch_dir.glob("*-approved.json")
        )
