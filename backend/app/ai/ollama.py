"""Generic async Ollama transport.

Single entry point for every AI call in the suite: `complete()`. Callers express
what the model must be able to do (`needs={"vision"}` etc.) and which model family
they prefer; `resolve_model` picks a concrete installed model and `complete` builds
the OAI-style chat payload (text + base64 images), calls `/api/chat`, and returns a
typed result.

Capability tagging (per plan §3.3) is a heuristic over Ollama's model metadata plus a
config-driven override escape hatch in `app.ai.config.get_capability_override`.
"""
import asyncio
import re
from typing import Any, Dict, List, Optional, Set

import httpx
from pydantic import BaseModel, Field

from app.ai import config as ai_config
from app.ai.schemas import ModelInfo

ALL_CAPABILITIES = ("text", "vision", "ocr", "code")

_TEXT_ONLY_FAMILIES = {
    "qwen", "qwen2", "qwen2.5", "qwq", "llama", "mistral", "mixtral", "gemma",
    "gemma2", "deepseek", "phi", "command-r", "falcon", "yi", "llama3",
}

_VISION_FAMILIES = {
    "clip", "vision", "llava", "minicpm-v", "glm-4v", "gemma3", "qwen2-vl",
    "qwen2.5-vl", "olmocr", "internvl", "moondream",
}

_OCR_NAME_PATTERN = re.compile(r"(ocr|glm-ocr|olmocr)", re.IGNORECASE)
_CODE_NAME_PATTERN = re.compile(r"(coder|code|deepseek-coder)", re.IGNORECASE)
_VISION_NAME_PATTERN = re.compile(
    r"(vl|vision|llava|minicpm|glm-4v|gemma3|ocr|internvl)", re.IGNORECASE
)


class OllamaMessage(BaseModel):
    role: str
    content: str
    images: List[str] = Field(default_factory=list)


class OllamaRequest(BaseModel):
    model: str
    messages: List[OllamaMessage]
    temperature: Optional[float] = None
    num_predict: Optional[int] = None
    format: Optional[Any] = None
    options: Dict[str, Any] = Field(default_factory=dict)


class OllamaResponse(BaseModel):
    model: str
    content: str
    prompt_eval_count: Optional[int] = None
    eval_count: Optional[int] = None
    error: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None


def detect_capabilities(name: str, families: List[str]) -> List[str]:
    name_lower = name.lower()
    family_set = {f.lower() for f in families if f}
    caps: Set[str] = {"text"}

    override = ai_config.get_capability_override(name_lower)
    if override is not None:
        return [c.strip().lower() for c in override.split(",") if c.strip()]

    is_vision = bool(family_set & _VISION_FAMILIES) or bool(
        _VISION_NAME_PATTERN.search(name_lower)
    )
    if is_vision:
        caps.add("vision")
    if name_lower in ai_config.get_ocr_model().lower() or _OCR_NAME_PATTERN.search(name_lower):
        caps.add("ocr")
    if _CODE_NAME_PATTERN.search(name_lower):
        caps.add("code")
    return sorted(caps)


def format_size(size_bytes: int) -> str:
    gb = size_bytes / (1024 ** 3)
    return f"{gb:.1f} GB"


class OllamaClient:
    """Thin async client over Ollama's HTTP API."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or ai_config.get_ollama_base_url()

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(
                timeout=3.0, follow_redirects=True
            ) as client:
                resp = await client.get(self._url("/api/version"))
                return resp.status_code < 400
        except (httpx.HTTPError, OSError):
            return False

    async def list_models(self) -> List[ModelInfo]:
        async with httpx.AsyncClient(
            timeout=ai_config.get_ollama_timeout_s(), follow_redirects=True
        ) as client:
            resp = await client.get(self._url("/api/tags"))
            if resp.status_code >= 400:
                raise OllamaError(f"Ollama /api/tags failed: HTTP {resp.status_code}")
            data = resp.json()
        models: List[ModelInfo] = []
        for item in data.get("models", []):
            name = item.get("name", "")
            families = (item.get("details") or {}).get("families") or []
            models.append(
                ModelInfo(
                    name=name,
                    size=format_size(int(item.get("size", 0))),
                    capabilities=detect_capabilities(name, families),
                )
            )
        return sorted(models, key=lambda m: m.name)

    async def complete(self, req: OllamaRequest) -> OllamaResponse:
        payload: Dict[str, Any] = {
            "model": req.model,
            "stream": False,
            "messages": [m.model_dump(exclude_none=True) for m in req.messages],
        }
        options: Dict[str, Any] = dict(req.options)
        if req.temperature is not None:
            options.setdefault("temperature", req.temperature)
        if req.num_predict is not None:
            options.setdefault("num_predict", req.num_predict)
        if req.format is not None:
            payload["format"] = req.format
        if options:
            payload["options"] = options

        try:
            async with httpx.AsyncClient(
                timeout=ai_config.get_ollama_timeout_s(), follow_redirects=True
            ) as client:
                resp = await client.post(
                    self._url("/api/chat"), json=payload
                )
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as exc:
            return OllamaResponse(
                model=req.model,
                content="",
                error=f"Ollama request failed: {exc}",
            )

        if resp.status_code >= 400:
            try:
                detail = resp.json().get("error", resp.text)
            except ValueError:
                detail = resp.text
            return OllamaResponse(
                model=req.model, content="", error=f"Ollama HTTP {resp.status_code}: {detail}"
            )

        data = resp.json()
        msg = data.get("message") or {}
        resp_model = data.get("model", req.model)
        return OllamaResponse(
            model=resp_model,
            content=msg.get("content", ""),
            prompt_eval_count=data.get("prompt_eval_count"),
            eval_count=data.get("eval_count"),
            raw=data,
        )


def model_matches(m: ModelInfo, needs: Set[str], family: Optional[str] = None) -> bool:
    if family and family != "any":
        if family == "vision" and "vision" not in m.capabilities:
            return False
        if family == "ocr" and "ocr" not in m.capabilities:
            return False
        if family == "text" and "text" not in m.capabilities:
            return False
    return needs <= set(m.capabilities)


async def resolve_model(
    client: OllamaClient,
    models: List[ModelInfo],
    preferred: str,
    needs: Optional[Set[str]] = None,
    family: Optional[str] = None,
) -> ModelInfo:
    needs = needs or {"text"}
    if preferred and any(m.name == preferred for m in models):
        return next(m for m in models if m.name == preferred)
    for m in models:
        if model_matches(m, needs, family):
            return m
    raise OllamaError(
        f"No installed model supports {sorted(needs)}"
        + (f" for family '{family}'" if family else "")
        + f". Pull one first: ollama pull <model>"
    )


class OllamaError(Exception):
    pass


_model_cache_ts: float = 0.0
_model_cache: Optional[List[ModelInfo]] = None
_STATUS_CACHE_SECONDS = 30.0


def reset_model_cache() -> None:
    global _model_cache_ts, _model_cache
    _model_cache_ts = 0.0
    _model_cache = None


async def cached_models(client: OllamaClient) -> Optional[List[ModelInfo]]:
    """Installed models with a 30s TTL cache; None when Ollama is offline."""
    global _model_cache_ts, _model_cache
    now = asyncio.get_running_loop().time()
    if _model_cache is not None and now - _model_cache_ts < _STATUS_CACHE_SECONDS:
        return _model_cache
    if not await client.health():
        return None
    try:
        models = await client.list_models()
    except (httpx.HTTPError, OllamaError, OSError, ValueError):
        return None
    _model_cache = models
    _model_cache_ts = now
    return models