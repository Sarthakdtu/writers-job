"""Pipeline registry — the single catalog of AI capabilities.

Everything the app can ask Ollama to do is a *pipeline* with a stable id: built-in
analysis skills (18), import/extract pipelines (3), plus user-created custom skills
(merged in from `app.ai.custom` at read time). The registry is additive — stable ids mean
existing per-story config files keep working when new pipelines ship.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.ai.schemas import PipelineSummary


@dataclass
class StepSpec:
    prompt_key: str
    model_family: str = "text"
    temperature: Optional[float] = None
    num_predict: Optional[int] = None
    pass_prev_output: bool = False
    post_process: Optional[str] = None
    format: Optional[Any] = None


@dataclass
class PipelineDef:
    id: str
    name: str
    description: str
    family: str = "analysis"
    tabs: List[str] = field(default_factory=list)
    input_kind: str = "story_context"
    needs_images: bool = False
    needs_selection: bool = False
    selection_param: Optional[str] = None
    max_images: int = 0
    steps: List[StepSpec] = field(default_factory=list)
    model_family: str = "text"
    context_builder: Optional[str] = None
    temperature: float = 0.2
    system_prompt_key: str = "analysis"
    save_targets: List[str] = field(default_factory=list)
    is_custom: bool = False


def _text_step(key: str, **kw) -> StepSpec:
    return StepSpec(prompt_key=key, model_family="text", **kw)


def _editor_selection() -> str:
    return "chapter_id"


PIPELINES: Dict[str, PipelineDef] = {}


def _register(p: PipelineDef) -> None:
    PIPELINES[p.id] = p


# --- Home / Dashboard -----------------------------------------------------

_register(PipelineDef(
    id="story_overview",
    name="Story Overview & Insights",
    description="Narrative summary, stated themes, strengths and first-beta-reader watch-outs.",
    tabs=["dashboard", "home"],
    context_builder="story_overview",
    system_prompt_key="analysis",
    steps=[_text_step("story_overview")],
))

_register(PipelineDef(
    id="plot_holes",
    name="Plot Hole Scan",
    description="High-level scan for contradictions, unresolved setups and logic gaps across the outline.",
    tabs=["dashboard", "outliner", "editor"],
    context_builder="plot_holes",
    steps=[_text_step("plot_holes")],
))

_register(PipelineDef(
    id="pacing_analysis",
    name="Pacing & Structure",
    description="Scores pacing across beats and chapters; flags sagging and rushed stretches.",
    tabs=["dashboard", "outliner", "editor"],
    context_builder="pacing_analysis",
    steps=[_text_step("pacing_analysis")],
))

_register(PipelineDef(
    id="pitch_blurb",
    name="Blurb / Logline / Hook",
    description="One logline, three blurbs and a hook line for the current draft.",
    tabs=["home", "dashboard"],
    context_builder="pitch_blurb",
    temperature=0.7,
    system_prompt_key="creative",
    steps=[_text_step("pitch_blurb")],
))

# --- Worldbuilding --------------------------------------------------------

_register(PipelineDef(
    id="lore_check",
    name="Lore & Continuity Check",
    description="Cross-checks glossary, cities, factions, artifacts, mechanics and timelines for contradictions.",
    tabs=["world"],
    context_builder="lore_check",
    steps=[_text_step("lore_check")],
))

_register(PipelineDef(
    id="mechanics_review",
    name="Magic / Mechanics Review",
    description="Reviews the magic/tech system for rule gaps, deus-ex risk and power-balance drift.",
    tabs=["world"],
    context_builder="mechanics_review",
    steps=[_text_step("mechanics_review")],
))

_register(PipelineDef(
    id="world_scene_ideas",
    name="Setting Detail Enhancer",
    description="Concrete, scene-settable sensory details per city and faction.",
    tabs=["world"],
    context_builder="world_scene_ideas",
    temperature=0.6,
    system_prompt_key="creative",
    steps=[_text_step("world_scene_ideas")],
))

# --- Character Roster -----------------------------------------------------

_register(PipelineDef(
    id="character_trajectory",
    name="Character Trajectory Recommendation",
    description="Recommended arc, milestones, conflicts and a motivation refocus for a character.",
    tabs=["characters"],
    input_kind="selection",
    needs_selection=True,
    selection_param="character_id",
    context_builder="character_trajectory",
    steps=[_text_step("character_trajectory")],
))

_register(PipelineDef(
    id="character_consistency",
    name="Character Consistency Check",
    description="Compares a character's profile to prose excerpts where they appear.",
    tabs=["characters", "editor"],
    input_kind="selection",
    needs_selection=True,
    selection_param="character_id",
    context_builder="character_consistency",
    steps=[_text_step("character_consistency")],
))

_register(PipelineDef(
    id="dialogue_voice",
    name="Dialogue & Voice Coach",
    description="Builds a voice profile and flags flat dialogue with rewrites.",
    tabs=["characters", "editor"],
    input_kind="selection",
    needs_selection=True,
    selection_param="character_id",
    context_builder="dialogue_voice",
    steps=[_text_step("dialogue_voice")],
))

# --- Book Outliner --------------------------------------------------------

_register(PipelineDef(
    id="gap_finder",
    name="Missing Scene / Thread Finder",
    description="Finds dangling threads, unused setups and missing bridges across the outline.",
    tabs=["outliner"],
    context_builder="gap_finder",
    steps=[_text_step("gap_finder")],
))

_register(PipelineDef(
    id="arc_trajectories",
    name="Cast Arc Trajectories",
    description="Assesses every character arc against the beats they appear in.",
    tabs=["outliner", "characters"],
    context_builder="arc_trajectories",
    steps=[_text_step("arc_trajectories")],
))

_register(PipelineDef(
    id="pov_balance",
    name="POV Balance Check",
    description="Shows POV distribution; flags under-used POVs and long droughts.",
    tabs=["outliner"],
    context_builder="pov_balance",
    steps=[_text_step("pov_balance")],
))

_register(PipelineDef(
    id="twist_check",
    name="Twist / Reveal Fairness",
    description="For each twist beat: what setup the reader has and what's still missing.",
    tabs=["outliner"],
    context_builder="twist_check",
    steps=[_text_step("twist_check")],
))

# --- Draft Editor ---------------------------------------------------------

for _pid, _name, _desc, _temp in [
    ("prose_critique", "Prose Critique", "Line-referenced strengths, dead weight and quick wins for the open chapter.", 0.2),
    ("continue_writing", "Continue the Scene", "A tone-matched continuation of 2–3 paragraphs advancing toward the beat.", 0.8),
    ("continuity_check", "Chapter x Outline Continuity", "Deviations, dropped beats and accidental retcons in the open chapter.", 0.2),
    ("show_tell", "Show vs Tell Audit", "Specific 'told' sentences with one-line show alternatives.", 0.3),
]:
    _register(PipelineDef(
        id=_pid,
        name=_name,
        description=_desc,
        tabs=["editor"],
        input_kind="selection",
        needs_selection=True,
        selection_param=_editor_selection(),
        context_builder=_pid,
        temperature=_temp,
        system_prompt_key="creative" if _pid == "continue_writing" else "analysis",
        steps=[_text_step(_pid)],
    ))

# --- Import & Extract pipelines -------------------------------------------

_register(PipelineDef(
    id="handwriting_ocr",
    name="Handwriting → Text",
    description="Extract text from photos of handwritten notes, then clean it with an editor pass.",
    family="import",
    tabs=["import", "characters", "world", "editor", "dashboard", "outliner", "home"],
    input_kind="images",
    needs_images=True,
    max_images=6,
    save_targets=["character.notes", "story.notes", "overview", "prose.insert", "clipboard"],
    model_family="ocr",
    context_builder=None,
    steps=[
        StepSpec(prompt_key="ocr_extract", model_family="ocr", temperature=0.0),
        StepSpec(prompt_key="ocr_cleanup", model_family="text", temperature=0.1, pass_prev_output=True),
    ],
))

_register(PipelineDef(
    id="concept_art_caption",
    name="Concept Art → Lore Caption",
    description="Describe a concept art image, then polish the caption into gallery-ready lore.",
    family="import",
    tabs=["import", "world"],
    input_kind="images",
    needs_images=True,
    max_images=1,
    save_targets=["gallery.context", "character.gallery", "clipboard"],
    model_family="vision",
    context_builder=None,
    steps=[
        StepSpec(prompt_key="art_describe", model_family="vision", temperature=0.2),
        StepSpec(prompt_key="art_polish", model_family="text", temperature=0.4, pass_prev_output=True),
    ],
))

_register(PipelineDef(
    id="sticky_notes_dump",
    name="Photo Sticky-Notes → Notes",
    description="Transcribe a wall of sticky notes, deduplicate and group them by topic.",
    family="import",
    tabs=["import", "characters", "dashboard"],
    input_kind="images",
    needs_images=True,
    max_images=6,
    save_targets=["story.notes", "character.notes", "clipboard"],
    model_family="ocr",
    context_builder=None,
    steps=[
        StepSpec(prompt_key="ocr_extract_all", model_family="ocr", temperature=0.0),
        StepSpec(prompt_key="notes_group", model_family="text", temperature=0.1, pass_prev_output=True),
    ],
))


def all_pipeline_ids() -> List[str]:
    return sorted(PIPELINES.keys())


def get_builtin(pipeline_id: str) -> Optional[PipelineDef]:
    return PIPELINES.get(pipeline_id)


def filter_for_tab(tab: Optional[str]) -> List[PipelineDef]:
    if not tab:
        return list(PIPELINES.values())
    return [p for p in PIPELINES.values() if p.family == "import" or tab in p.tabs]


def to_summary(p: PipelineDef, enabled: bool) -> PipelineSummary:
    selection_param = p.selection_param
    if p.needs_selection and not selection_param:
        selection_param = {
            "characters": "character_id",
            "outliner": "book_id",
            "editor": "chapter_id",
        }.get((p.tabs or ["story"])[0])
    return PipelineSummary(
        id=p.id,
        name=p.name,
        description=p.description,
        family=p.family,
        input_kind=p.input_kind,
        tabs=p.tabs,
        enabled=enabled,
        needs_images=p.needs_images,
        needs_selection=p.needs_selection,
        selection_param=selection_param,
        max_images=p.max_images,
        save_targets=p.save_targets,
        temperature=p.temperature,
        is_custom=p.is_custom,
    )