"""Entity merge logic: folds approved Creator Pipeline results into the story.

Merge is always append + dedupe (never replace): processing a later batch must
extend prior extractions without destroying them. Each merge returns a dict of
counts for reporting.
"""
import re
from typing import Dict, List, Tuple

from app.file_manager import FileManager
from app.schemas import (
    Story, Character, City, Faction, Artifact, GlossaryTerm,
    Book, Chapter, Plot, PlotBeat, CharacterArc, WorldMechanics,
)

from app.ai.creator.schemas import (
    ExtractedCharacter, ExtractedCity, ExtractedFaction, ExtractedArtifact,
    ExtractedGlossaryTerm, WorldStageResult, ExtractedPlotBeat, PlotStageResult,
    ExtractedArc, ArcsStageResult, SplitChapter, slugify,
)

_ROLE_MAP = {
    "main": "Main Character",
    "main character": "Main Character",
    "protagonist": "Protagonist",
    "antagonist": "Antagonist",
    "supporting": "Supporting",
    "minor": "Minor",
    "deuteragonist": "Deuteragonist",
}


def _map_role(role: str) -> str:
    r = (role or "").strip().lower()
    return _ROLE_MAP.get(r, role.strip() if role else "Supporting")


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower()).strip()


class EntityMerger:
    def __init__(self, fm: FileManager):
        self.fm = fm

    # --- characters ------------------------------------------------------

    def merge_characters(self, story_id: str, extracted: List[Dict]) -> Dict[str, int]:
        characters = {_norm(c.name): c for c in self.fm.list_characters(story_id)}
        counts = {"created": 0, "updated": 0, "skipped": 0}

        for item in extracted:
            if not isinstance(item, dict) or not item.get("name"):
                counts["skipped"] += 1
                continue
            name = str(item["name"]).strip()
            if not name:
                counts["skipped"] += 1
                continue
            cid = slugify(name)
            key = _norm(name)
            bio = str(item.get("bio") or "").strip()
            role = _map_role(str(item.get("role") or ""))

            existing = characters.get(key)
            if existing:
                existing.name = name
                if role:
                    existing.role = role
                if bio and bio not in (existing.bio or ""):
                    existing.bio = (existing.bio or "").strip()
                    existing.bio = f"{existing.bio}\n{bio}".strip()
                # traits → notes (dedupe)
                for t in (item.get("traits") or []):
                    t = str(t).strip()
                    if t and t not in existing.notes:
                        existing.notes.append(f"Trait: {t}")
                # relationships → notes (append; can't fully model graph per-batch)
                for rel in (item.get("relationships") or []):
                    if isinstance(rel, dict) and rel.get("target"):
                        rel_note = f"Relationship: {_norm_phrase(rel)}"
                        if rel_note not in existing.notes:
                            existing.notes.append(rel_note)
                self.fm.save_character(story_id, existing)
                counts["updated"] += 1
            else:
                char = Character(
                    id=cid,
                    name=name,
                    role=role or "Supporting",
                    bio=bio,
                    notes=[
                        f"Trait: {t}" for t in (item.get("traits") or [])
                        if isinstance(t, str) and t.strip()
                    ] + [
                        f"Relationship: {_norm_phrase(rel)}"
                        for rel in (item.get("relationships") or [])
                        if isinstance(rel, dict) and rel.get("target")
                    ],
                )
                self.fm.save_character(story_id, char)
                characters[key] = char
                counts["created"] += 1

        return counts

    def _map_character(self, story_id: str, name: str) -> str:
        """Resolve a character name to its id (slug) for linking plot beats."""
        return slugify(name)

    # --- world -----------------------------------------------------------

    def merge_world(self, story_id: str, result: WorldStageResult) -> Dict[str, int]:
        counts = {"cities": 0, "factions": 0, "artifacts": 0, "glossary": 0, "mechanics": 0}

        # cities
        cities = {_norm(c.name): c for c in self.fm.get_cities(story_id)}
        for item in result.cities:
            if not item.name.strip():
                continue
            key = _norm(item.name)
            if key in cities:
                self._augment_city(cities[key], item)
            else:
                city = City(
                    id=slugify(item.name), name=item.name, region=item.region,
                    atmosphere=item.atmosphere, key_locations=list(item.key_locations),
                )
                cities[key] = city
                counts["cities"] += 1
        merged_cities = list(cities.values())
        if result.cities:
            self.fm.save_cities(story_id, [c for c in merged_cities if c.name.strip()])

        # factions
        factions = {_norm(f.name): f for f in self.fm.get_factions(story_id)}
        for item in result.factions:
            if not item.name.strip():
                continue
            key = _norm(item.name)
            if key not in factions:
                factions[key] = Faction(
                    id=slugify(item.name), name=item.name, description=item.description,
                    leader=item.leader or "", alignment=item.alignment or "",
                )
                counts["factions"] += 1
        if result.factions:
            self.fm.save_factions(story_id, list(factions.values()))

        # artifacts
        artifacts = {_norm(a.name): a for a in self.fm.get_artifacts(story_id)}
        for item in result.artifacts:
            if not item.name.strip():
                continue
            key = _norm(item.name)
            if key not in artifacts:
                artifacts[key] = Artifact(
                    id=slugify(item.name), name=item.name, type=item.type,
                    properties=item.properties, location=item.location or "",
                    belongs_to=list(item.belongs_to),
                )
                counts["artifacts"] += 1
        if result.artifacts:
            self.fm.save_artifacts(story_id, list(artifacts.values()))

        # glossary
        glossary = {_norm(g.term): g for g in self.fm.get_glossary(story_id)}
        for item in result.glossary:
            if not item.term.strip():
                continue
            key = _norm(item.term)
            if key not in glossary:
                glossary[key] = GlossaryTerm(
                    id=slugify(item.term), term=item.term,
                    definition=item.definition, category=item.category or "World",
                )
                counts["glossary"] += 1
        if result.glossary:
            self.fm.save_glossary(story_id, list(glossary.values()))

        # mechanics — only touch if the model returned meaningful content
        if result.magic_system.strip() or result.technology_level.strip() or result.global_rules:
            mech_list = self.fm.get_world_mechanics(story_id)
            title = result.magic_system.strip() or result.technology_level.strip() or "Extracted World Mechanics"
            mechanics = WorldMechanics(
                id=slugify(title)[:60] or "extracted-world-mechanics",
                name=title[:60],
                magic_system=result.magic_system.strip(),
                technology_level=result.technology_level.strip(),
                global_rules=[r.strip() for r in result.global_rules if r.strip()],
            )
            mech_list.append(mechanics)
            self.fm.save_world_mechanics(story_id, mech_list)
            counts["mechanics"] = 1

        return counts

    def _augment_city(self, city: City, item: ExtractedCity) -> None:
        if item.region.strip() and not city.region:
            city.region = item.region.strip()
        if item.atmosphere.strip() and not city.atmosphere:
            city.atmosphere = item.atmosphere.strip()
        for loc in item.key_locations:
            loc = loc.strip()
            if loc and loc not in city.key_locations:
                city.key_locations.append(loc)

    # --- plot ------------------------------------------------------------

    def merge_plot(self, story_id: str, book_id: str, result: PlotStageResult,
                   chapter_id_by_index: Dict[int, str]) -> Dict[str, int]:
        plot = self.fm.get_plot(story_id, book_id)
        existing_keys = {
            (_norm(b.title), b.chapter_id or "")
            for b in plot.beats
        }
        counts = {"beats": 0, "themes": 0, "overview": 0}

        for item in result.beats:
            if not item.title.strip():
                continue
            chapter_id = item.chapter_id or chapter_id_by_index.get(item.chapter_index, "")
            key = (_norm(item.title), chapter_id or "")
            beat = PlotBeat(
                id=slugify(item.title),
                title=item.title.strip(),
                description=item.description.strip(),
                chapter_id=chapter_id or None,
                character_ids=[
                    self._map_character(story_id, n)
                    for n in item.character_names if n.strip()
                ],
            )
            plot.beats.append(beat)
            counts["beats"] += 1
        if result.beats:
            self.fm.save_plot(story_id, book_id, plot)

        # themes → story tags
        if result.themes:
            story = self.fm.get_story(story_id)
            merged = list(dict.fromkeys([*story.tags, *[t.strip() for t in result.themes if t.strip()]]))
            story.tags = merged
            self.fm.save_story(story)
            counts["themes"] = len(result.themes)

        # overview → story overview paragraphs
        if result.overview:
            story = self.fm.get_story(story_id)
            for para in result.overview:
                para = para.strip()
                if para and para not in story.overview:
                    story.overview.append(para)
                    counts["overview"] += 1
            self.fm.save_story(story)

        return counts

    # --- arcs ------------------------------------------------------------

    def merge_arcs(self, story_id: str, book_id: str, result: ArcsStageResult) -> Dict[str, int]:
        arcs = {(a.character_id): a for a in self.fm.get_character_arcs(story_id, book_id)}
        counts = {"created": 0, "updated": 0}

        for item in result.arcs:
            if not item.character_name.strip():
                continue
            cid = slugify(item.character_name)
            existing = arcs.get(cid)
            if existing:
                if item.arc_summary.strip() and item.arc_summary not in (existing.arc_summary or ""):
                    existing.arc_summary = item.arc_summary.strip()
                if item.ending_state.strip():
                    existing.ending_state = item.ending_state.strip()
                if item.starting_state.strip() and not existing.starting_state:
                    existing.starting_state = item.starting_state.strip()
                for m in item.key_milestones:
                    m = m.strip()
                    if m and m not in existing.key_milestones:
                        existing.key_milestones.append(m)
                counts["updated"] += 1
            else:
                arcs[cid] = CharacterArc(
                    character_id=cid,
                    arc_summary=item.arc_summary,
                    starting_state=item.starting_state,
                    ending_state=item.ending_state,
                    key_milestones=[m.strip() for m in item.key_milestones if m.strip()],
                )
                counts["created"] += 1

        if result.arcs:
            self.fm.save_character_arcs(story_id, book_id, list(arcs.values()))
        return counts


def _norm_phrase(rel: Dict) -> str:
    target = str(rel.get("target") or "").strip()
    rtype = str(rel.get("type") or "").strip()
    desc = str(rel.get("description") or "").strip()
    parts = [p for p in [rtype, desc] if p]
    if parts:
        return f"{target} ({'; '.join(parts)})"
    return target
