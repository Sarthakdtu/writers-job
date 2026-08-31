import os
import shutil
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

from app.schemas import (
    Story, Character, WorldMechanics, City, Faction, Artifact, GlossaryTerm, Quote,
    Book, Chapter, Plot, CharacterArc, WritingStats, WritingStatsDay
)
from app.file_utils import (
    read_json_safe, write_json_safe, read_text_safe, write_text_safe, delete_file_safe
)


class FileManager:
    """
    FileManager handles all read/write operations to local JSON and Markdown files
    following the /data/stories/[story-slug]/ directory convention.
    """

    def __init__(self, base_data_dir: Optional[Path] = None):
        if base_data_dir is None:
            # Default to ./data/stories relative to the project root
            base_dir = os.getenv("DATA_DIR", "data/stories")
            self.base_data_dir = Path(base_dir).resolve()
        else:
            self.base_data_dir = Path(base_data_dir).resolve()

        self.base_data_dir.mkdir(parents=True, exist_ok=True)

    def get_story_dir(self, story_slug: str) -> Path:
        """Returns the root directory path for a story slug."""
        return self.base_data_dir / story_slug

    def ensure_story_structure(self, story_slug: str) -> Path:
        """
        Creates and verifies the complete directory structure for a story:
        - /data/stories/[story-slug]/
        - story.json
        - /characters/
        - /world/ (cities.json, mechanics.json, factions.json, artifacts.json, glossary.json)
        - /books/
        """
        story_dir = self.get_story_dir(story_slug)
        story_dir.mkdir(parents=True, exist_ok=True)

        # Create subdirectories
        (story_dir / "characters").mkdir(exist_ok=True)
        (story_dir / "assets").mkdir(exist_ok=True)
        world_dir = story_dir / "world"
        world_dir.mkdir(exist_ok=True)
        (story_dir / "books").mkdir(exist_ok=True)

        # Initialize default files if missing
        world_files_defaults = {
            "cities.json": [],
            "mechanics.json": {
                "magic_system": "Standard / Soft Magic",
                "technology_level": "Medieval / Renaissance",
                "global_rules": ["Energy cannot be created from nothing."]
            },
            "factions.json": [],
            "artifacts.json": [],
            "glossary.json": [],
            "gallery.json": [],
            "quotes.json": []
        }

        for filename, default_val in world_files_defaults.items():
            file_path = world_dir / filename
            if not file_path.exists():
                write_json_safe(file_path, default_val)

        return story_dir

    # --- Story Operations ---

    def save_story(self, story: Story) -> Story:
        story_dir = self.ensure_story_structure(story.id)
        story_json_path = story_dir / "story.json"
        write_json_safe(story_json_path, story.model_dump())
        return story

    def get_story(self, story_slug: str) -> Optional[Story]:
        story_dir = self.get_story_dir(story_slug)
        story_json_path = story_dir / "story.json"
        data = read_json_safe(story_json_path)
        if not data:
            return None
        return Story(**data)

    def list_dirs(self) -> List[str]:
        """Returns the sorted list of story directory names under the base data dir."""
        if not self.base_data_dir.exists():
            return []
        return sorted(
            entry.name for entry in self.base_data_dir.iterdir() if entry.is_dir()
        )

    def list_stories(self, include_deleted: bool = False) -> List[Story]:
        stories: List[Story] = []
        for name in self.list_dirs():
            story = self.sync_story_backgrounds(name) or self.get_story(name)
            if not story:
                continue
            if story.deleted and not include_deleted:
                continue
            stories.append(story)
        return stories

    def get_deleted_stories(self) -> List[Story]:
        """Returns only the soft-deleted stories (for the trash view)."""
        stories: List[Story] = []
        for name in self.list_dirs():
            story = self.get_story(name)
            if story and story.deleted:
                stories.append(story)
        return stories

    def delete_story(self, story_slug: str, hard: bool = False) -> bool:
        """Soft-deletes (flags) a story by default; physically removes it when hard=True."""
        story_dir = self.get_story_dir(story_slug)
        if not (story_dir.exists() and story_dir.is_dir()):
            return False

        if hard:
            try:
                shutil.rmtree(story_dir)
                return True
            except OSError as e:
                print(f"[FileManager Error] Failed to delete story dir {story_dir}: {e}")
                return False

        story = self.get_story(story_slug)
        if story:
            story.deleted = True
            story.deleted_at = datetime.utcnow().isoformat() + "Z"
            self.save_story(story)
            return True
        return False

    def restore_story(self, story_slug: str) -> bool:
        story = self.get_story(story_slug)
        if story and story.deleted:
            story.deleted = False
            story.deleted_at = None
            self.save_story(story)
            return True
        return False

    def get_story_fun_facts(self, story_slug: str) -> List[str]:
        """
        Collects a set of 'fun fact' strings drawn from the story's live data:
        counts and spotlight entries for characters, artifacts (tools), cities,
        factions, glossary terms, books/chapters, word count and world mechanics.
        The frontend shuffles/selects from these to show a little random summary.
        """
        facts: List[str] = []
        story = self.get_story(story_slug)
        if not story:
            return facts

        characters = self.list_characters(story_slug)
        cities = self.get_cities(story_slug)
        factions = self.get_factions(story_slug)
        artifacts = self.get_artifacts(story_slug)
        glossary = self.get_glossary(story_slug)
        books = self.list_books(story_slug)

        chapter_total = 0
        word_total = 0
        for book in books:
            chapters = self.list_chapters(story_slug, book.id)
            chapter_total += len(chapters)
            for ch in chapters:
                word_total += ch.word_count or 0

        facts.append(f"{story.title} features {len(characters)} character{'s' if len(characters) != 1 else ''}.")
        facts.append(f"{len(factions)} active faction{'s' if len(factions) != 1 else ''} shape the world's politics.")
        facts.append(f"There {'is' if len(cities) == 1 else 'are'} {len(cities)} cit{'y' if len(cities) == 1 else 'ies'} to explore.")
        facts.append(f"{len(artifacts)} artifact{'s' if len(artifacts) != 1 else ''} hold special power or meaning.")
        facts.append(f"The world keeps a glossary of {len(glossary)} terms.")
        facts.append(f"You've outlined {len(books)} book{'s' if len(books) != 1 else ''}.")
        facts.append(f"{chapter_total} chapter{'s' if chapter_total != 1 else ''} have been drafted so far.")
        facts.append(f"Roughly {word_total:,} words of prose have been written.")

        mech = self.get_world_mechanics(story_slug)
        if mech.magic_system and mech.magic_system.strip():
            facts.append(f"The magic system runs on '{mech.magic_system.strip()}'.")
        if mech.technology_level and mech.technology_level.strip():
            facts.append(f"Technology level: '{mech.technology_level.strip()}'.")
        if mech.global_rules:
            facts.append(f"A key world rule: '{mech.global_rules[0]}'.")

        if characters:
            pick = characters[0]
            if pick.role:
                facts.append(f"{pick.name} takes on the role of {pick.role}.")
            if len(characters) > 1:
                facts.append(f"{len(characters) - 1} other character{'s' if len(characters) - 1 != 1 else ''} orbit the spotlight.")
        if artifacts:
            a = artifacts[0]
            facts.append(f"One notable artifact is '{a.name}'.")
        if cities:
            c = cities[0]
            if c.atmosphere:
                facts.append(f"The city of {c.name} has a '{c.atmosphere}' atmosphere.")
        if factions:
            f = factions[0]
            if f.leader:
                facts.append(f"{f.name} is led by {f.leader}.")
        if glossary:
            g = glossary[0]
            facts.append(f"Did you know: '{g.term}' means {g.definition}.")

        return facts

    def get_writing_stats(self, story_slug: str) -> WritingStats:
        """
        Derives writing progress stats from filesystem modification times of
        chapter markdown files. No persistent data model required; each chapter's
        current `word_count` is attributed to the calendar day it was last edited.
        """
        from collections import defaultdict

        day_stats = defaultdict(lambda: {"words": 0, "chapters": set()})
        last_active_ts = None
        total_chapters = 0

        for book in self.list_books(story_slug):
            for ch in self.list_chapters(story_slug, book.id):
                total_chapters += 1
                md_path = self.get_chapter_md_path(story_slug, book.id, ch.id)
                try:
                    mtime = md_path.stat().st_mtime
                except OSError:
                    continue
                if last_active_ts is None or mtime > last_active_ts:
                    last_active_ts = mtime
                day = datetime.fromtimestamp(mtime).date().isoformat()
                day_stats[day]["words"] += ch.word_count or 0
                day_stats[day]["chapters"].add(ch.id)

        active_days = set(day_stats.keys())
        total_words = sum(d["words"] for d in day_stats.values())

        today = date.today()
        current_streak = 0
        d = today
        while d.isoformat() in active_days:
            current_streak += 1
            d -= timedelta(days=1)

        longest_streak = 0
        run = 0
        window_start = today - timedelta(days=90)
        d = window_start
        while d <= today:
            if d.isoformat() in active_days:
                run += 1
                longest_streak = max(longest_streak, run)
            else:
                run = 0
            d += timedelta(days=1)

        writing_days_total = sum(
            1 for dd in active_days if dd >= window_start.isoformat() and dd <= today.isoformat()
        )

        recent = []
        for i in range(13, -1, -1):
            day = today - timedelta(days=i)
            iso = day.isoformat()
            stats = day_stats.get(iso, {"words": 0, "chapters": set()})
            recent.append(WritingStatsDay(
                date=iso,
                words=stats["words"],
                chapters=len(stats["chapters"]),
            ))

        today_stats = day_stats.get(today.isoformat(), {"words": 0, "chapters": set()})
        last_active = datetime.fromtimestamp(last_active_ts).isoformat() if last_active_ts else None

        return WritingStats(
            total_words=total_words,
            total_chapters=total_chapters,
            current_streak=current_streak,
            longest_streak=longest_streak,
            today_words=today_stats["words"],
            today_chapters=len(today_stats["chapters"]),
            writing_days_total=writing_days_total,
            last_active=last_active,
            recent_activity=recent,
        )

    # --- Asset Operations ---

    def save_asset(self, story_slug: str, file_bytes: bytes, original_filename: str) -> str:
        """Saves a local image asset into /data/stories/[story-slug]/assets/ and returns asset URL."""
        import uuid
        story_dir = self.ensure_story_structure(story_slug)
        assets_dir = story_dir / "assets"
        assets_dir.mkdir(exist_ok=True)

        clean_ext = Path(original_filename).suffix.lower() or ".jpg"
        unique_filename = f"{uuid.uuid4().hex[:10]}{clean_ext}"
        target_path = assets_dir / unique_filename

        with open(target_path, "wb") as f:
            f.write(file_bytes)

        return f"/api/stories/{story_slug}/assets/{unique_filename}"

    def get_asset_path(self, story_slug: str, filename: str) -> Path:
        return self.get_story_dir(story_slug) / "assets" / filename

    def delete_asset(self, story_slug: str, filename: str) -> bool:
        path = self.get_asset_path(story_slug, filename)
        if not path.exists():
            return False
        return delete_file_safe(path)

    # --- Character Operations ---

    def get_character_path(self, story_slug: str, char_id: str) -> Path:
        return self.get_story_dir(story_slug) / "characters" / f"{char_id}.json"

    def save_character(self, story_slug: str, character: Character) -> Character:
        self.ensure_story_structure(story_slug)
        char_path = self.get_character_path(story_slug, character.id)
        write_json_safe(char_path, character.model_dump())
        return character

    def get_character(self, story_slug: str, char_id: str) -> Optional[Character]:
        char_path = self.get_character_path(story_slug, char_id)
        data = read_json_safe(char_path)
        if not data:
            return None
        return Character(**data)

    def get_character_appearances(self, story_slug: str, char_id: str):
        from app.schemas import CharacterAppearances, AppearanceBook, AppearanceChapter, AppearancePlotPoint

        character = self.get_character(story_slug, char_id)
        if not character:
            return CharacterAppearances(character_id=char_id)

        linked_plot_point_ids = set(character.plot_point_ids)
        linked_book_ids = set()
        for evt in character.timeline_events:
            linked_book_ids.update(evt.book_ids)

        found_books: Dict[str, AppearanceBook] = {}
        found_chapters: Dict[str, AppearanceChapter] = {}
        found_plot_points: Dict[str, AppearancePlotPoint] = {}

        all_books = self.list_books(story_slug)
        for book in all_books:
            if book.id in linked_book_ids:
                found_books[book.id] = AppearanceBook(id=book.id, title=book.title)

            # Check plot beats
            plot = self.get_plot(story_slug, book.id)
            for beat in plot.beats:
                if char_id in beat.character_ids or beat.id in linked_plot_point_ids:
                    found_plot_points[beat.id] = AppearancePlotPoint(
                        id=beat.id,
                        book_id=book.id,
                        title=beat.title,
                        description=beat.description
                    )
                    found_books[book.id] = AppearanceBook(id=book.id, title=book.title)

            # Check character arcs
            arcs = self.get_character_arcs(story_slug, book.id)
            for arc in arcs:
                if arc.character_id == char_id:
                    found_books[book.id] = AppearanceBook(id=book.id, title=book.title)

            # Check chapters
            chapters = self.list_chapters(story_slug, book.id)
            for ch in chapters:
                is_pov = (ch.pov_character_id == char_id)
                scene_ref = (char_id in (ch.scene_breakdown or ""))
                if is_pov or scene_ref:
                    found_chapters[f"{book.id}-{ch.id}"] = AppearanceChapter(
                        id=ch.id,
                        book_id=book.id,
                        title=ch.title,
                        is_pov=is_pov
                    )
                    found_books[book.id] = AppearanceBook(id=book.id, title=book.title)

        return CharacterAppearances(
            character_id=char_id,
            books=list(found_books.values()),
            chapters=list(found_chapters.values()),
            plot_points=list(found_plot_points.values())
        )

    def get_character_map(self, story_slug: str):
        """
        Derives a character-relationship graph from plot beat co-occurrence:
        every plot beat listing 2+ characters contributes one interaction edge
        between each pair. Each edge carries its interactions (grouped by the
        book/chapter the shared beat belongs to) so the frontend can drill into
        "where" two characters interact.
        """
        from app.schemas import (
            CharacterMap, CharacterMapNode, CharacterMapEdge,
            CharacterMapInteraction, CharacterMapChapter,
        )

        characters = self.list_characters(story_slug)
        node_map = {
            c.id: CharacterMapNode(id=c.id, name=c.name, image_url=c.image_url or "", role=c.role or "")
            for c in characters
        }

        edges_by_pair: Dict[tuple, Dict[str, Any]] = {}

        for book in self.list_books(story_slug):
            plot = self.get_plot(story_slug, book.id)
            for beat in plot.beats:
                char_ids = [cid for cid in beat.character_ids if cid in node_map]
                if len(char_ids) < 2:
                    continue

                chapter_ref = None
                if beat.chapter_id:
                    ch = self.get_chapter(story_slug, book.id, beat.chapter_id)
                    if ch:
                        chapter_ref = CharacterMapChapter(
                            book_id=book.id, book_title=book.title, id=ch.id, title=ch.title
                        )

                for i in range(len(char_ids)):
                    for j in range(i + 1, len(char_ids)):
                        key = tuple(sorted((char_ids[i], char_ids[j])))
                        record = edges_by_pair.setdefault(
                            key, {"source": key[0], "target": key[1], "interactions": []}
                        )
                        record["interactions"].append(CharacterMapInteraction(
                            book_id=book.id,
                            book_title=book.title,
                            beat_id=beat.id,
                            beat_title=beat.title,
                            beat_description=beat.description or "",
                            chapter=chapter_ref,
                        ))

        edges = [
            CharacterMapEdge(
                id=f"{rec['source']}--{rec['target']}",
                source=rec["source"],
                target=rec["target"],
                weight=len(rec["interactions"]),
                interactions=rec["interactions"],
            )
            for rec in edges_by_pair.values()
        ]

        node_degrees = {cid: 0 for cid in node_map}
        for edge in edges:
            node_degrees[edge.source] += 1
            node_degrees[edge.target] += 1

        nodes = [
            CharacterMapNode(
                id=node_map[c.id].id,
                name=node_map[c.id].name,
                image_url=node_map[c.id].image_url,
                role=node_map[c.id].role,
                degree=node_degrees.get(c.id, 0),
            )
            for c in characters
        ]

        return CharacterMap(nodes=nodes, edges=edges)

    def list_characters(self, story_slug: str) -> List[Character]:
        chars_dir = self.get_story_dir(story_slug) / "characters"
        characters: List[Character] = []
        if not chars_dir.exists():
            return characters

        for file_path in chars_dir.glob("*.json"):
            data = read_json_safe(file_path)
            if data:
                try:
                    characters.append(Character(**data))
                except Exception as e:
                    print(f"Error parsing character file {file_path}: {e}")
        return characters

    def delete_character(self, story_slug: str, char_id: str) -> bool:
        char_path = self.get_character_path(story_slug, char_id)
        return delete_file_safe(char_path)

    def sync_story_backgrounds(self, story_slug: str) -> Optional[Story]:
        """
        Recomputes the story's background_images from the story's concept art
        (world/gallery.json) and each character's gallery images, merged with
        whatever was already there (except character portraits, which stay out).
        Called after character or concept-art saves, and when listing stories.
        """
        story = self.get_story(story_slug)
        if not story:
            return None

        characters = self.list_characters(story_slug)
        portrait_urls = {char.image_url for char in characters if char.image_url}

        background_images = [
            url for url in (story.background_images or []) if url not in portrait_urls
        ]

        for char in characters:
            for url in char.gallery or []:
                if url and url not in background_images:
                    background_images.append(url)

        gallery = self.get_world_section(story_slug, "gallery")
        if isinstance(gallery, list):
            for item in gallery:
                url = item.get("image_url") if isinstance(item, dict) else ""
                if url and url not in background_images:
                    background_images.append(url)

        story.background_images = background_images
        story.background_url = background_images[0] if background_images else story.background_url
        return self.save_story(story)

    def get_image_library(self, story_slug: str):
        """
        Returns a unified, tagged image library combining gallery / concept-art
        items and character images, used by the searchable concept-art tab.
        """
        from app.schemas import StoryImageItem

        library = []
        gallery = self.get_world_section(story_slug, "gallery")
        if isinstance(gallery, list):
            for item in gallery:
                if not item.get("image_url"):
                    continue
                category = item.get("category") or "Concept Art"
                tags = list(item.get("tags") or [])
                if category and category not in tags:
                    tags.append(category)
                library.append(StoryImageItem(
                    source="gallery",
                    id=item.get("id") or f"gallery-{len(library)}",
                    title=item.get("title") or "Untitled Artwork",
                    image_url=item["image_url"],
                    context=item.get("context") or "",
                    category=category,
                    tags=tags,
                ))

        for city in self.get_cities(story_slug):
            if not city.image_url:
                continue
            library.append(StoryImageItem(
                source="city",
                id=f"{city.id}-image",
                title=f"{city.name} — Location",
                image_url=city.image_url,
                context=city.atmosphere or city.region or "",
                category="Cities & Locations",
                tags=[t for t in [city.name, city.region, "Cities & Locations", "Location"] if t],
            ))

        for char in self.list_characters(story_slug):
            if char.image_url:
                library.append(StoryImageItem(
                    source="character",
                    id=f"{char.id}-portrait",
                    title=f"{char.name} — Portrait",
                    image_url=char.image_url,
                    context=char.bio or "",
                    category="Characters",
                    tags=[t for t in [char.name, "Characters", "Portrait"] if t],
                    character_id=char.id,
                    character_name=char.name,
                ))
            for idx, url in enumerate(char.gallery or []):
                if not url:
                    continue
                library.append(StoryImageItem(
                    source="character",
                    id=f"{char.id}-gallery-{idx + 1}",
                    title=f"{char.name} — Gallery {idx + 1}",
                    image_url=url,
                    context=char.bio or "",
                    category="Characters",
                    tags=[t for t in [char.name, "Characters", "Gallery"] if t],
                    character_id=char.id,
                    character_name=char.name,
                ))

        return library

    def get_references(self, story_slug: str):
        """
        Returns every referenceable entity for the @-mention picker, flattened
        into a single list where each item carries a `type` so the frontend can
        group by entity kind. Each item includes a small image (when available)
        and a short overview for the hover tooltip.
        """
        from app.schemas import EntityRefItem

        refs: List[EntityRefItem] = []

        for char in self.list_characters(story_slug):
            parts = [p for p in [(char.role or "").strip()]
                     if p]
            if (char.location or "").strip():
                parts.append(f"From {char.location.strip()}")
            refs.append(EntityRefItem(
                type="character",
                id=char.id,
                name=char.name,
                label=char.name,
                image_url=char.image_url or "",
                overview=" · ".join(parts),
            ))

        for city in self.get_cities(story_slug):
            overview = (city.atmosphere or city.region or "").strip()
            refs.append(EntityRefItem(
                type="city",
                id=city.id,
                name=city.name,
                label=city.name,
                image_url=city.image_url or "",
                overview=overview,
            ))

        for faction in self.get_factions(story_slug):
            leader = (faction.leader or "").strip()
            overview = f"Led by {leader}" if leader else (faction.description or "").strip()
            refs.append(EntityRefItem(
                type="faction",
                id=faction.id,
                name=faction.name,
                label=faction.name,
                image_url="",
                overview=overview,
            ))

        for artifact in self.get_artifacts(story_slug):
            overview = (artifact.type or "").strip()
            if artifact.type and artifact.type.strip():
                overview = artifact.type.strip()
            refs.append(EntityRefItem(
                type="artifact",
                id=artifact.id,
                name=artifact.name,
                label=artifact.name,
                image_url=artifact.image_url or "",
                overview=overview,
            ))

        for term in self.get_glossary(story_slug):
            refs.append(EntityRefItem(
                type="glossary",
                id=term.id,
                name=term.term,
                label=term.term,
                image_url="",
                overview=(term.definition or "").strip(),
            ))

        return refs

    # --- World Operations ---

    def get_world_file_path(self, story_slug: str, category: str) -> Path:
        return self.get_story_dir(story_slug) / "world" / f"{category}.json"

    def get_world_section(self, story_slug: str, section: str) -> Any:
        path = self.get_world_file_path(story_slug, section)
        default_val = {} if section == "mechanics" else []
        return read_json_safe(path, default=default_val)

    def save_world_section(self, story_slug: str, section: str, data: Any) -> Any:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, section)
        write_json_safe(path, data)
        return data

    def get_world_mechanics(self, story_slug: str) -> WorldMechanics:
        path = self.get_world_file_path(story_slug, "mechanics")
        data = read_json_safe(path)
        if not data:
            return WorldMechanics(magic_system="Soft Magic", technology_level="Medieval", global_rules=[])
        return WorldMechanics(**data)

    def save_world_mechanics(self, story_slug: str, mechanics: WorldMechanics) -> WorldMechanics:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "mechanics")
        write_json_safe(path, mechanics.model_dump())
        return mechanics

    def get_cities(self, story_slug: str) -> List[City]:
        path = self.get_world_file_path(story_slug, "cities")
        data = read_json_safe(path, default=[])
        return [City(**item) for item in data] if isinstance(data, list) else []

    def save_cities(self, story_slug: str, cities: List[City]) -> List[City]:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "cities")
        write_json_safe(path, [c.model_dump() for c in cities])
        return cities

    def get_factions(self, story_slug: str) -> List[Faction]:
        path = self.get_world_file_path(story_slug, "factions")
        data = read_json_safe(path, default=[])
        return [Faction(**item) for item in data] if isinstance(data, list) else []

    def save_factions(self, story_slug: str, factions: List[Faction]) -> List[Faction]:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "factions")
        write_json_safe(path, [f.model_dump() for f in factions])
        return factions

    def get_artifacts(self, story_slug: str) -> List[Artifact]:
        path = self.get_world_file_path(story_slug, "artifacts")
        data = read_json_safe(path, default=[])
        return [Artifact(**item) for item in data] if isinstance(data, list) else []

    def save_artifacts(self, story_slug: str, artifacts: List[Artifact]) -> List[Artifact]:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "artifacts")
        write_json_safe(path, [a.model_dump() for a in artifacts])
        return artifacts

    def get_glossary(self, story_slug: str) -> List[GlossaryTerm]:
        path = self.get_world_file_path(story_slug, "glossary")
        data = read_json_safe(path, default=[])
        return [GlossaryTerm(**item) for item in data] if isinstance(data, list) else []

    def save_glossary(self, story_slug: str, terms: List[GlossaryTerm]) -> List[GlossaryTerm]:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "glossary")
        write_json_safe(path, [t.model_dump() for t in terms])
        return terms

    def get_quotes(self, story_slug: str) -> List[Quote]:
        path = self.get_world_file_path(story_slug, "quotes")
        data = read_json_safe(path, default=[])
        return [Quote(**item) for item in data] if isinstance(data, list) else []

    def save_quotes(self, story_slug: str, quotes: List[Quote]) -> List[Quote]:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "quotes")
        write_json_safe(path, [q.model_dump() for q in quotes])
        return quotes

    # --- Book & Plot Operations ---

    def get_book_dir(self, story_slug: str, book_id: str) -> Path:
        return self.get_story_dir(story_slug) / "books" / f"book-{book_id}"

    def ensure_book_structure(self, story_slug: str, book_id: str) -> Path:
        book_dir = self.get_book_dir(story_slug, book_id)
        book_dir.mkdir(parents=True, exist_ok=True)
        (book_dir / "chapters").mkdir(exist_ok=True)

        if not (book_dir / "plot.json").exists():
            write_json_safe(book_dir / "plot.json", {"beats": [], "theme": ""})
        if not (book_dir / "character_arcs.json").exists():
            write_json_safe(book_dir / "character_arcs.json", [])
        return book_dir

    def save_book(self, story_slug: str, book: Book) -> Book:
        self.ensure_story_structure(story_slug)
        book_dir = self.ensure_book_structure(story_slug, book.id)
        write_json_safe(book_dir / "book.json", book.model_dump())
        return book

    def get_book(self, story_slug: str, book_id: str) -> Optional[Book]:
        book_dir = self.get_book_dir(story_slug, book_id)
        data = read_json_safe(book_dir / "book.json")
        if not data:
            return None
        return Book(**data)

    def list_books(self, story_slug: str) -> List[Book]:
        books_dir = self.get_story_dir(story_slug) / "books"
        books: List[Book] = []
        if not books_dir.exists():
            return books

        for entry in books_dir.iterdir():
            if entry.is_dir() and entry.name.startswith("book-"):
                book_id = entry.name.replace("book-", "")
                book = self.get_book(story_slug, book_id)
                if book:
                    books.append(book)
        
        books.sort(key=lambda b: b.order)
        return books

    def delete_book(self, story_slug: str, book_id: str) -> bool:
        book_dir = self.get_book_dir(story_slug, book_id)
        if book_dir.exists() and book_dir.is_dir():
            try:
                shutil.rmtree(book_dir)
                return True
            except OSError as e:
                print(f"[FileManager Error] Failed to delete book dir {book_dir}: {e}")
                return False
        return False

    def get_plot(self, story_slug: str, book_id: str) -> Plot:
        book_dir = self.get_book_dir(story_slug, book_id)
        data = read_json_safe(book_dir / "plot.json")
        if not data:
            return Plot(beats=[], theme="")
        return Plot(**data)

    def save_plot(self, story_slug: str, book_id: str, plot: Plot) -> Plot:
        book_dir = self.ensure_book_structure(story_slug, book_id)
        write_json_safe(book_dir / "plot.json", plot.model_dump())
        return plot

    def get_character_arcs(self, story_slug: str, book_id: str) -> List[CharacterArc]:
        book_dir = self.get_book_dir(story_slug, book_id)
        data = read_json_safe(book_dir / "character_arcs.json", default=[])
        return [CharacterArc(**item) for item in data] if isinstance(data, list) else []

    def save_character_arcs(self, story_slug: str, book_id: str, arcs: List[CharacterArc]) -> List[CharacterArc]:
        book_dir = self.ensure_book_structure(story_slug, book_id)
        write_json_safe(book_dir / "character_arcs.json", [arc.model_dump() for arc in arcs])
        return arcs

    # --- Chapter Operations ---

    def get_chapter_json_path(self, story_slug: str, book_id: str, chapter_id: str) -> Path:
        return self.get_book_dir(story_slug, book_id) / "chapters" / f"ch-{chapter_id}.json"

    def get_chapter_md_path(self, story_slug: str, book_id: str, chapter_id: str) -> Path:
        return self.get_book_dir(story_slug, book_id) / "chapters" / f"ch-{chapter_id}.md"

    def save_chapter(self, story_slug: str, book_id: str, chapter: Chapter) -> Chapter:
        book_dir = self.ensure_book_structure(story_slug, book_id)
        ch_json_path = self.get_chapter_json_path(story_slug, book_id, chapter.id)
        ch_md_path = self.get_chapter_md_path(story_slug, book_id, chapter.id)

        # Ensure markdown file path is recorded
        chapter.markdown_file_path = f"books/book-{book_id}/chapters/ch-{chapter.id}.md"
        if not ch_md_path.exists():
            write_text_safe(ch_md_path, f"# {chapter.title}\n\nStart writing scene prose here...")

        # Update word count from markdown file
        prose = read_text_safe(ch_md_path)
        chapter.word_count = len(re.findall(r'\b\w+\b', prose))

        write_json_safe(ch_json_path, chapter.model_dump())
        return chapter

    def get_chapter(self, story_slug: str, book_id: str, chapter_id: str) -> Optional[Chapter]:
        ch_json_path = self.get_chapter_json_path(story_slug, book_id, chapter_id)
        data = read_json_safe(ch_json_path)
        if not data:
            return None
        return Chapter(**data)

    def list_chapters(self, story_slug: str, book_id: str) -> List[Chapter]:
        chapters_dir = self.get_book_dir(story_slug, book_id) / "chapters"
        chapters: List[Chapter] = []
        if not chapters_dir.exists():
            return chapters

        for file_path in chapters_dir.glob("ch-*.json"):
            data = read_json_safe(file_path)
            if data:
                try:
                    chapters.append(Chapter(**data))
                except Exception as e:
                    print(f"Error parsing chapter {file_path}: {e}")
        return chapters

    def delete_chapter(self, story_slug: str, book_id: str, chapter_id: str) -> bool:
        ch_json_path = self.get_chapter_json_path(story_slug, book_id, chapter_id)
        ch_md_path = self.get_chapter_md_path(story_slug, book_id, chapter_id)
        ok1 = delete_file_safe(ch_json_path)
        ok2 = delete_file_safe(ch_md_path)
        return ok1 and ok2

    def read_chapter_prose(self, story_slug: str, book_id: str, chapter_id: str) -> str:
        ch_md_path = self.get_chapter_md_path(story_slug, book_id, chapter_id)
        return read_text_safe(ch_md_path, default="")

    def save_chapter_prose(self, story_slug: str, book_id: str, chapter_id: str, content: str) -> int:
        ch_md_path = self.get_chapter_md_path(story_slug, book_id, chapter_id)
        write_text_safe(ch_md_path, content)

        # Update word count in chapter JSON
        word_count = len(re.findall(r'\b\w+\b', content))
        chapter = self.get_chapter(story_slug, book_id, chapter_id)
        if chapter:
            chapter.word_count = word_count
            ch_json_path = self.get_chapter_json_path(story_slug, book_id, chapter_id)
            write_json_safe(ch_json_path, chapter.model_dump())

        return word_count
