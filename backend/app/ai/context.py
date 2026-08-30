"""Context engineering: per-pipeline builders + the router's `build_context_from_sources`.

Every builder returns a **small, useful slice** of the story (never the whole thing),
trimmed to per-source caps whose sums stay near `OLLAMA_CONTEXT_BUDGET_CHARS`. Prose is
sampled rather than dumped (`slice_span`: head+middle+tail) so pacing/continuity skills
see the shape without token blowout. Nothing reads or writes files here — contexts come
from `FileManager` (the single source of truth).
"""
import json
from typing import Any, Dict, List, Optional

from app.ai import config as ai_config

BUDGET = ai_config.get_context_budget_chars()
_ANALYSIS_CH = 12000


# --- helpers ---------------------------------------------------------------

def cap_text(text: str, limit: int) -> str:
    if text is None:
        return ""
    text = str(text).strip()
    return text[:limit] if len(text) > limit else text


def slice_span(text: str, cap: int) -> str:
    """head 40% + middle 30% + tail 30%, joined with […], keeping word boundaries."""
    if text is None:
        return ""
    text = text.strip()
    if len(text) <= cap or cap < 60:
        return text
    head_n = int(cap * 0.4)
    mid_n = int(cap * 0.3)
    tail_n = cap - head_n - mid_n
    head = text[:head_n].rsplit(" ", 1)[0]
    mid_s = len(text) // 2 - mid_n // 2
    mid = text[mid_s:mid_s + mid_n]
    if " " in mid:
        mid = mid.split(" ", 1)[1]
    tail = text[-tail_n:].split(" ", 1)[1] if " " in text[-tail_n:] else text[-tail_n:]
    return f"{head}\n[…] {mid} […]\n{tail}"


def json_compact(data: Any, limit: Optional[int] = None) -> str:
    s = json.dumps(data, indent=1, ensure_ascii=False)
    if limit and len(s) > limit:
        return s[:limit] + '…"'
    return s


def _compact(books: List[Any]) -> List[Dict[str, Any]]:
    out = []
    for total_idx, b in enumerate(books):
        out.append({
            "book": getattr(b, "title", str(b)),
            "order": getattr(b, "order", total_idx + 1),
        })
    return out


def _save_notes(notes: Optional[List[str]], msg: str) -> None:
    if notes is not None:
        notes.append(msg)


# --- per-source builders (used by the Context Router) ----------------------

def build_overview(fm, story, params=None) -> Dict[str, Any]:
    return {
        "title": getattr(story, "title", ""),
        "tags": list(getattr(story, "tags", []) or []),
        "theme": getattr(story, "theme", ""),
        "overview": cap_text("\n\n".join(story.overview or []), 4000),
    }


def build_characters(fm, story, params=None) -> Dict[str, Any]:
    chars = fm.list_characters(story.id)
    if params and params.get("character_id"):
        target = [c for c in chars if c.id == params["character_id"]]
        scope = target or chars
    else:
        scope = chars
    return {"characters": [
        {
            "id": c.id, "name": c.name, "role": c.role, "location": c.location,
            "bio": cap_text(c.bio or "", 600),
            "notes": [cap_text(n, 400) for n in (c.notes or [])][:20],
        } for c in scope[:40]
    ]}


def _build_cities(fm, story) -> Dict[str, Any]:
    cities = fm.get_cities(story.id)
    return {"cities": [
        {"name": c.name, "region": c.region, "atmosphere": c.atmosphere,
         "key_locations": list(c.key_locations or [])} for c in cities[:40]
    ]}


def _build_factions(fm, story) -> Dict[str, Any]:
    return {"factions": [
        {"name": f.name, "description": f.description, "leader": f.leader, "alignment": f.alignment}
        for f in fm.get_factions(story.id)[:40]
    ]}


def _build_artifacts(fm, story) -> Dict[str, Any]:
    return {"artifacts": [
        {"name": a.name, "type": a.type, "properties": a.properties, "location": a.location}
        for a in fm.get_artifacts(story.id)[:40]
    ]}


def _build_glossary(fm, story) -> Dict[str, Any]:
    return {"glossary": [
        {"term": g.term, "definition": cap_text(g.definition, 400), "category": g.category}
        for g in fm.get_glossary(story.id)[:60]
    ]}


def build_mechanics(fm, story, params=None) -> Dict[str, Any]:
    m = fm.get_world_mechanics(story.id)
    return {"mechanics": {
        "magic_system": m.magic_system,
        "technology_level": m.technology_level,
        "global_rules": list(m.global_rules or []),
    }}


def build_books(fm, story, params=None) -> Dict[str, Any]:
    books = fm.list_books(story.id)
    if params and params.get("book_id"):
        books = [b for b in books if b.id == params["book_id"]] or books
    return {"books": [
        {"id": b.id, "title": b.title, "order": b.order,
         "target_word_count": b.target_word_count,
         "plot_subsections": [
             {"title": s.title, "description": cap_text(s.description, 500)}
             for s in (b.plot_subsections or [])
         ]} for b in books[:12]
    ]}


def build_plot(fm, story, params=None) -> Dict[str, Any]:
    books = fm.list_books(story.id)
    if params and params.get("book_id"):
        books = [b for b in books if b.id == params["book_id"]] or books
    return {"plot": [
        {"book": b.title, "theme": ((p := fm.get_plot(story.id, b.id)).theme or ""),
         "beats": [
             {"id": beat.id, "title": beat.title,
              "description": cap_text(beat.description, 400),
              "chapter_id": beat.chapter_id, "character_ids": list(beat.character_ids or [])}
             for beat in p.beats
         ]} for b in books
    ]}


def build_arcs(fm, story, params=None) -> Dict[str, Any]:
    books = fm.list_books(story.id)
    if params and params.get("book_id"):
        books = [b for b in books if b.id == params["book_id"]] or books
    pulled = []
    for b in books:
        for a in fm.get_character_arcs(story.id, b.id):
            if params and params.get("character_id") and a.character_id != params["character_id"]:
                continue
            pulled.append({
                "book": b.title, "character_id": a.character_id,
                "summary": cap_text(a.arc_summary, 300),
                "starting_state": cap_text(a.starting_state, 200),
                "ending_state": cap_text(a.ending_state, 200),
                "key_milestones": [cap_text(x, 150) for x in (a.key_milestones or [])][:8],
            })
    return {"arcs": pulled}


def build_chapter_prose(fm, story, params=None) -> Dict[str, Any]:
    if params and params.get("chapter_id"):
        ch = _find_chapter(fm, story.id, params.get("book_id"), params["chapter_id"])
        if ch:
            return {"chapter": {
                "title": ch["chapter"].title,
                "book": ch["book"].title,
                "prose": slice_span(ch["prose"], 6000),
            }}
    openings = _chapter_openings(fm, story, max_chapters=5, per_chapter=1400)
    return {"chapter_openings": openings}


def build_timeline(fm, story, params=None) -> Dict[str, Any]:
    events = []
    for c in fm.list_characters(story.id):
        for e in (c.timeline_events or []):
            events.append({
                "character": c.name, "year_or_era": e.year_or_era, "title": e.title,
                "description": cap_text(e.description, 300), "book_ids": list(e.book_ids or []),
            })
    return {"timeline": events[:80]}


def build_gallery(fm, story, params=None) -> Dict[str, Any]:
    gal = fm.get_world_section(story.id, "gallery")
    items = []
    if isinstance(gal, list):
        for g in gal:
            if isinstance(g, dict):
                items.append({"title": g.get("title", ""), "context": cap_text(g.get("context", ""), 250)})
    return {"gallery": items[:40]}


SOURCE_BUILDERS = {
    "overview": build_overview,
    "characters": build_characters,
    "world_cities": _build_cities,
    "world_factions": _build_factions,
    "world_artifacts": _build_artifacts,
    "world_glossary": _build_glossary,
    "world_mechanics": build_mechanics,
    "books": build_books,
    "plot": build_plot,
    "arcs": build_arcs,
    "chapter_prose": build_chapter_prose,
    "timeline": build_timeline,
    "gallery": build_gallery,
}


# --- chapter helpers -------------------------------------------------------

def _find_chapter(fm, story_id, book_id, chapter_id) -> Optional[Dict[str, Any]]:
    books = [fm.get_book(story_id, book_id)] if book_id else fm.list_books(story_id)
    for b in books:
        if not b:
            continue
        ch = fm.get_chapter(story_id, b.id, chapter_id)
        if ch:
            return {
                "book": b,
                "chapter": ch,
                "prose": fm.read_chapter_prose(story_id, b.id, chapter_id),
            }
    return None


def _chapter_openings(fm, story, max_chapters=5, per_chapter=1400) -> List[Dict[str, Any]]:
    out = []
    for b in fm.list_books(story.id)[:3]:
        for ch in fm.list_chapters(story.id, b.id):
            if len(out) >= max_chapters:
                break
            prose = fm.read_chapter_prose(story.id, b.id, ch.id)
            if prose.strip():
                out.append({"chapter": ch.title, "excerpt": slice_span(prose, per_chapter)})
        if len(out) >= max_chapters:
            break
    return out


# --- pipeline builders (§15) ------------------------------------------------

def _all_beats(fm, story, cap=_ANALYSIS_CH) -> Dict[str, Any]:
    beats = []
    for b in fm.list_books(story.id):
        p = fm.get_plot(story.id, b.id)
        for beat in p.beats:
            beats.append({
                "book": b.title, "id": beat.id, "title": beat.title,
                "description": cap_text(beat.description, 300),
                "chapter_id": beat.chapter_id, "character_ids": list(beat.character_ids or []),
            })
    return {"beats": beats}


def _all_arcs(fm, story, cap=_ANALYSIS_CH) -> Dict[str, Any]:
    return build_arcs(fm, story)


def _beats_for_character(fm, story, char_id, cap=6000) -> List[Dict[str, Any]]:
    beats = []
    for book in fm.list_books(story.id):
        plot = fm.get_plot(story.id, book.id)
        for beat in plot.beats:
            if char_id in (beat.character_ids or []):
                beats.append({
                    "book": book.title, "id": beat.id, "title": beat.title,
                    "description": cap_text(beat.description, 400),
                })
    return beats[:30]


def _prose_for_character(fm, story, char_id, per_chapter=1400, max_chapters=4) -> List[Dict[str, Any]]:
    excerpts = []
    for book in fm.list_books(story.id):
        appearances = {}
        for ch in fm.list_chapters(story.id, book.id):
            if ch.pov_character_id == char_id or char_id in (ch.scene_breakdown or ""):
                prose = fm.read_chapter_prose(story.id, book.id, ch.id)
                if prose.strip():
                    appearances.setdefault(book.title, []).append({"chapter": ch.title, "prose": prose})
        for book_title, chaps in appearances.items():
            for c in chaps:
                if len(excerpts) >= max_chapters:
                    return excerpts
                excerpts.append({"book": book_title, "chapter": c["chapter"], "excerpt": slice_span(c["prose"], per_chapter)})
    return excerpts


def _dialogue_from_prose(fm, story, char_id, cap=4000) -> str:
    import re
    lines = []
    for book in fm.list_books(story.id):
        for ch in fm.list_chapters(story.id, book.id):
            if ch.pov_character_id != char_id and char_id not in (ch.scene_breakdown or ""):
                continue
            prose = fm.read_chapter_prose(story.id, book.id, ch.id)
            found = re.findall(r'"([^"\n]{4,})"', prose)
            lines.append(" | ".join(found))
    text = "\n".join(lines)
    return cap_text(text, cap)


def _only_once(fm, story) -> List[str]:
    seen: Dict[str, int] = {}
    ids = []
    for book in fm.list_books(story.id):
        p = fm.get_plot(story.id, book.id)
        for beat in p.beats:
            seen[beat.id] = seen.get(beat.id, 0) + 1
            ids.append(beat.id)
        for s in (book.plot_subsections or []):
            for c in [getattr(s, "title", "")]:
                ids.append(f"subsection:{c}")
    return [x for x in ids if seen.get(x, 1) == 1]


# --- public API --------------------------------------------------------------

def _perspective_context(fm, story, params) -> Dict[str, Any]:
    """Context for the perspective-rewrite skill: the target character's persona +
    profile (or a narrator/third-person directive), plus the original selection."""
    char_id = (params or {}).get("character_id")
    selection = cap_text((params or {}).get("selection", ""), 8000)
    if char_id in ("__narrator__", "__third__"):
        if char_id == "__narrator__":
            directive = (
                "Rewrite in a narrator / omniscient third-person voice: a slightly "
                "literary, observant narrator who knows what the characters feel and "
                "reports the scene with distance and authority."
            )
        else:
            directive = (
                "Rewrite in a detached third-person limited voice: externally observing "
                "the visible actions, dialogue, and setting, using he/she/they and the "
                "relevant names, without entering the inner thoughts of a single character."
            )
        return {"perspective_directive": directive, "selection": selection}
    chars = fm.list_characters(story.id)
    char = next((c for c in chars if c.id == char_id), None)
    if not char:
        return {
            "perspective_directive": "Narrator omniscient point of view.",
            "selection": selection,
        }
    return {
        "perspective_directive": (
            "Rewrite in the first-person point of view of this character, thinking and "
            "speaking exactly as they would (their voice, vocabulary, mood, and perception)."
        ),
        "character": {
            "id": char.id, "name": char.name, "role": char.role, "location": char.location,
            "bio": cap_text(char.bio or "", 2500),
            "persona": cap_text(char.persona or "", 2500),
            "notes": [cap_text(n, 500) for n in (char.notes or [])][:20],
        },
        "selection": selection,
    }


def build_context(
    pipeline_id: str,
    story,
    fm,
    params: Optional[Dict[str, Any]] = None,
    notes: Optional[List[str]] = None,
) -> str:
    params = params or {}
    builders = {
        "story_overview": lambda: {
            "overview": cap_text("\n\n".join(story.overview or []), 4000),
            "tags": list(story.tags or []), "theme": getattr(story, "theme", ""),
            "mechanics": build_mechanics(fm, story),
            "cast": [
                {"name": c.name, "role": c.role} for c in fm.list_characters(story.id)[:20]
            ],
            "chapters": _chapter_openings(fm, story, max_chapters=2, per_chapter=1500),
        },
        "plot_holes": lambda: {
            "books": [
                {"title": b.title, "plot_subsections": [
                    {"title": s.title, "description": cap_text(s.description, 300)}
                    for s in (b.plot_subsections or [])
                ]} for b in fm.list_books(story.id)
            ],
            "beats": _all_beats(fm, story).get("beats", []),
            "arcs": _all_arcs(fm, story).get("arcs", []),
            "overview": cap_text("\n\n".join(story.overview or []), 3000),
            "sampled_prose": _chapter_openings(fm, story, max_chapters=5, per_chapter=1400),
        },
        "pacing_analysis": lambda: {
            "beats": [
                {"book": b.title, "beat": beat.title, "chapter_id": beat.chapter_id}
                for b in fm.list_books(story.id) for beat in fm.get_plot(story.id, b.id).beats
            ],
            "chapters": [
                {"book": b.title, "chapter": ch.title, "pov": ch.pov_character_id, "words": ch.word_count}
                for b in fm.list_books(story.id) for ch in fm.list_chapters(story.id, b.id)
            ],
        },
        "pitch_blurb": lambda: {
            "overview": cap_text("\n\n".join(story.overview or []), 3000),
            "premise": [
                fm.get_plot(story.id, b.id).theme for b in fm.list_books(story.id) if fm.get_plot(story.id, b.id).theme
            ],
            "opening": _chapter_openings(fm, story, max_chapters=1, per_chapter=1200),
        },
        "lore_check": lambda: {
            "glossary": _build_glossary(fm, story),
            "cities": _build_cities(fm, story),
            "factions": _build_factions(fm, story),
            "mechanics": build_mechanics(fm, story),
            "artifacts": _build_artifacts(fm, story),
            "timeline": build_timeline(fm, story),
        },
        "mechanics_review": lambda: {
            "mechanics": build_mechanics(fm, story),
            "artifacts": _build_artifacts(fm, story),
            "magic_terms": [
                {"term": g.term, "definition": cap_text(g.definition, 300)}
                for g in fm.get_glossary(story.id)
                if any(k in (g.category or "").lower() for k in ("magic", "rule", "power"))
            ],
        },
        "world_scene_ideas": lambda: {
            "cities": _build_cities(fm, story).get("cities", []),
            "factions": _build_factions(fm, story).get("factions", []),
        },
        "character_trajectory": lambda: _character_centered(fm, story, params,
            include_arcs=True, include_beats=True, include_appearances=True),
        "character_consistency": lambda: {
            **{k: v for k, v in _character_profile(fm, story, params).items()},
            "prose_excerpts": _prose_for_character(fm, story, params.get("character_id", "")),
        },
        "dialogue_voice": lambda: {
            "profile": _character_profile(fm, story, params).get("character", {}),
            "dialogue_lines": _dialogue_from_prose(fm, story, params.get("character_id", "")),
            "sample_scene": cap_text(
                _prose_for_character(fm, story, params.get("character_id", ""), per_chapter=2000, max_chapters=1)[0]["excerpt"]
                if _prose_for_character(fm, story, params.get("character_id", ""), per_chapter=2000, max_chapters=1) else "",
                2000,
            ),
        },
        "gap_finder": lambda: {
            "beats": _all_beats(fm, story).get("beats", []),
            "arcs": _all_arcs(fm, story).get("arcs", []),
            "timeline": build_timeline(fm, story).get("timeline", []),
            "appears_once_heuristic": _only_once(fm, story)[:60],
        },
        "arc_trajectories": lambda: {
            "arcs": _all_arcs(fm, story).get("arcs", []),
            "beats_by_character": {
                cid: [beat["title"] for beat in _beats_for_character(fm, story, cid, cap=12000)]
                for cid in {a["character_id"] for a in _all_arcs(fm, story).get("arcs", [])}
            },
        },
        "pov_balance": lambda: {
            "chapters": [
                {"book": b.title, "chapter": ch.title, "pov": ch.pov_character_id, "words": ch.word_count}
                for b in fm.list_books(story.id) for ch in fm.list_chapters(story.id, b.id)
            ],
        },
        "twist_check": lambda: {
            "beats": _all_beats(fm, story).get("beats", []),
            "theme": [
                fm.get_plot(story.id, b.id).theme for b in fm.list_books(story.id) if fm.get_plot(story.id, b.id).theme
            ],
        },
        "prose_critique": lambda: _chapter_context(fm, story, params),
        "continue_writing": lambda: _continue_context(fm, story, params),
        "continuity_check": lambda: {
            **_chapter_context(fm, story, params),
            "book_beats": _book_beats_around(fm, story, params),
        },
        "show_tell": lambda: _chapter_context(fm, story, params),
        "perspective_rewrite": lambda: _perspective_context(fm, story, params),
    }
    fn = builders.get(pipeline_id)
    if fn is None:
        return "{}"
    data = fn()
    note = _maybe_note(data)
    if note:
        _save_notes(notes, note)
    return json_compact(data, BUDGET)


def _character_profile(fm, story, params) -> Dict[str, Any]:
    char_id = (params or {}).get("character_id")
    chars = fm.list_characters(story.id)
    char = next((c for c in chars if c.id == char_id), None)
    if not char:
        return {"character": None}
    return {"character": {
        "id": char.id, "name": char.name, "role": char.role, "location": char.location,
        "bio": cap_text(char.bio or "", 2500),
        "notes": [cap_text(n, 500) for n in (char.notes or [])][:20],
        "timeline_events": [
            {"year_or_era": e.year_or_era, "title": e.title, "description": cap_text(e.description, 250)}
            for e in (char.timeline_events or [])[:20]
        ],
    }}


def _character_centered(fm, story, params, include_arcs, include_beats, include_appearances) -> Dict[str, Any]:
    char_id = (params or {}).get("character_id")
    base = _character_profile(fm, story, params)
    out = dict(base)
    if include_arcs:
        out["arcs"] = [
            a for a in _all_arcs(fm, story).get("arcs", []) if a["character_id"] == char_id
        ]
    if include_beats:
        out["beats"] = _beats_for_character(fm, story, char_id)
    if include_appearances and char_id:
        app = fm.get_character_appearances(story.id, char_id)
        out["appearances"] = {
            "books": [a.title for a in app.books],
            "chapters": [f"{a.book_id}·{a.title}" for a in app.chapters],
            "plot_points": [p.title for p in app.plot_points],
        }
    return out


def _chapter_context(fm, story, params) -> Dict[str, Any]:
    ch = _find_chapter(fm, story.id, (params or {}).get("book_id"), (params or {}).get("chapter_id"))
    if not ch:
        return {"chapter": None}
    return {
        "chapter": {
            "book": ch["book"].title,
            "title": ch["chapter"].title,
            "pov": ch["chapter"].pov_character_id,
            "scene_breakdown": cap_text(ch["chapter"].scene_breakdown or "", 1500),
            "word_count": ch["chapter"].word_count,
            "prose": slice_span(ch["prose"], BUDGET - 2000),
        }
    }


def _continue_context(fm, story, params) -> Dict[str, Any]:
    ch = _find_chapter(fm, story.id, (params or {}).get("book_id"), (params or {}).get("chapter_id"))
    if not ch:
        return {"chapter": None}
    prose = ch["prose"]
    beat = None
    plot = fm.get_plot(story.id, ch["book"].id)
    for b in plot.beats:
        if b.chapter_id == ch["chapter"].id:
            beat = b
            break
    return {
        "chapter_tail": cap_text(prose[-3000:], 3000),
        "next_beat": {"title": beat.title, "description": cap_text(beat.description, 1500)} if beat else None,
        "pov": ch["chapter"].pov_character_id,
        "style_cues": cap_text(ch["chapter"].scene_breakdown or "", 1500),
    }


def _book_beats_around(fm, story, params) -> List[Dict[str, Any]]:
    ch = _find_chapter(fm, story.id, (params or {}).get("book_id"), (params or {}).get("chapter_id"))
    if not ch:
        return []
    plot = fm.get_plot(story.id, ch["book"].id)
    return [
        {"id": beat.id, "title": beat.title, "description": cap_text(beat.description, 300)}
        for beat in plot.beats
    ][:20]


def _maybe_note(data: Dict[str, Any]) -> Optional[str]:
    if "sampled_prose" in data and isinstance(data["sampled_prose"], list):
        n = len(data["sampled_prose"])
        if n:
            return f"sampled excerpts from {n} chapter opening(s)"
    return None


# --- router sources -----------------------------------------------------------

def build_context_from_sources(
    sources: List[str],
    params: Optional[Dict[str, Any]],
    story,
    fm,
    budget: Optional[int] = None,
    notes: Optional[List[str]] = None,
) -> str:
    budget = budget or BUDGET
    params = params or {}
    if not sources or sources == ["none"]:
        return json_compact({"note": "no story data selected (pure creative)"})
    built: Dict[str, str] = {}
    for src in sources:
        fn = SOURCE_BUILDERS.get(src)
        if not fn:
            continue
        data = fn(fm, story, params)
        built[src] = json.dumps(data, indent=1, ensure_ascii=False)
    priority = set(params.keys()) | {"overview", "chapter_prose"}
    def total(keep=None):
        return sum(len(v) for k, v in built.items() if keep is None or k in keep)
    dropped = []
    while len(built) > 1 and total() > budget:
        removable = [k for k in built if k not in priority]
        if not removable:
            removable = list(built)
        drop = max(removable, key=lambda k: len(built[k]))
        dropped.append(drop)
        del built[drop]
    if len(built) > 1:
        while total() > budget:
            drop = min(built, key=lambda k: len(built[k]))
            if len(built) <= 1:
                break
            dropped.append(drop)
            del built[drop]
    if dropped:
        _save_notes(notes, "context trimmed: dropped " + ", ".join(dropped))
    return json_compact(built, budget)