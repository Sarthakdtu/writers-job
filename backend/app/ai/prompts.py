"""Prompt fragments + per-pipeline task templates.

System prefixes set the role; `TASKS` maps a step's `prompt_key` to the authoring
instruction from plan §14. Stage labels drive the panel's "Extracting text…" / 
"Cleaning up…" / "Asking the editor…" progress text. The router prompt is owned here
too (used by `app.ai.router`).

Note: `qwen3.5:9b` is a reasoning model — analysis steps leave `num_predict` unset so
thinking can finish; only formatting steps pass `format="json"`.
"""
from typing import Any, Dict, List, Optional

SYSTEM_PREFIXES = {
    "analysis": (
        "You are a senior fiction editor and continuity analyst for the story described "
        "in the JSON context below. Be concrete and cite the context; never invent events, "
        "characters, or lore that are not present. If nothing is wrong, say so explicitly. "
        "Answer using the requested Markdown structure. Address gaps you cannot judge from "
        "the provided material as 'needs more context' rather than guessing."
    ),
    "creative": (
        "You are a literary stylist for the story described in the context. Match the "
        "voice of any provided prose. Do not summarize; produce usable, publishable text "
        "in the requested structure."
    ),
    "extract": (
        "You are a precise transcription engine. Output exactly what the image shows. "
        "Do not interpret, edit, or invent words. Preserve line breaks and list structure."
    ),
    "cleanup": (
        "You clean up raw OCR text for a writer's notes. Fix obvious machine-read errors, "
        "normalize bullets and numbering, merge line-split words, and drop illegible "
        "garbage. Do not invent content that was not in the transcription."
    ),
}

TASKS: Dict[str, str] = {
    "story_overview": (
        "Summarize the story from its context. List its stated themes, its strengths, "
        "and 3 watch-outs a first reader or beta reader might hit.\n\n"
        "Output structure:\n## Synopsis\n## Themes\n## Strengths\n## Watch-outs"
    ),
    "plot_holes": (
        "Find plot holes, unresolved setups, and logic gaps across the outline and sampled "
        "prose. A hole = something established earlier that contradicts later events or is "
        "set up and never used. Rule out benign gaps. For each: severity, where it lives, "
        "why it's a hole, and a suggested fix.\n\n"
        "Output structure:\n### Hole N — **severity**\n- **Where** …\n- **Why** …\n- "
        "**Suggested fix** …\n\nEnd with `## No holes found` if there are none."
    ),
    "pacing_analysis": (
        "Score pacing across beats and chapters using the word counts and POV in the "
        "context. Identify sagging or rushed stretches and name the beats that cause them.\n\n"
        "Output structure:\n## Pacing notes\n## Sagging\n## Rushed\n## Beat rhythm"
    ),
    "pitch_blurb": (
        "Write one logline, three blurbs (25 / 50 / 100 words), and one hook line, all "
        "genre-faithful to the story.\n\n"
        "Output structure:\n## Logline\n## Blurb 25\n## Blurb 50\n## Blurb 100\n## Hook"
    ),
    "lore_check": (
        "Cross-check the glossary, cities, factions, artifacts, mechanics, and character "
        "timelines for internal contradictions, undefined rules, and date/era jitter.\n\n"
        "Output structure:\n## Contradictions\n## Undefined rules\n## Timeline notes"
    ),
    "mechanics_review": (
        "Review the magic/tech system for rule gaps, deus-ex-machina risk, and "
        "power-balance drift across the mechanics and artifacts.\n\n"
        "Output structure:\n## Rule gaps\n## Deus-ex risk\n## Power balance"
    ),
    "world_scene_ideas": (
        "For each city or faction in the context, give 2–3 concrete, scene-settable sensory "
        "or social details that make it feel alive.\n\n"
        "Output structure:\n### <city or faction name>\n- detail bullets"
    ),
    "character_trajectory": (
        "For the target character, recommend the next arc segment: motivation gaps, 2–3 "
        "concrete milestones, a believable conflict that forces growth, and how it touches "
        "the story theme.\n\n"
        "Output structure:\n## Motivation gap\n## Suggested milestones\n## Conflict engine\n"
        "## Theme tie-in"
    ),
    "character_consistency": (
        "Compare the target character's profile to every prose excerpt where they appear. "
        "List contradictions, trait drift, and forgotten facts, quoting the excerpt.\n\n"
        "Output structure:\n### Contradiction — <chapter>\n- quote → fix"
    ),
    "dialogue_voice": (
        "Build a voice profile from the target character's dialogue. Give 3 consistent "
        "verbal tics and 2 rewrite examples of flat dialogue that fight their voice.\n\n"
        "Output structure:\n## Voice profile\n## Tics\n## Rewrites"
    ),
    "gap_finder": (
        "Find dangling threads: subplot setups with no payoff, introduced-but-unused items, "
        "and beats that do not follow their causes. Pay attention to outline items that "
        "appear only once.\n\n"
        "Output structure:\n## Dangling threads\n## Unused setups\n## Missing bridges"
    ),
    "arc_trajectories": (
        "Assess every character arc against the beats each character appears in. Flag arcs "
        "that stall or jump, and recommend a next milestone for each.\n\n"
        "Output structure:\n### <character>\n- **status:** stalled | on-track | jumped\n- "
        "next milestone"
    ),
    "pov_balance": (
        "From the chapters table (chapter, POV, word count), show the POV distribution. "
        "Flag under-used POVs and long POV droughts between appearances.\n\n"
        "Output structure:\n## Distribution table\n## Droughts\n## Suggestions"
    ),
    "twist_check": (
        "For each twist or reveal beat, list what setup the reader already has and what is "
        "missing for the twist to be fair.\n\n"
        "Output structure:\n### Twist — <name>\n- setup ✓ …\n- missing ✗ …\n- payoff timing",
    ),
    "prose_critique": (
        "Critique the provided chapter prose. Quote line numbers where useful. Give 3 "
        "strengths, 5 concrete cuts or rewrites, and one sentence on voice.\n\n"
        "Output structure:\n## Strengths\n## Cuts & rewrites (quote → fix)\n## Voice"
    ),
    "continue_writing": (
        "Continue the scene in the same voice for 2–3 paragraphs, advancing toward the "
        "attached beat if one is provided. Output only the continuation prose."
    ),
    "continuity_check": (
        "Compare the chapter to its plot beats and the book's plot. List deviations, dropped "
        "beats, and accidental retcons.\n\n"
        "Output structure:\n## Deviations\n## Dropped beats\n## Retcons"
    ),
    "show_tell": (
        "Point to specific 'telling' sentences in the chapter and give a one-line 'showing' "
        "alternative for each.\n\n"
        "Output structure:\n### Told → shown\n- told: …\n- shown: …",
    ),

    # import / extract steps
    "ocr_extract": (
        "Transcribe the handwritten or printed text in the attached image verbatim, "
        "preserving line breaks, bullets, and numbering."
    ),
    "ocr_extract_all": (
        "Transcribe every sticky note written on the attached whiteboard/wall photo. "
        "Preserve each note's wording even if clipped."
    ),
    "ocr_cleanup": (
        "Clean the raw transcription above: fix obvious OCR noise, normalize bullets and "
        "lists, merge line-split words, drop illegible fragments. Return a tidy list of "
        "notes. Never add content that was not in the transcription."
    ),
    "notes_group": (
        "Group the transcribed sticky notes above: merge duplicates, combine fragments of "
        "the same note, drop illegible ones, and sort into a tidy grouped bullet list."
    ),
    "art_describe": (
        "Describe this concept art in 2–3 sentences: subject, mood, palette, and key "
        "details a writer would want captured."
    ),
    "art_polish": (
        "Rewrite the caption above as lore-appropriate, gallery-ready prose for a fiction "
        "worldbuilding gallery (2–4 sentences, evocative but concrete)."
    ),

    # custom skill placeholder (prompt arrives from the stored skill; key is its id)
}

STAGE_LABELS: Dict[str, str] = {
    "ocr_extract": "Extracting text…",
    "ocr_extract_all": "Extracting sticky notes…",
    "ocr_cleanup": "Cleaning up text…",
    "notes_group": "Grouping notes…",
    "art_describe": "Describing the art…",
    "art_polish": "Polishing the caption…",
}

ROUTER_SYSTEM = (
    "You choose which parts of a story's data store an AI skill needs to answer a prompt. "
    "Available sources: overview, characters, world_cities, world_factions, "
    "world_artifacts, world_glossary, world_mechanics, books, plot, arcs, chapter_prose, "
    "timeline, gallery, none (pure creative, needs no data). "
    "Return strict JSON only: {\"sources\": [\"...\"], \"params_hint\": [\"...\"], "
    "\"reason\": \"short justification\"}. A source is justified only if the prompt "
    "explicitly needs it. params_hint may include character_id, book_id, chapter_id."
)

ROUTER_HINTS = {
    None: "whole story",
    "whole story": "overview, characters, plot, books, arcs, chapter_prose",
    "my characters": "characters, arcs, timeline, chapter_prose",
    "plot & structure": "plot, arcs, books, chapter_prose",
    "the open chapter": "chapter_prose, plot, arcs",
    "world lore": "world_cities, world_factions, world_artifacts, world_glossary, world_mechanics, timeline",
    "nothing": "none",
}


def system_for(key: str) -> str:
    if key == "analysis":
        return SYSTEM_PREFIXES["analysis"]
    if key == "creative":
        return SYSTEM_PREFIXES["creative"]
    return SYSTEM_PREFIXES["analysis"]


def build_analysis_messages(
    prompt: str,
    context: str = "",
    *,
    system_prompt_key: str = "analysis",
    attach_context: bool = True,
) -> List[Dict[str, Any]]:
    sys_text = system_for(system_prompt_key)
    if context is None or context == "":
        user_text = prompt
    elif not attach_context:
        user_text = prompt
    elif "{{story_context}}" in prompt:
        user_text = prompt.replace("{{story_context}}", context)
    else:
        user_text = f"Story context (JSON):\n{context}\n\n---\n\n{prompt}"
    return [
        {"role": "system", "content": sys_text},
        {"role": "user", "content": user_text},
    ]


def step_messages(
    prompt_key: str,
    *,
    context: str = "",
    prev_output: str = "",
    custom_prompt: Optional[str] = None,
    input_kind: str = "story_context",
    attach_context: bool = True,
) -> List[Dict[str, Any]]:
    """Compose system+user messages for a single pipeline step."""
    if prompt_key in ("ocr_extract", "ocr_extract_all", "art_describe"):
        return [
            {"role": "system", "content": SYSTEM_PREFIXES["extract"]},
            {"role": "user", "content": TASKS.get(prompt_key, "")},
        ]

    if prompt_key in ("ocr_cleanup", "notes_group"):
        return [
            {"role": "system", "content": SYSTEM_PREFIXES["cleanup"]},
            {"role": "user", "content": f"{prev_output}\n\n{TASKS.get(prompt_key, '')}"},
        ]

    if prompt_key == "art_polish":
        return [
            {"role": "system", "content": SYSTEM_PREFIXES["creative"]},
            {"role": "user", "content": f"{prev_output}\n\n{TASKS.get(prompt_key, '')}"},
        ]

    if custom_prompt:
        user_text = custom_prompt
        if prev_output:
            user_text = f"Previous step output:\n{prev_output}\n\n{custom_prompt}"
        if input_kind == "text":
            return [
                {"role": "system", "content": system_for("analysis")},
                {"role": "user", "content": user_text},
            ]
        if attach_context and context:
            if "{{story_context}}" in user_text:
                user_text = user_text.replace("{{story_context}}", context)
            else:
                user_text = f"Story context (JSON):\n{context}\n\n---\n\n{user_text}"
        return [
            {"role": "system", "content": system_for("analysis")},
            {"role": "user", "content": user_text},
        ]

    task = TASKS.get(prompt_key, "")
    if prev_output:
        task = f"{task}\n\nReference transcription:\n{prev_output}"
    return build_analysis_messages(
        task,
        context=context,
        system_prompt_key="analysis",
        attach_context=attach_context,
    )