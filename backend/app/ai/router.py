"""Context Router — decides which data stores ground a custom skill's prompt.

Answers "given this prompt + an author hint, which story data stores must the Ollama
client read?" Two paths:
  * LLM (default): one `format:"json"` call to the configured router model (temp 0).
  * Keyword fallback: deterministic matcher used when Ollama is unreachable or the LLM
    output is malformed, so creating a skill never hard-fails offline. The decision
    carries `routed_by: "llm" | "fallback"` for the Studio's badge.
"""
import json
import re
from typing import Dict, List, Optional

from app.ai import config as ai_config
from app.ai.ollama import OllamaClient, OllamaError, OllamaMessage, OllamaRequest
from app.ai.prompts import ROUTER_SYSTEM
from app.ai.schemas import RouterDecision

SOURCE_KEYWORDS: List[tuple] = [
    ("world_cities", ("city", "cities", "town", "location", "region", "atmosphere")),
    ("world_factions", ("faction", "factions", "guild", "order", "clan", "house")),
    ("world_artifacts", ("artifact", "artifacts", "relic", "magic item", "weapon", "object")),
    ("world_glossary", ("glossary", "term", "terminology", "lore word")),
    ("world_mechanics", ("magic", "mechanics", "technology", "system", "rule", "power balance")),
    ("characters", ("character", "characters", "cast", "protagonist", "antagonist", "pov",
                    "roster", "person", "oc")),
    ("arcs", ("arc", "arcs", "trajectory", "milestone", "growth")),
    ("plot", ("plot", "beat", "beats", "twist", "reveal", "subplot", "vow", "promise",
              "setup", "outline", "scene", "continuity", "hole")),
    ("books", ("book", "books", "trilogy", "series", "volume")),
    ("timeline", ("timeline", "timeline", "years", "era", "chronology", "dates")),
    ("chapter_prose", ("chapter", "prose", "draft", "paragraph", "scene", "text", "write",
                       "continue", "dialogue", "rewrite", "edit", "critique")),
    ("overview", ("overview", "synopsis", "summary", "premise", "story so far")),
    ("gallery", ("art", "image", "concept art", "visual", "picture")),
]

PARAM_KEYWORDS: List[tuple] = [
    ("character_id", ("character", "cast", "protagonist", "antagonist", "pov")),
    ("chapter_id", ("chapter", "open chapter", "draft", "prose")),
    ("book_id", ("book", "trilogy", "volume")),
]


async def route_skill(
    client: OllamaClient,
    payload: Dict[str, Optional[str]],
) -> RouterDecision:
    name = payload.get("name") or ""
    description = payload.get("description") or ""
    prompt = payload.get("prompt") or ""
    hint = payload.get("hint")

    try:
        models = await _installed_models(client)
        if not models:
            return _keyword_decision(name, description, prompt, hint)
        decision = await _llm_route(client, models, payload)
        return decision
    except (OllamaError, Exception):
        return _keyword_decision(name, description, prompt, hint)


async def _installed_models(client: OllamaClient):
    if not await client.health():
        return []
    try:
        return await client.list_models()
    except Exception:
        return []


async def _llm_route(
    client: OllamaClient,
    models,
    payload: Dict[str, Optional[str]],
) -> RouterDecision:
    name = payload.get("name") or ""
    description = payload.get("description") or ""
    prompt = payload.get("prompt") or ""
    hint = payload.get("hint")
    source_list = (
        "overview, characters, world_cities, world_factions, world_artifacts, "
        "world_glossary, world_mechanics, books, plot, arcs, chapter_prose, timeline, "
        "gallery, none"
    )
    user_text = (
        f"Skill: {name}\nDescription: {description}\nAuthor hint: {hint or 'none'}\n\n"
        f"Prompt:\n{prompt}\n\nSources available: {source_list}\n"
        "Decide which sources this prompt needs. Return strict JSON only: "
        '{"sources": ["..."], "params_hint": ["..."], "reason": "..."}'
    )
    model = ai_config.get_router_model()
    if not any(m.name == model for m in models):
        fallback_models = [m for m in models if "text" in m.capabilities]
        model = fallback_models[0].name if fallback_models else model

    resp = await client.complete(OllamaRequest(
        model=model,
        messages=[
            OllamaMessage(role="system", content=ROUTER_SYSTEM),
            OllamaMessage(role="user", content=user_text),
        ],
        temperature=0.0,
        format="json",
        options={"think": False},
    ))
    if resp.error:
        return _keyword_decision(name, description, prompt, hint)
    parsed = _parse_json(resp.content)
    if parsed is None:
        return _keyword_decision(name, description, prompt, hint)
    sources = _sanitize_sources(parsed.get("sources", []))
    if not sources:
        return _keyword_decision(name, description, prompt, hint)
    return RouterDecision(
        sources=sources,
        params_hint=_sanitize_params(parsed.get("params_hint", [])),
        reason=str(parsed.get("reason") or "")[:300],
        routed_by="llm",
    )


def _parse_json(text: str) -> Optional[Dict]:
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except ValueError:
        return None


_ALLOWED_SOURCES = {
    "overview", "characters", "world_cities", "world_factions", "world_artifacts",
    "world_glossary", "world_mechanics", "books", "plot", "arcs", "chapter_prose",
    "timeline", "gallery", "none",
}


def _sanitize_sources(sources) -> List[str]:
    out = []
    for s in sources if isinstance(sources, list) else []:
        if isinstance(s, str) and s in _ALLOWED_SOURCES:
            if s not in out:
                out.append(s)
    return out


def _sanitize_params(params) -> List[str]:
    allowed = {"character_id", "book_id", "chapter_id"}
    out = []
    for p in params if isinstance(params, list) else []:
        if isinstance(p, str) and p in allowed and p not in out:
            out.append(p)
    return out


def _keyword_decision(name, description, prompt, hint) -> RouterDecision:
    blob = f"{name} {description} {prompt}".lower()
    blob = re.sub(r"\s+", " ", blob)
    hint_override = {
        "whole story": ["overview", "characters", "plot", "books", "arcs"],
        "my characters": ["characters", "arcs", "timeline", "chapter_prose"],
        "plot & structure": ["plot", "arcs", "books", "chapter_prose"],
        "the open chapter": ["chapter_prose", "plot", "arcs"],
        "world lore": ["world_cities", "world_factions", "world_artifacts",
                       "world_glossary", "world_mechanics", "timeline"],
        "nothing": ["none"],
    }
    if hint and hint in hint_override:
        sources = hint_override[hint]
    else:
        sources = [src for src, words in SOURCE_KEYWORDS if any(w in blob for w in words)]
    sources = [s for s in _unique(sources)]

    params = []
    for key, words in PARAM_KEYWORDS:
        if any(w in blob for w in words):
            params.append(key)

    if not sources:
        sources = ["overview"]
    reason = ("keyword match from name/description/prompt"
              + (f" and author hint '{hint}'" if hint else ""))
    return RouterDecision(sources=sources, params_hint=params, reason=reason, routed_by="fallback")


def _unique(seq) -> List[str]:
    seen = set()
    out = []
    for x in seq:
        if x in _ALLOWED_SOURCES and x not in seen:
            out.append(x)
            seen.add(x)
    return out