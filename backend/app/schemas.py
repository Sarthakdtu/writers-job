from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field


class TimelineEvent(BaseModel):
    year_or_era: str
    title: str
    description: str
    book_ids: List[str] = Field(default_factory=list)


class CharacterRelationship(BaseModel):
    character_id: str
    label: str = ""


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
    mechanic_ids: List[str] = Field(default_factory=list)
    timeline_events: List[TimelineEvent] = Field(default_factory=list)
    plot_point_ids: List[str] = Field(default_factory=list)
    relationships: List[CharacterRelationship] = Field(default_factory=list)


class WorldMechanics(BaseModel):
    id: str = ""
    name: str = ""
    magic_system: str = ""
    technology_level: str = ""
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
    order: Optional[int] = 0
    pov_character_id: Optional[str] = None
    scene_breakdown: Optional[str] = ""
    markdown_file_path: Optional[str] = ""
    word_count: Optional[int] = 0
    target_word_count: Optional[int] = 0
    google_doc_id: Optional[str] = None
    image_url: Optional[str] = None


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
    relationship_label: Optional[str] = ""


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


class BookProgress(BaseModel):
    book_id: str
    title: str
    target: int
    actual: int
    percent: float


class ProductivityInsights(BaseModel):
    books_progress: List[BookProgress] = Field(default_factory=list)
    velocity_7d: float = 0.0
    velocity_14d: float = 0.0
    velocity_trend: str = "new"
    chapters_completed: int = 0
    chapters_total: int = 0
    days_since_last_session: Optional[int] = None
    longest_silent_gap: Optional[int] = None
    consistency_score: float = 0.0


class OrphanedCharacter(BaseModel):
    id: str
    name: str


class PovEntry(BaseModel):
    character_id: str
    name: str
    count: int


class FactionCoverage(BaseModel):
    id: str
    name: str
    linked_characters: int


class ArtifactOwnership(BaseModel):
    id: str
    name: str
    owners: List[str] = Field(default_factory=list)
    unowned: bool = True


class GlossarySpread(BaseModel):
    category: str
    count: int


class UnderdevelopedCity(BaseModel):
    id: str
    name: str
    key_locations_count: int


class ComprehensionInsights(BaseModel):
    character_count: int = 0
    city_count: int = 0
    faction_count: int = 0
    character_to_world_ratio: str = ""
    orphaned_characters: List[OrphanedCharacter] = Field(default_factory=list)
    pov_distribution: List[PovEntry] = Field(default_factory=list)
    faction_coverage: List[FactionCoverage] = Field(default_factory=list)
    artifact_ownership: List[ArtifactOwnership] = Field(default_factory=list)
    glossary_spread: List[GlossarySpread] = Field(default_factory=list)
    world_rules_count: int = 0
    has_magic_system: bool = False
    has_tech_level: bool = False
    characters_with_timeline: int = 0
    characters_without_timeline: int = 0
    avg_key_locations_per_city: float = 0.0
    underdeveloped_cities: List[UnderdevelopedCity] = Field(default_factory=list)


class ArcWithoutMilestones(BaseModel):
    character_id: str
    name: str


class ArcSummary(BaseModel):
    character_id: str
    name: str
    from_state: str
    to_state: str


class PlotDensityEntry(BaseModel):
    book_id: str
    title: str
    beats_per_chapter: float


class CrossBookCharacter(BaseModel):
    character_id: str
    name: str
    book_count: int
    books: List[str] = Field(default_factory=list)


class UnusedSubsection(BaseModel):
    book_id: str
    book_title: str
    subsection_title: str


class NarrativeInsights(BaseModel):
    total_beats: int = 0
    beats_with_chapter: int = 0
    beats_without_characters: int = 0
    arc_count: int = 0
    arcs_with_milestones: int = 0
    arcs_without_milestones: List[ArcWithoutMilestones] = Field(default_factory=list)
    arc_summaries: List[ArcSummary] = Field(default_factory=list)
    plot_density_per_book: List[PlotDensityEntry] = Field(default_factory=list)
    cross_book_characters: List[CrossBookCharacter] = Field(default_factory=list)
    unused_subsections: List[UnusedSubsection] = Field(default_factory=list)


class MostQuotedCharacter(BaseModel):
    id: str
    name: str
    count: int


class GalleryCategoryCount(BaseModel):
    category: str
    count: int


class TagCount(BaseModel):
    tag: str
    count: int


class InitialCount(BaseModel):
    letter: str
    count: int


class CreativeInsights(BaseModel):
    total_quotes: int = 0
    character_quotes_count: int = 0
    standalone_quotes_count: int = 0
    most_quoted_character: Optional[MostQuotedCharacter] = None
    gallery_total: int = 0
    gallery_by_category: List[GalleryCategoryCount] = Field(default_factory=list)
    top_tags: List[TagCount] = Field(default_factory=list)
    naming_initials: List[InitialCount] = Field(default_factory=list)


class MostConnectedCharacter(BaseModel):
    id: str
    name: str
    degree: int


class IsolatedCharacter(BaseModel):
    id: str
    name: str


class StrongestBond(BaseModel):
    source: str
    target: str
    weight: int


class WorldEntitySummary(BaseModel):
    characters: int = 0
    cities: int = 0
    factions: int = 0
    artifacts: int = 0
    glossary: int = 0
    total: int = 0


class RelationshipInsights(BaseModel):
    total_nodes: int = 0
    total_edges: int = 0
    relationship_density: float = 0.0
    most_connected: Optional[MostConnectedCharacter] = None
    isolated_characters: List[IsolatedCharacter] = Field(default_factory=list)
    strongest_bond: Optional[StrongestBond] = None
    world_entity_summary: WorldEntitySummary = Field(default_factory=WorldEntitySummary)


class StoryInsights(BaseModel):
    productivity: ProductivityInsights = Field(default_factory=ProductivityInsights)
    comprehension: ComprehensionInsights = Field(default_factory=ComprehensionInsights)
    narrative: NarrativeInsights = Field(default_factory=NarrativeInsights)
    creative: CreativeInsights = Field(default_factory=CreativeInsights)
    relationships: RelationshipInsights = Field(default_factory=RelationshipInsights)
    generated_at: str = ""


class GoogleAccount(BaseModel):
    email: str
    name: str = ""
    picture: str = ""
    connected_at: str
    scopes: List[str] = Field(default_factory=list)


class GoogleAuthStatus(BaseModel):
    connected: bool
    account: Optional[GoogleAccount] = None
    client_secret_available: bool
    auth_url: Optional[str] = None
    state: Optional[str] = None


class Story(BaseModel):
    id: str
    title: str
    tags: List[str] = Field(default_factory=list)
    background_url: Optional[str] = ""
    banner_url: Optional[str] = ""
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
