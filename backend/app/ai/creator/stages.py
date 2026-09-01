"""LLM extraction stage runners for the Creator Pipeline.

Each stage gathers source text (batch prose + previously approved context),
calls Ollama for strict JSON, tolerantly parses it (retrying a few times), and
returns the parsed stage result. Results are saved as drafts by the pipeline.
"""
import json
import re
from typing import Any, Dict, List, Optional

from app.file_manager import FileManager
from app.ai.ollama import OllamaClient, OllamaRequest, OllamaMessage, cached_models, resolve_model, OllamaError
from app.ai import config as ai_config
from app.ai.creator import prompts
from app.ai.creator.schemas import (
    ExtractedCharacter, WorldStageResult, PlotStageResult, ArcsStageResult,
)

_CREATOR_MODEL = "qwen2.5:7b"


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(cleaned[start:end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return None


def _looks_like(stage: str, data: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(data, dict):
        return False
    keys = {
        "characters": "characters",
        "world": "cities",
        "plot": "beats",
        "arcs": "arcs",
    }
    key = keys.get(stage)
    if not key:
        return True
    val = data.get(key)
    return isinstance(val, list)


def _s(value: Any) -> str:
    """Coerce a value to a string, tolerating null/None."""
    if value is None:
        return ""
    return str(value).strip()


def _sl(value: Any) -> List[str]:
    """Coerce a value to a list of strings, tolerating null/None entries."""
    if not isinstance(value, list):
        return []
    return [str(v) for v in value if v is not None]


class StageRunner:
    def __init__(self, fm: FileManager, client: OllamaClient):
        self.fm = fm
        self.client = client

    async def _complete_json(self, stage: str, source_text: str) -> Optional[Dict[str, Any]]:
        models = await cached_models(self.client)
        if not models:
            raise OllamaError("Ollama is not running. Start it with: ollama serve")

        model = await resolve_model(
            self.client, models, _CREATOR_MODEL, needs={"text"}
        )
        messages = [OllamaMessage(**m) for m in prompts.stage_messages(stage, source_text)]
        resp = await self.client.complete(
            OllamaRequest(
                model=model.name,
                messages=messages,
                temperature=0.0,
                format="json",
                options={"think": False},
            )
        )
        if resp.error:
            raise OllamaError(f"Creator {stage} extraction failed: {resp.error}")
        return _extract_json(resp.content)

    async def extract_characters(self, story_id: str, source_text: str) -> List[Dict]:
        data = None
        for _ in range(3):
            data = await self._complete_json("characters", source_text)
            if _looks_like("characters", data):
                break
        if not _looks_like("characters", data):
            return []
        out = []
        for item in (data.get("characters") or []):
            if isinstance(item, dict) and item.get("name"):
                out.append(item)
        return out

    async def extract_world(self, story_id: str, source_text: str) -> WorldStageResult:
        data = None
        for _ in range(3):
            data = await self._complete_json("world", source_text)
            if _looks_like("world", data):
                break
        if not _looks_like("world", data):
            return WorldStageResult()
        return WorldStageResult(
            cities=[
                {"name": _s(c.get("name")), "region": _s(c.get("region")),
                 "atmosphere": _s(c.get("atmosphere")),
                 "key_locations": _sl(c.get("key_locations"))}
                for c in data.get("cities") or [] if isinstance(c, dict) and _s(c.get("name"))
            ],
            factions=[
                {"name": _s(f.get("name")), "description": _s(f.get("description")),
                 "leader": _s(f.get("leader")), "alignment": _s(f.get("alignment"))}
                for f in data.get("factions") or [] if isinstance(f, dict) and _s(f.get("name"))
            ],
            artifacts=[
                {"name": _s(a.get("name")), "type": _s(a.get("type")),
                 "properties": _s(a.get("properties")), "location": _s(a.get("location")),
                 "belongs_to": _sl(a.get("belongs_to"))}
                for a in data.get("artifacts") or [] if isinstance(a, dict) and _s(a.get("name"))
            ],
            glossary=[
                {"term": _s(g.get("term")), "definition": _s(g.get("definition")),
                 "category": _s(g.get("category"))}
                for g in data.get("glossary") or [] if isinstance(g, dict) and _s(g.get("term"))
            ],
            magic_system=_s(data.get("magic_system")),
            technology_level=_s(data.get("technology_level")),
            global_rules=_sl(data.get("global_rules")),
            notes=_sl(data.get("notes")),
        )

    async def extract_plot(self, story_id: str, source_text: str) -> PlotStageResult:
        data = None
        for _ in range(3):
            data = await self._complete_json("plot", source_text)
            if _looks_like("plot", data):
                break
        if not _looks_like("plot", data):
            return PlotStageResult()
        beats = []
        for b in (data.get("beats") or []):
            if isinstance(b, dict) and _s(b.get("title")):
                try:
                    ch_idx = int(b.get("chapter_index") or 0)
                except (TypeError, ValueError):
                    ch_idx = 0
                beats.append({
                    "title": _s(b.get("title")),
                    "description": _s(b.get("description")),
                    "chapter_index": ch_idx,
                    "chapter_id": _s(b.get("chapter_id")),
                    "character_names": _sl(b.get("character_names")),
                    "importance": _s(b.get("importance")) or "minor",
                })
        summaries = data.get("chapter_summaries") or {}
        return PlotStageResult(
            beats=beats,
            themes=_sl(data.get("themes")),
            overview=_sl(data.get("overview")),
            chapter_summaries={
                str(k): _s(v) for k, v in summaries.items() if _s(v)
            },
            notes=_sl(data.get("notes")),
        )

    async def extract_arcs(self, story_id: str, source_text: str) -> ArcsStageResult:
        data = None
        for _ in range(3):
            data = await self._complete_json("arcs", source_text)
            if _looks_like("arcs", data):
                break
        if not _looks_like("arcs", data):
            return ArcsStageResult()
        return ArcsStageResult(
            arcs=[
                {"character_name": _s(a.get("character_name")),
                 "arc_summary": _s(a.get("arc_summary")),
                 "starting_state": _s(a.get("starting_state")),
                 "ending_state": _s(a.get("ending_state")),
                 "key_milestones": _sl(a.get("key_milestones"))}
                for a in data.get("arcs") or [] if isinstance(a, dict) and _s(a.get("character_name"))
            ],
            notes=_sl(data.get("notes")),
        )
