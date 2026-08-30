"""One-off Notion-import enrichment — reuses the existing Ollama transport.

Reuses the established AI layer (`OllamaClient`, model resolution, `app.ai.prompts`)
instead of spinning up a separate integration. Two passes per story:

1. **classify** — for each chapter: split raw paragraphs into `prose` (kept in the
   chapter `.md`) vs `notes` (planning/outline text). Notes are returned so the caller
   can park them in `Story.overview` / plot instead of the draft.
2. **extract** — from the accumulated story text, pull characters / cities / factions /
   plot beats / tags as structured JSON, persisted via `FileManager` writers.

A fast text model is pinned (like `perspective_rewrite` pins `qwen2.5:7b`) because the
default reasoning model is too slow for interactive/batch extraction; JSON output and
`think:false` are used for deterministic results.
"""
import asyncio
import json
import re
from typing import Any, Dict, List, Optional

from app.ai.ollama import (
    OllamaClient,
    OllamaError,
    OllamaMessage,
    OllamaRequest,
    cached_models,
    resolve_model,
)
from app.file_manager import FileManager
from app.schemas import Character, City, Faction, Plot, PlotBeat

FAST_MODEL = "qwen2.5:7b"

PROSE_TAGS = "prose"
NOTES_TAG = "notes"


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Pull the first JSON object out of a model response (tolerates markdown fences)."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _looks_like_entities(data: Optional[Dict[str, Any]]) -> bool:
    """A usable extraction must at least be a dict; treat stray/non-object output as
    unusable so we retry instead of silently doing nothing."""
    if not isinstance(data, dict):
        return False
    return any(k in data for k in ("tags", "characters", "cities", "factions", "plot_beats"))


class NotionEnricher:
    def __init__(self, fm: FileManager, client: Optional[OllamaClient] = None):
        self.fm = fm
        self.client = client or OllamaClient()

    # --- model call ---------------------------------------------------------

    async def _complete_json(
        self, prompt_key: str, source_text: str, models: List
    ) -> Optional[Dict[str, Any]]:
        model = await resolve_model(
            self.client, models, FAST_MODEL, needs={"text"}
        )
        from app.ai.prompts import step_messages

        messages = step_messages(prompt_key, prev_output=source_text)
        resp = await self.client.complete(
            OllamaRequest(
                model=model.name,
                messages=[OllamaMessage(**m) for m in messages],
                temperature=0.0,
                format="json",
                options={"think": False},
            )
        )
        if resp.error:
            print(f"[enrich] model error ({prompt_key}): {resp.error}")
            return None
        return _extract_json(resp.content)

    # --- classification -----------------------------------------------------

    async def classify_chapter(
        self, story_slug: str, book_id: str, chapter_id: str, models: List
    ) -> Dict[str, List[str]]:
        prose = self.fm.read_chapter_prose(story_slug, book_id, chapter_id)
        paragraphs = [p.strip() for p in prose.splitlines() if p.strip()]
        if not paragraphs:
            return {"prose": [], "notes": []}

        data = await self._complete_json(
            "notion_classify", "\n\n".join(paragraphs), models
        )
        if not data:
            return {"prose": paragraphs, "notes": []}

        prose_lines = data.get("prose") or []
        notes = data.get("notes") or []

        clean_prose = "\n\n".join(str(p) for p in prose_lines).strip()
        if clean_prose:
            self.fm.save_chapter_prose(story_slug, book_id, chapter_id, clean_prose)
        return {"prose": prose_lines, "notes": notes}

    # --- extraction ---------------------------------------------------------

    async def extract_entities(
        self, story_slug: str, models: List
    ) -> Dict[str, Any]:
        story = self.fm.get_story(story_slug)
        parts: List[str] = []
        if story and story.overview:
            parts.append("\n".join(story.overview))

        # sample prose so small models don't choke on very large sources
        max_total = 9000
        for book in self.fm.list_books(story_slug):
            for chapter in self.fm.list_chapters(story_slug, book.id):
                c = self.fm.read_chapter_prose(story_slug, book.id, chapter.id)
                if c:
                    parts.append(c[:2500])

        source = "\n\n---\n\n".join(parts)
        if len(source) > max_total:
            source = source[:max_total]

        # retry a few times: small models sometimes emit garbage under format=json
        for _ in range(3):
            data = await self._complete_json("notion_extract", source, models)
            if _looks_like_entities(data):
                return data
        return {}

    def apply_entities(self, story_slug: str, entities: Dict[str, Any]) -> Dict[str, int]:
        counts = {"characters": 0, "cities": 0, "factions": 0, "plot_beats": 0, "tags": 0}

        # tags — merge into the Story
        tags = [str(t).strip() for t in (entities.get("tags") or []) if str(t).strip()]
        if tags:
            story = self.fm.get_story(story_slug)
            merged = list(dict.fromkeys([*story.tags, *tags]))
            story.tags = merged
            self.fm.save_story(story)
            counts["tags"] = len(tags)

        # characters
        existing_chars = {c.id: c for c in self.fm.list_characters(story_slug)}
        for item in entities.get("characters") or []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            cid = _slug(name)
            char = existing_chars.get(cid) or Character(id=cid, name=name)
            if item.get("role"):
                char.role = str(item.get("role"))
            if item.get("bio"):
                char.bio = str(item.get("bio"))
            self.fm.save_character(story_slug, char)
            existing_chars[cid] = char
            counts["characters"] += 1

        # cities
        cities = list(self.fm.get_cities(story_slug))
        seen_cities = {c.name for c in cities}
        for item in entities.get("cities") or []:
            name = str(item.get("name") or "").strip()
            if not name or name in seen_cities:
                continue
            cities.append(
                City(
                    id=_slug(name),
                    name=name,
                    region=str(item.get("region") or ""),
                    atmosphere=str(item.get("atmosphere") or ""),
                )
            )
            seen_cities.add(name)
            counts["cities"] += 1
        if counts["cities"]:
            self.fm.save_cities(story_slug, cities)

        # factions
        factions = list(self.fm.get_factions(story_slug))
        seen_factions = {f.name for f in factions}
        for item in entities.get("factions") or []:
            name = str(item.get("name") or "").strip()
            if not name or name in seen_factions:
                continue
            factions.append(
                Faction(
                    id=_slug(name),
                    name=name,
                    description=str(item.get("description") or ""),
                    leader=str(item.get("leader") or ""),
                    alignment=str(item.get("alignment") or ""),
                )
            )
            seen_factions.add(name)
            counts["factions"] += 1
        if counts["factions"]:
            self.fm.save_factions(story_slug, factions)

        # plot beats — into the first book's plot
        beats = [b for b in (entities.get("plot_beats") or []) if (b.get("title") or "").strip()]
        if beats:
            books = self.fm.list_books(story_slug)
            book_id = books[0].id if books else "1"
            plot = self.fm.get_plot(story_slug, book_id)
            plot.beats = [
                PlotBeat(
                    id=_slug(str(b.get("title"))),
                    title=str(b.get("title")),
                    description=str(b.get("description") or ""),
                )
                for b in beats
            ]
            self.fm.save_plot(story_slug, book_id, plot)
            counts["plot_beats"] = len(plot.beats)

        return counts

    async def enrich(self, story_slug: str) -> Dict[str, int]:
        models = await cached_models(self.client)
        if not models:
            raise OllamaError("Ollama is not running. Start it with: ollama serve")

        collected_notes: List[str] = []
        for book in self.fm.list_books(story_slug):
            for chapter in self.fm.list_chapters(story_slug, book.id):
                result = await self.classify_chapter(
                    story_slug, book.id, chapter.id, models
                )
                collected_notes.extend(result["notes"])

        entities = await self.extract_entities(story_slug, models)
        counts = self.apply_entities(story_slug, entities)

        # park collected notes into the story overview so planning text isn't lost
        if collected_notes:
            story = self.fm.get_story(story_slug)
            note_paragraph = "\n\n[Outline notes extracted from draft]\n\n" + "\n\n".join(
                collected_notes
            )
            if note_paragraph not in story.overview:
                story.overview = [*story.overview, note_paragraph]
                self.fm.save_story(story)
            counts["notes"] = len(collected_notes)
        return counts


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return s.strip("-") or "item"


def run_enrich(fm: FileManager, story_slug: str) -> Dict[str, int]:
    """Synchronous entry point for the import script."""
    return asyncio.run(NotionEnricher(fm).enrich(story_slug))
