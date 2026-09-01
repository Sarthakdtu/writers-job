"""Pydantic models for the Creator Pipeline (state, draft results, approval)."""
import re
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower().strip())
    return s.strip("-") or "item"


# --- Split stage ----------------------------------------------------------

class SplitChapter(BaseModel):
    id: str
    index: int
    title: str
    word_count: int
    preview: str


class SplitResult(BaseModel):
    book_title: str
    chapters: List[SplitChapter] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


# --- Extracted entities ----------------------------------------------------

class ExtractedRelationship(BaseModel):
    target: str
    type: str = ""
    description: str = ""


class ExtractedCharacter(BaseModel):
    name: str
    role: str = "supporting"
    bio: str = ""
    aliases: List[str] = Field(default_factory=list)
    traits: List[str] = Field(default_factory=list)
    relationships: List[ExtractedRelationship] = Field(default_factory=list)


class ExtractedCity(BaseModel):
    name: str
    region: str = ""
    atmosphere: str = ""
    key_locations: List[str] = Field(default_factory=list)


class ExtractedFaction(BaseModel):
    name: str
    description: str = ""
    leader: str = ""
    alignment: str = ""


class ExtractedArtifact(BaseModel):
    name: str
    type: str = ""
    properties: str = ""
    location: str = ""
    belongs_to: List[str] = Field(default_factory=list)


class ExtractedGlossaryTerm(BaseModel):
    term: str
    definition: str = ""
    category: str = ""


class WorldStageResult(BaseModel):
    cities: List[ExtractedCity] = Field(default_factory=list)
    factions: List[ExtractedFaction] = Field(default_factory=list)
    artifacts: List[ExtractedArtifact] = Field(default_factory=list)
    glossary: List[ExtractedGlossaryTerm] = Field(default_factory=list)
    magic_system: str = ""
    technology_level: str = ""
    global_rules: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class ExtractedPlotBeat(BaseModel):
    title: str
    description: str = ""
    chapter_index: int = 0
    chapter_id: str = ""
    character_names: List[str] = Field(default_factory=list)
    importance: str = "minor"


class PlotStageResult(BaseModel):
    beats: List[ExtractedPlotBeat] = Field(default_factory=list)
    themes: List[str] = Field(default_factory=list)
    overview: List[str] = Field(default_factory=list)
    chapter_summaries: Dict[str, str] = Field(default_factory=dict)
    notes: List[str] = Field(default_factory=list)


class ExtractedArc(BaseModel):
    character_name: str
    arc_summary: str = ""
    starting_state: str = ""
    ending_state: str = ""
    key_milestones: List[str] = Field(default_factory=list)


class ArcsStageResult(BaseModel):
    arcs: List[ExtractedArc] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


# Discriminated-union style stage result wrapper
StageResult = Dict[str, Any]


# --- Pipeline state ---------------------------------------------------------

class CreatorBatchInfo(BaseModel):
    batch_id: str
    chapter_range: str = ""
    created_at: str
    completed_at: Optional[str] = None
    stages_completed: List[str] = Field(default_factory=list)
    chapters_added: List[str] = Field(default_factory=list)


class CreatorState(BaseModel):
    story_id: str
    book_id: str = "1"
    status: Literal["draft", "in_progress", "review", "complete"] = "draft"
    current_batch: Optional[str] = None
    current_stage: Optional[str] = None
    batches: List[CreatorBatchInfo] = Field(default_factory=list)
    drafted_stages: List[str] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


class CreatorSummary(BaseModel):
    chapters: int = 0
    characters: int = 0
    cities: int = 0
    factions: int = 0
    artifacts: int = 0
    glossary: int = 0
    beats: int = 0
    arcs: int = 0
    batches: int = 0


STAGE_NAMES = ["split", "characters", "world", "plot", "arcs"]
