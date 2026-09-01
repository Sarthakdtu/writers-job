"""Pydantic models for the AI module (status, pipelines, jobs, results, skills)."""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# --- status / models ---

class ModelInfo(BaseModel):
    name: str
    size: str
    capabilities: List[str] = Field(default_factory=list)


class AIStatus(BaseModel):
    available: bool
    ollama_base_url: str
    models: List[ModelInfo] = Field(default_factory=list)
    default_model: str
    ocr_model: str
    vision_model: str
    router_model: str
    error_hint: Optional[str] = None
    running_jobs: int = 0
    queued_jobs: int = 0


# --- pipelines ---

class PipelineSummary(BaseModel):
    id: str
    name: str
    description: str
    family: Literal["analysis", "import"]
    input_kind: Literal["story_context", "selection", "images", "text"]
    tabs: List[str] = Field(default_factory=list)
    enabled: bool = True
    needs_images: bool = False
    needs_selection: bool = False
    selection_param: Optional[str] = None
    max_images: int = 0
    save_targets: List[str] = Field(default_factory=list)
    temperature: float = 0.2
    is_custom: bool = False


# --- per-story config ---

class AIConfig(BaseModel):
    enabled_skills: Optional[List[str]] = None
    model: str
    ocr_model: str
    vision_model: str
    router_model: str
    temperature_override: Optional[float] = None


# --- run / jobs ---

class RunInput(BaseModel):
    images: List[str] = Field(default_factory=list)
    text: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)


class RunRequest(BaseModel):
    story_id: str
    skill: str
    input: Optional[RunInput] = None


class AIJob(BaseModel):
    id: str
    story_id: str
    pipeline: str
    family: Literal["analysis", "import"]
    status: Literal["pending", "running", "done", "error", "cancelled", "interrupted"]
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    input_summary: str = ""
    error_message: Optional[str] = None
    result_path: Optional[str] = None
    model: Optional[str] = None
    steps_done: int = 0
    steps_total: int = 0
    progress: float = 0.0
    stage: Optional[str] = None
    queue_position: int = 0
    archived: bool = False


class AIResult(BaseModel):
    pipeline: str
    family: Literal["analysis", "import"]
    model: str
    created_at: str
    content: str
    save_targets: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    is_custom: bool = False


# --- skill studio / context router ---

class CustomSkillPayload(BaseModel):
    name: str
    description: str = ""
    prompt: str
    model_family: Literal["text", "vision", "ocr"] = "text"
    temperature: float = 0.2
    input_kind: Literal["story_context", "selection", "text", "images"] = "story_context"
    tabs: List[str] = Field(default_factory=list)
    max_images: int = 0
    save_targets: List[str] = Field(default_factory=list)
    hint: Optional[str] = None
    routing_mode: Optional[Literal["auto", "locked"]] = None
    routing_sources: Optional[List[str]] = None


class RoutingBlock(BaseModel):
    mode: Literal["auto", "locked"] = "auto"
    sources: List[str] = Field(default_factory=list)
    params_hint: List[str] = Field(default_factory=list)
    reason: str = ""
    routed_at: Optional[str] = None
    routed_by: str = "fallback"


class CustomSkill(CustomSkillPayload):
    id: str
    routing: RoutingBlock = Field(default_factory=RoutingBlock)
    created_at: str = ""
    updated_at: str = ""


class RouterRequest(BaseModel):
    name: str
    description: str = ""
    prompt: str
    hint: Optional[str] = None


class RouterDecision(BaseModel):
    sources: List[str] = Field(default_factory=list)
    params_hint: List[str] = Field(default_factory=list)
    reason: str = ""
    routed_by: Literal["llm", "fallback"] = "fallback"