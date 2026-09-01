"""CreatorPipeline orchestrator: split → stages → review → merge, iteratively.

Public methods are async (LLM extraction) except the pure split and merge
operations. State is persisted via CreatorStore so a story's import can be
resumed/continued across requests and batches.
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.file_manager import FileManager
from app.ai.ollama import OllamaClient, cached_models, OllamaError
from app.ai import config as ai_config
from app.schemas import Story, Book, Chapter

from app.ai.creator.schemas import (
    CreatorState, CreatorBatchInfo, SplitChapter, SplitResult,
    StageResult, WorldStageResult, PlotStageResult, ArcsStageResult,
    CreatorSummary, slugify, STAGE_NAMES,
)
from app.ai.creator.store import CreatorStore
from app.ai.creator.split import split_chapters
from app.ai.creator.merge import EntityMerger
from app.ai.creator.stages import StageRunner

_MERGERS = {
    "characters": "merge_characters",
    "world": "merge_world",
    "plot": "merge_plot",
    "arcs": "merge_arcs",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat() + "Z"


def _drop_nulls(data: Optional[Dict]) -> Dict:
    """Recursively strip None values so pydantic stage models accept user edits
    that zero a field to null."""
    if not isinstance(data, dict):
        return {}
    out = {}
    for k, v in data.items():
        if v is None:
            continue
        if isinstance(v, dict):
            out[k] = _drop_nulls(v)
        elif isinstance(v, list):
            out[k] = [
                _drop_nulls(x) if isinstance(x, dict) else x
                for x in v if x is not None
            ]
        else:
            out[k] = v
    return out


class CreatorPipeline:
    def __init__(self, fm: FileManager, client: OllamaClient, base_data_dir: Path):
        self.fm = fm
        self.client = client
        self.store = CreatorStore(base_data_dir)
        self.stages = StageRunner(fm, client)
        self.merger = EntityMerger(fm)

    # --- state -----------------------------------------------------------

    def get_state(self, story_id: str) -> CreatorState:
        state = self.store.get_state(story_id)
        if not state:
            state = self.store.init_state(story_id)
        return state

    # --- split (no LLM) ---------------------------------------------------

    def split_text(self, story_id: str, raw_text: str, book_title: str) -> CreatorState:
        story = self._require_story(story_id)
        batch_id = self._next_batch_id(story_id)
        state = self.store.ensure_batch(story_id, batch_id)
        state.status = "in_progress"
        state.current_stage = "split"

        title = (book_title or "").strip() or f"{story.title} — Chapters"
        book = self._get_or_create_book(story_id, state.book_id, title)

        chapters = split_chapters(raw_text)
        if not chapters:
            raise ValueError("No chapter text detected to split.")

        chapter_ids: List[str] = []
        for i, (ch_title, content) in enumerate(chapters, start=1):
            ch_id = f"ch-{i}"
            ch_title_clean = ch_title.strip() or f"Chapter {i}"
            chapter = Chapter(id=ch_id, title=ch_title_clean, scene_breakdown="")
            self.fm.save_chapter(story_id, book.id, chapter)
            self.fm.save_chapter_prose(story_id, book.id, ch_id, content)
            chapter_ids.append(ch_id)

        state = self.store.add_chapters(story_id, batch_id, chapter_ids)
        state = self.store.complete_stage(story_id, batch_id, "split")
        return self.get_state(story_id)

    # --- extraction stages -------------------------------------------------

    async def _gather_batch_source(self, story_id: str, batch_id: str) -> str:
        """Assemble prose for the chapters added in this batch, in order."""
        state = self.get_state(story_id)
        batch = next((b for b in state.batches if b.batch_id == batch_id), None)
        section = []
        for book in self.fm.list_books(story_id):
            for chapter in self.fm.list_chapters(story_id, book.id):
                if chapter.id in (batch.chapters_added if batch else []):
                    prose = self.fm.read_chapter_prose(story_id, book.id, chapter.id)
                    if prose.strip():
                        section.append(
                            f"### CHAPTER {chapter.title}\n(chapter_id: {chapter.id})\n\n{prose[:4000]}"
                        )
        return "\n\n---\n\n".join(section)

    async def run_stage(self, story_id: str, stage: str) -> StageResult:
        if stage not in ("characters", "world", "plot", "arcs"):
            raise ValueError(f"Unknown stage: {stage}")
        state = self.get_state(story_id)
        if not state.current_batch:
            raise ValueError("No active batch. Split text first.")
        batch_id = state.current_batch
        source = await self._gather_batch_source(story_id, batch_id)

        if stage == "characters":
            result = {"characters": await self.stages.extract_characters(story_id, source)}
            self.store.save_draft(story_id, batch_id, "characters", result)
        elif stage == "world":
            result = (await self.stages.extract_world(story_id, source)).model_dump()
            self.store.save_draft(story_id, batch_id, "world", result)
        elif stage == "plot":
            result = (await self.stages.extract_plot(story_id, source)).model_dump()
            self.store.save_draft(story_id, batch_id, "plot", result)
        elif stage == "arcs":
            source = await self._gather_arcs_source(story_id, batch_id, source)
            result = (await self.stages.extract_arcs(story_id, source)).model_dump()
            self.store.save_draft(story_id, batch_id, "arcs", result)

        state = self.get_state(story_id)
        state.current_stage = stage
        return self.store.save_state(state)

    async def _gather_arcs_source(self, story_id: str, batch_id: str, batch_source: str) -> str:
        """Arcs benefit from the already-extracted characters for name grounding."""
        state = self.get_state(story_id)
        approved_chars = self.store.load_approved(story_id, batch_id, "characters")
        names = []
        if approved_chars:
            names = [c.get("name") for c in (approved_chars.get("characters") or []) if c.get("name")]
        if names:
            return f"Character names in this story: {', '.join(names)}\n\n{batch_source}"
        return batch_source

    # --- approval / merge ---------------------------------------------------

    def approve_stage(self, story_id: str, stage: str, edited: dict) -> CreatorState:
        state = self.get_state(story_id)
        if not state.current_batch:
            raise ValueError("No active batch.")
        batch_id = state.current_batch
        self.store.save_approved(story_id, batch_id, stage, edited)

        # merge into the story
        counts = self._merge(story_id, batch_id, stage, edited)
        print(f"[creator] approved {stage} for {story_id}: {counts}")

        state = self.store.complete_stage(story_id, batch_id, stage)
        return self.get_state(story_id)

    def _merge(self, story_id: str, batch_id: str, stage: str, edited: dict) -> Dict[str, int]:
        if stage == "characters":
            return self.merger.merge_characters(story_id, edited.get("characters") or [])
        if stage == "world":
            return self.merger.merge_world(story_id, WorldStageResult(**_drop_nulls(edited)))
        if stage == "plot":
            result = PlotStageResult(**{k: v for k, v in _drop_nulls(edited).items()
                                        if k in ("beats", "themes", "overview", "chapter_summaries", "notes")})
            id_by_index = self._chapter_id_by_index(story_id, batch_id)
            return self.merger.merge_plot(
                story_id, self.get_state(story_id).book_id, result, id_by_index
            )
        if stage == "arcs":
            return self.merger.merge_arcs(
                story_id, self.get_state(story_id).book_id, ArcsStageResult(**{k: v for k, v in _drop_nulls(edited).items()
                                                                            if k in ("arcs", "notes")})
            )
        raise ValueError(f"Unknown stage: {stage}")

    def _chapter_id_by_index(self, story_id: str, batch_id: str) -> Dict[int, str]:
        """Map 1-based chapter index → chapter id for this batch's added chapters,
        ordered by their creation in the split stage (ch-1, ch-2, ...)."""
        state = self.get_state(story_id)
        batch = next((b for b in state.batches if b.batch_id == batch_id), None)
        added = batch.chapters_added if batch else []
        result: Dict[int, str] = {}
        for i, ch_id in enumerate(added, start=1):
            result[i] = ch_id
        return result

    # --- batches ---------------------------------------------------------------

    def _next_batch_id(self, story_id: str) -> str:
        state = self.get_state(story_id)
        existing = {b.batch_id for b in state.batches}
        n = 1
        while f"batch-{n}" in existing:
            n += 1
        return f"batch-{n}"

    async def start_new_batch(self, story_id: str, raw_text: str, book_title: str) -> CreatorState:
        return self.split_text(story_id, raw_text, book_title)

    # --- helpers ---------------------------------------------------------------

    def _require_story(self, story_id: str) -> Story:
        story = self.fm.get_story(story_id)
        if not story:
            raise FileNotFoundError(f"Story not found: {story_id}")
        return story

    def _get_or_create_book(self, story_id: str, book_id: str, title: str) -> Book:
        book = self.fm.get_book(story_id, book_id)
        if not book:
            order = len(self.fm.list_books(story_id)) + 1
            book = Book(
                id=book_id, title=title, order=order,
                target_word_count=0, plot_subsections=[], google_doc_url=None,
            )
            self.fm.save_book(story_id, book)
        elif title and not book.title.strip():
            book.title = title
            self.fm.save_book(story_id, book)
        return book

    def get_summary(self, story_id: str) -> CreatorSummary:
        return CreatorSummary(
            chapters=sum(len(self.fm.list_chapters(story_id, b.id)) for b in self.fm.list_books(story_id)),
            characters=len(self.fm.list_characters(story_id)),
            cities=len(self.fm.get_cities(story_id)),
            factions=len(self.fm.get_factions(story_id)),
            artifacts=len(self.fm.get_artifacts(story_id)),
            glossary=len(self.fm.get_glossary(story_id)),
            beats=sum(len(self.fm.get_plot(story_id, b.id).beats) for b in self.fm.list_books(story_id)),
            arcs=sum(len(self.fm.get_character_arcs(story_id, b.id)) for b in self.fm.list_books(story_id)),
            batches=len(self.get_state(story_id).batches),
        )
