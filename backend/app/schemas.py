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
    location: Optional[str] = ""
    bio: Optional[str] = ""
    persona: Optional[str] = ""
    notes: List[str] = Field(default_factory=list)
    quotes: List[str] = Field(default_factory=list)
    gallery: List[str] = Field(default_factory=list)
    artifact_ids: List[str] = Field(default_factory=list)
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
    image_url: Optional[str] = ""
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
    image_url: Optional[str] = ""
    belongs_to: List[str] = Field(default_factory=list)
    timeline: List[TimelineEvent] = Field(default_factory=list)


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
    tags: List[str] = Field(default_factory=list)


class Quote(BaseModel):
    id: str
    text: str
    note: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)


class StoryImageItem(BaseModel):
    source: str
    id: str
    title: str
    image_url: str
    context: str = ""
    category: str = "Concept Art"
    tags: List[str] = Field(default_factory=list)
    character_id: Optional[str] = None
    character_name: Optional[str] = None


class EntityRefItem(BaseModel):
    """
    One referenceable entity for the @-mention picker and hover previews.
    `type` is one of: character | city | faction | artifact | glossary.
    `overview` is a short text blurb shown in the hover tooltip.
    """
    type: str
    id: str
    name: str
    label: str = ""
    image_url: str = ""
    overview: str = ""


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


class CharacterMapNode(BaseModel):
    id: str
    name: str
    image_url: Optional[str] = ""
    role: Optional[str] = ""
    degree: int = 0


class CharacterMapChapter(BaseModel):
    book_id: str
    book_title: str
    id: str
    title: str


class CharacterMapInteraction(BaseModel):
    book_id: str
    book_title: str
    beat_id: str
    beat_title: str
    beat_description: Optional[str] = ""
    chapter: Optional[CharacterMapChapter] = None


class CharacterMapEdge(BaseModel):
    id: str
    source: str
    target: str
    weight: int = 1
    interactions: List[CharacterMapInteraction] = Field(default_factory=list)


class CharacterMap(BaseModel):
    nodes: List[CharacterMapNode] = Field(default_factory=list)
    edges: List[CharacterMapEdge] = Field(default_factory=list)


class WritingStatsDay(BaseModel):
    date: str
    words: int
    chapters: int


class WritingStats(BaseModel):
    total_words: int
    total_chapters: int
    current_streak: int
    longest_streak: int
    today_words: int
    today_chapters: int
    writing_days_total: int
    last_active: Optional[str] = None
    recent_activity: List[WritingStatsDay] = Field(default_factory=list)


class Story(BaseModel):
    id: str
    title: str
    tags: List[str] = Field(default_factory=list)
    background_url: Optional[str] = ""
    background_images: List[str] = Field(default_factory=list)
    theme: Literal[
        "sepia", "midnight", "typewriter", "forest", "obsidian",
        "arsenic", "moonlight", "milktea", "crimson", "sage",
    ] = "sepia"
    aesthetic_theme: Optional[str] = "sepia"
    background_path: Optional[str] = ""
    google_doc_ids: Dict[str, str] = Field(default_factory=dict)
    overview: List[str] = Field(default_factory=list)
    deleted: bool = Field(default=False)
    deleted_at: Optional[str] = None
