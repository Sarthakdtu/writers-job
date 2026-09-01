"""Prompt + task templates for the Creator Pipeline extraction stages.

Each stage asks the model for STRICT JSON with a fixed key shape. Extraction is
not latency-sensitive (the user reviews between stages), so we use the story's
default text model with `format="json"` + `think:false` for deterministic output.
"""

CREATOR_SYSTEM = (
    "You are a precise literary analyst extracting structured data from prose "
    "fiction. Stay faithful to the source text: only include entities, events and "
    "details that actually appear or are clearly implied. Never invent names, "
    "places, plot points or relationships that are not in the material. Output "
    "strict JSON only, matching the requested keys exactly."
)

STAGE_TASKS = {
    "characters": (
        "Analyze the prose chapters below and extract all named characters.\n"
        "For each: name, role (protagonist/antagonist/supporting/minor), a 1-3 "
        "sentence bio grounded in the text, any aliases/alternative names, key "
        "personality traits, and relationships to other extracted characters "
        "(type in: parent/child/spouse/sibling/lover/rival/friend/colleague/acquaintance).\n\n"
        "Return strict JSON:\n"
        '{"characters": [{"name": str, "role": str, "bio": str, "aliases": [str], '
        '"traits": [str], "relationships": [{"target": str, "type": str, '
        '"description": str}]}], "notes": [str]}\n\n'
        "Include minor characters who are named. Distinguish those who act/speak "
        "from those merely mentioned. Put ambiguities or uncertainty in notes."
    ),
    "world": (
        "Analyze the prose chapters below and extract the world-building.\n"
        "Identify: cities/locations (name, region, atmosphere, key_locations), "
        "factions/groups (name, description, leader, alignment), artifacts/objects "
        "of significance (name, type, properties, location, belongs_to character "
        "names), the governing rules or magic system (magic_system, "
        "technology_level, global_rules as a list), and any made-up terms worth a "
        "glossary entry (term, definition, category).\n\n"
        "Return strict JSON:\n"
        '{"cities": [{"name": str, "region": str, "atmosphere": str, '
        '"key_locations": [str]}], "factions": [{"name": str, "description": str, '
        '"leader": str, "alignment": str}], "artifacts": [{"name": str, "type": str, '
        '"properties": str, "location": str, "belongs_to": [str]}], '
        '"glossary": [{"term": str, "definition": str, "category": str}], '
        '"magic_system": str, "technology_level": str, "global_rules": [str], '
        '"notes": [str]}\n\n'
        "Only include places/groups/objects that actually appear. If the setting is "
        "real-world fiction, cities are the real places where scenes occur; "
        "factions are social groups/houses/classes. Be conservative."
    ),
    "plot": (
        "Analyze the prose chapters below (each marked with CHAPTER n and its "
        "id) and extract the plot structure.\n"
        "For each chapter identify 2-5 key plot beats. Each beat: a short title, "
        "a 1-2 sentence description, the chapter_index (1-based number, 0 if "
        "unclear), the chapter_id if provided, character_names involved, and "
        "importance (major/minor/sub).\n"
        "Also extract story-level themes (2-5), a narrative overview (2-3 "
        "sentences summarizing the whole batch), and a one-paragraph summary per "
        "chapter keyed by its chapter_id.\n\n"
        "Return strict JSON:\n"
        '{"beats": [{"title": str, "description": str, "chapter_index": int, '
        '"chapter_id": str, "character_names": [str], "importance": str}], '
        '"themes": [str], "overview": [str], '
        '"chapter_summaries": {"<chapter_id>": str}, "notes": [str]}'
    ),
    "arcs": (
        "Analyze the prose chapters below and describe the character arcs.\n"
        "For each significant character with a discernible arc, provide: "
        "character_name (must match the names given), an arc_summary, their "
        "starting_state (as they first appear), their ending_state (as they last "
        "appear in this batch), and 2-4 key_milestones marking their development.\n\n"
        "Return strict JSON:\n"
        '{"arcs": [{"character_name": str, "arc_summary": str, "starting_state": str, '
        '"ending_state": str, "key_milestones": [str]}], "notes": [str]}'
    ),
}


def stage_messages(stage: str, source_text: str) -> list:
    task = STAGE_TASKS[stage]
    return [
        {"role": "system", "content": CREATOR_SYSTEM},
        {"role": "user", "content": f"{task}\n\n---\n\nSource text:\n{source_text}"},
    ]
