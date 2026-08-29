"""Custom-skill registry (app-wide) + Skill Studio CRUD.

Custom skills live in `data/custom_pipelines.json` (atomic, app-wide). Per-story
enablement stays in each story's `ai/config.json`. Built-in pipelines (code-defined
in `app.ai.pipelines`) are read-only — custom skills are the editable catalog.
"""
import re
import time
from pathlib import Path
from typing import List, Optional

from app.ai.schemas import CustomSkill, CustomSkillPayload, RouterDecision
from app.file_utils import read_json_safe, write_json_safe


def registry_path(base_data_dir: Path) -> Path:
    return Path(base_data_dir).resolve().parent / "custom_pipelines.json"


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "skill"


def load_all(base_data_dir: Path) -> List[CustomSkill]:
    data = read_json_safe(registry_path(base_data_dir), default=[])
    skills = []
    for item in data if isinstance(data, list) else []:
        try:
            skills.append(CustomSkill(**item))
        except Exception:
            continue
    return skills


def save_all(base_data_dir: Path, skills: List[CustomSkill]) -> None:
    write_json_safe(registry_path(base_data_dir), [s.model_dump() for s in skills])


def get_custom(base_data_dir: Path, skill_id: str) -> Optional[CustomSkill]:
    return next((s for s in load_all(base_data_dir) if s.id == skill_id), None)


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _gen_id(name: str, existing: set) -> str:
    base_id = f"custom-{slugify(name)}"
    candidate, n = base_id, 2
    while candidate in existing:
        candidate = f"{base_id}-{n}"
        n += 1
    return candidate


async def create(
    base_data_dir: Path,
    payload: CustomSkillPayload,
    route,
) -> CustomSkill:
    skills = load_all(base_data_dir)
    existing = {s.id for s in skills}
    skill_id = _gen_id(payload.name, existing)
    now = _now()
    decision = await route({"name": payload.name, "description": payload.description,
                            "prompt": payload.prompt, "hint": payload.hint})
    skill = CustomSkill(
        **payload.model_dump(),
        id=skill_id,
        routing={
            "mode": "auto",
            "sources": decision.sources,
            "params_hint": decision.params_hint,
            "reason": decision.reason,
            "routed_at": now,
            "routed_by": decision.routed_by,
        },
        created_at=now,
        updated_at=now,
    )
    skills.append(skill)
    save_all(base_data_dir, skills)
    return skill


async def update(
    base_data_dir: Path,
    skill_id: str,
    payload: CustomSkillPayload,
    route,
) -> Optional[CustomSkill]:
    skills = load_all(base_data_dir)
    idx = next((i for i, s in enumerate(skills) if s.id == skill_id), None)
    if idx is None:
        return None
    current = skills[idx]
    now = _now()

    reroute = current.routing.mode != "locked"
    decision: Optional[RouterDecision] = None
    if reroute:
        decision = await route({"name": payload.name, "description": payload.description,
                                "prompt": payload.prompt, "hint": payload.hint})
    upd = current.model_copy(update=payload.model_dump(), deep=False)
    upd.updated_at = now
    if reroute and decision is not None:
        upd.routing.sources = decision.sources
        upd.routing.params_hint = decision.params_hint
        upd.routing.reason = decision.reason
        upd.routing.routed_at = now
        upd.routing.routed_by = decision.routed_by
    skills[idx] = upd
    save_all(base_data_dir, skills)
    return upd


def delete(base_data_dir: Path, skill_id: str, store) -> int:
    skills = load_all(base_data_dir)
    before = len(skills)
    skills = [s for s in skills if s.id != skill_id]
    save_all(base_data_dir, skills)
    if len(skills) == before:
        return -1  # not found

    purged = 0
    base_dir = Path(base_data_dir)
    if base_dir.is_dir():
        for story_dir in base_dir.iterdir():
            if not story_dir.is_dir():
                continue
            cfg_path = story_dir / "ai" / "config.json"
            raw = read_json_safe(cfg_path, default=None)
            if not raw or not isinstance(raw.get("enabled_skills"), list):
                continue
            enabled = [pid for pid in raw["enabled_skills"] if pid != skill_id]
            if len(enabled) != len(raw["enabled_skills"]):
                raw["enabled_skills"] = enabled
                write_json_safe(cfg_path, raw)
                purged += 1
    return purged


async def duplicate(base_data_dir: Path, skill_id: str, route) -> Optional[CustomSkill]:
    src = get_custom(base_data_dir, skill_id)
    if not src:
        return None
    skills = load_all(base_data_dir)
    existing = {s.id for s in skills}
    new_id = _gen_id(f"{src.name} copy", existing)
    decision = await route({"name": src.name, "description": src.description,
                            "prompt": src.prompt, "hint": None})
    now = _now()
    clone = src.model_copy(deep=True)
    clone.id = new_id
    clone.created_at = now
    clone.updated_at = now
    clone.routing = clone.routing.model_copy(deep=True)
    clone.routing.sources = decision.sources
    clone.routing.params_hint = decision.params_hint
    clone.routing.reason = decision.reason
    clone.routing.routed_at = now
    clone.routing.routed_by = decision.routed_by
    clone.routing.mode = "auto"
    skills.append(clone)
    save_all(base_data_dir, skills)
    return clone