from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field


class TimelineEvent(BaseModel):
    year_or_era: str
    title: str
    description: str
    book_ids: List[str] = Field(default_factory=list)


class Character(BaseModel):
    id: str
    name: str
    image_url: Optional[str] = ""
    role: Optional[str] = "Main Character"
    bio: Optional[str] = ""
    timeline_events: List[TimelineEvent] = Field(default_factory=list)
    plot_point_ids: List[str] = Field(default_factory=list)


class WorldMechanics(BaseModel):
    magic_system: str
    technology_level: str
    global_rules: List[str] = Field(default_factory=list)


class City(BaseModel):
    id: str
    name: str
    region: str
    atmosphere: str
    key_locations: List[str] = Field(default_factory=list)


class Faction(BaseModel):
    id: str
    name: str
    description: str
    leader: Optional[str] = ""
    alignment: Optional[str] = ""


class Artifact(BaseModel):
    id: str
    name: str
    type: str
    properties: str
    location: Optional[str] = ""


class GlossaryTerm(BaseModel):
    id: str
    term: str
    definition: str
    category: str


class GalleryItem(BaseModel):
    id: str
    title: str
    image_url: str
    context: str
    category: Optional[str] = "Concept Art"


class PlotSubsection(BaseModel):
    title: str
    description: str


class Book(BaseModel):
    id: str
    title: str
    order: int
    target_word_count: int
    plot_subsections: List[PlotSubsection] = Field(default_factory=list)
    google_doc_url: Optional[str] = None


class Chapter(BaseModel):
    id: str
    title: str
    pov_character_id: Optional[str] = None
    scene_breakdown: Optional[str] = ""
    markdown_file_path: Optional[str] = ""
    word_count: Optional[int] = 0
    google_doc_id: Optional[str] = None


class PlotBeat(BaseModel):
    id: str
    title: str
    description: str
    chapter_id: Optional[str] = None
    character_ids: List[str] = Field(default_factory=list)


class Plot(BaseModel):
    beats: List[PlotBeat] = Field(default_factory=list)
    theme: Optional[str] = ""


class CharacterArc(BaseModel):
    character_id: str
    arc_summary: str
    starting_state: str
    ending_state: str
    key_milestones: List[str] = Field(default_factory=list)


class AppearanceBook(BaseModel):
    id: str
    title: str


class AppearanceChapter(BaseModel):
    id: str
    book_id: str
    title: str
    is_pov: bool


class AppearancePlotPoint(BaseModel):
    id: str
    book_id: str
    title: str
    description: str


class CharacterAppearances(BaseModel):
    character_id: str
    books: List[AppearanceBook] = Field(default_factory=list)
    chapters: List[AppearanceChapter] = Field(default_factory=list)
    plot_points: List[AppearancePlotPoint] = Field(default_factory=list)


class Story(BaseModel):
    id: str
    title: str
    tags: List[str] = Field(default_factory=list)
    background_url: Optional[str] = ""
    theme: Literal["sepia", "midnight", "paper"] = "sepia"
    aesthetic_theme: Optional[str] = "sepia"
    background_path: Optional[str] = ""
    google_doc_ids: Dict[str, str] = Field(default_factory=dict)
