import os
import shutil
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

from app.schemas import (
    Story, Character, CharacterRelationship, WorldMechanics, City, Faction, Artifact, GlossaryTerm, Quote,
    Book, Chapter, Plot, CharacterArc, WritingStats, WritingStatsDay,
    StoryInsights, ProductivityInsights, BookProgress, ComprehensionInsights,
    OrphanedCharacter, PovEntry, FactionCoverage, ArtifactOwnership,
    GlossarySpread, UnderdevelopedCity, NarrativeInsights, ArcWithoutMilestones,
    ArcSummary, PlotDensityEntry, CrossBookCharacter, UnusedSubsection,
    CreativeInsights, MostQuotedCharacter, GalleryCategoryCount, TagCount, InitialCount,
    RelationshipInsights, MostConnectedCharacter, IsolatedCharacter, StrongestBond,
    WorldEntitySummary,
)
from app.file_utils import (
    read_json_safe, write_json_safe, read_text_safe, write_text_safe, delete_file_safe,
    extract_mentioned_character_ids,
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
            "mechanics.json": [{
                "id": "core-universal-laws",
                "name": "Core Universal Laws",
                "magic_system": "Standard / Soft Magic",
                "technology_level": "Medieval / Renaissance",
                "global_rules": ["Energy cannot be created from nothing."]
            }],
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

        mech_list = self.get_world_mechanics(story_slug)
        for mech in mech_list:
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

    def get_story_insights(self, story_slug: str) -> StoryInsights:
        from datetime import datetime as _dt
        from collections import Counter

        story = self.get_story(story_slug)
        if not story:
            return StoryInsights(generated_at=_dt.utcnow().isoformat() + "Z")

        characters = self.list_characters(story_slug)
        cities = self.get_cities(story_slug)
        factions = self.get_factions(story_slug)
        artifacts = self.get_artifacts(story_slug)
        glossary = self.get_glossary(story_slug)
        books = self.list_books(story_slug)
        mech = self.get_world_mechanics(story_slug)
        char_map = self.get_character_map(story_slug)
        stats = self.get_writing_stats(story_slug)

        all_chapters: List[Chapter] = []
        for book in books:
            all_chapters.extend(self.list_chapters(story_slug, book.id))

        total_chapters = len(all_chapters)
        chapters_completed = sum(1 for ch in all_chapters if (ch.word_count or 0) > 0)

        # --- Productivity ---
        books_progress = []
        for book in books:
            chs = self.list_chapters(story_slug, book.id)
            actual = sum(ch.word_count or 0 for ch in chs)
            target = book.target_word_count or 1
            percent = round(actual / target * 100, 1) if target > 0 else 0.0
            books_progress.append(BookProgress(
                book_id=book.id, title=book.title, target=target, actual=actual, percent=percent,
            ))

        velocity_7d = 0.0
        velocity_14d = 0.0
        velocity_trend = "new"
        if stats.recent_activity:
            last_7 = stats.recent_activity[-7:]
            last_14 = stats.recent_activity
            days_7 = sum(1 for d in last_7 if d.words > 0) or 1
            days_14 = sum(1 for d in last_14 if d.words > 0) or 1
            velocity_7d = round(sum(d.words for d in last_7) / days_7)
            velocity_14d = round(sum(d.words for d in last_14) / days_14)
            if velocity_7d > velocity_14d * 1.1:
                velocity_trend = "up"
            elif velocity_7d < velocity_14d * 0.9:
                velocity_trend = "down"
            else:
                velocity_trend = "steady"

        days_since = None
        if stats.last_active:
            try:
                last_dt = _dt.fromisoformat(stats.last_active.replace("Z", "+00:00"))
                days_since = (_dt.now(last_dt.tzinfo) - last_dt).days
            except Exception:
                pass

        longest_silent_gap = None
        if stats.recent_activity:
            gap = 0
            max_gap = 0
            for d in stats.recent_activity:
                if d.words == 0:
                    gap += 1
                    max_gap = max(max_gap, gap)
                else:
                    gap = 0
            longest_silent_gap = max_gap if max_gap > 0 else None

        consistency_score = round(stats.writing_days_total / 90 * 100, 1) if stats.writing_days_total else 0.0

        productivity = ProductivityInsights(
            books_progress=books_progress,
            velocity_7d=velocity_7d,
            velocity_14d=velocity_14d,
            velocity_trend=velocity_trend,
            chapters_completed=chapters_completed,
            chapters_total=total_chapters,
            days_since_last_session=days_since,
            longest_silent_gap=longest_silent_gap,
            consistency_score=consistency_score,
        )

        # --- Comprehension ---
        world_count = len(cities) + len(factions)
        ratio = f"{len(characters)} characters across {world_count} world entities" if world_count else f"{len(characters)} characters, no world entities yet"

        char_ids = {c.id for c in characters}
        orphaned = []
        for c in characters:
            if not c.plot_point_ids and not c.timeline_events and not c.artifact_ids:
                orphaned.append(OrphanedCharacter(id=c.id, name=c.name))

        pov_counter: Counter = Counter()
        for ch in all_chapters:
            for pid in (ch.pov_character_ids or []):
                pov_counter[pid] += 1
        char_name_map = {c.id: c.name for c in characters}
        pov_dist = [PovEntry(character_id=cid, name=char_name_map.get(cid, cid), count=cnt)
                    for cid, cnt in pov_counter.most_common()]

        faction_cov = []
        char_locations = {c.location.strip() for c in characters if c.location and c.location.strip()}
        for f in factions:
            linked = sum(1 for c in characters if c.location and f.name.lower() in c.location.lower())
            faction_cov.append(FactionCoverage(id=f.id, name=f.name, linked_characters=linked))

        artifact_own = []
        for a in artifacts:
            owners = [char_name_map.get(cid, cid) for cid in a.belongs_to if cid in char_name_map]
            artifact_own.append(ArtifactOwnership(id=a.id, name=a.name, owners=owners, unowned=len(owners) == 0))

        cat_counter: Counter = Counter()
        for t in glossary:
            cat_counter[t.category] += 1
        gloss_spread = [GlossarySpread(category=cat, count=cnt) for cat, cnt in cat_counter.most_common()]

        chars_with_tl = sum(1 for c in characters if c.timeline_events)
        chars_without_tl = len(characters) - chars_with_tl

        total_kl = sum(len(c.key_locations) for c in cities)
        avg_kl = round(total_kl / len(cities), 1) if cities else 0.0
        under_cities = [UnderdevelopedCity(id=c.id, name=c.name, key_locations_count=len(c.key_locations))
                        for c in cities if len(c.key_locations) <= 1]

        comprehension = ComprehensionInsights(
            character_count=len(characters),
            city_count=len(cities),
            faction_count=len(factions),
            character_to_world_ratio=ratio,
            orphaned_characters=orphaned,
            pov_distribution=pov_dist,
            faction_coverage=faction_cov,
            artifact_ownership=artifact_own,
            glossary_spread=gloss_spread,
            world_rules_count=sum(len(m.global_rules) for m in mech),
            has_magic_system=any(
                m.magic_system and m.magic_system.strip() for m in mech
            ),
            has_tech_level=any(
                m.technology_level and m.technology_level.strip() for m in mech
            ),
            characters_with_timeline=chars_with_tl,
            characters_without_timeline=chars_without_tl,
            avg_key_locations_per_city=avg_kl,
            underdeveloped_cities=under_cities,
        )

        # --- Narrative ---
        all_beats = []
        for book in books:
            plot = self.get_plot(story_slug, book.id)
            all_beats.extend(plot.beats)

        beats_with_ch = sum(1 for b in all_beats if b.chapter_id)
        beats_no_chars = sum(1 for b in all_beats if not b.character_ids)

        all_arcs = []
        for book in books:
            all_arcs.extend(self.get_character_arcs(story_slug, book.id))

        arcs_with_m = sum(1 for a in all_arcs if a.key_milestones)
        arcs_no_m = [ArcWithoutMilestones(character_id=a.character_id, name=char_name_map.get(a.character_id, a.character_id))
                     for a in all_arcs if not a.key_milestones]
        arc_sums = [ArcSummary(character_id=a.character_id, name=char_name_map.get(a.character_id, a.character_id),
                               from_state=a.starting_state, to_state=a.ending_state)
                    for a in all_arcs]

        plot_density = []
        for book in books:
            chs = self.list_chapters(story_slug, book.id)
            plot = self.get_plot(story_slug, book.id)
            bpc = round(len(plot.beats) / len(chs), 1) if chs else 0.0
            plot_density.append(PlotDensityEntry(book_id=book.id, title=book.title, beats_per_chapter=bpc))

        cross_book = []
        char_book_counts: Dict[str, set] = {c.id: set() for c in characters}
        for book in books:
            for ch in self.list_chapters(story_slug, book.id):
                for pid in (ch.pov_character_ids or []):
                    if pid in char_book_counts:
                        char_book_counts[pid].add(book.id)
            plot = self.get_plot(story_slug, book.id)
            for beat in plot.beats:
                for cid in beat.character_ids:
                    if cid in char_book_counts:
                        char_book_counts[cid].add(book.id)
        for cid, bks in char_book_counts.items():
            if len(bks) > 1:
                cross_book.append(CrossBookCharacter(
                    character_id=cid, name=char_name_map.get(cid, cid),
                    book_count=len(bks), books=sorted(bks),
                ))

        unused_sub = []
        for book in books:
            for sub in book.plot_subsections:
                has_beat = any(b.title.lower() == sub.title.lower() for b in self.get_plot(story_slug, book.id).beats)
                if not has_beat:
                    unused_sub.append(UnusedSubsection(book_id=book.id, book_title=book.title, subsection_title=sub.title))

        narrative = NarrativeInsights(
            total_beats=len(all_beats),
            beats_with_chapter=beats_with_ch,
            beats_without_characters=beats_no_chars,
            arc_count=len(all_arcs),
            arcs_with_milestones=arcs_with_m,
            arcs_without_milestones=arcs_no_m,
            arc_summaries=arc_sums,
            plot_density_per_book=plot_density,
            cross_book_characters=cross_book,
            unused_subsections=unused_sub,
        )

        # --- Creative ---
        char_q_count = sum(len(c.quotes) for c in characters)
        standalone_q = self.get_quotes(story_slug)
        total_q = char_q_count + len(standalone_q)

        most_quoted = None
        if characters:
            best = max(characters, key=lambda c: len(c.quotes))
            if best.quotes:
                most_quoted = MostQuotedCharacter(id=best.id, name=best.name, count=len(best.quotes))

        gallery_total = len(self.get_image_library(story_slug))
        gallery = self.get_world_section(story_slug, "gallery")
        gallery_items = gallery if isinstance(gallery, list) else []
        cat_counter2: Counter = Counter()
        for item in gallery_items:
            cat = item.get("category") if isinstance(item, dict) else "Concept Art"
            cat_counter2[cat or "Concept Art"] += 1
        gallery_cats = [GalleryCategoryCount(category=cat, count=cnt) for cat, cnt in cat_counter2.most_common()]

        all_tags: Counter = Counter()
        for q in standalone_q:
            for tag in q.tags:
                all_tags[tag] += 1
        top_tags = [TagCount(tag=t, count=c) for t, c in all_tags.most_common(10)]

        initial_counter: Counter = Counter()
        for c in characters:
            if c.name:
                initial_counter[c.name[0].upper()] += 1
        for c in cities:
            if c.name:
                initial_counter[c.name[0].upper()] += 1
        for f in factions:
            if f.name:
                initial_counter[f.name[0].upper()] += 1
        naming = [InitialCount(letter=l, count=c) for l, c in initial_counter.most_common()]

        creative = CreativeInsights(
            total_quotes=total_q,
            character_quotes_count=char_q_count,
            standalone_quotes_count=len(standalone_q),
            most_quoted_character=most_quoted,
            gallery_total=gallery_total,
            gallery_by_category=gallery_cats,
            top_tags=top_tags,
            naming_initials=naming,
        )

        # --- Relationships ---
        nodes = char_map.nodes
        edges = char_map.edges
        total_possible = len(nodes) * (len(nodes) - 1) / 2 if len(nodes) > 1 else 1
        density = round(len(edges) / total_possible, 3) if total_possible > 0 else 0.0

        most_connected = None
        if nodes:
            best_node = max(nodes, key=lambda n: n.degree)
            if best_node.degree > 0:
                most_connected = MostConnectedCharacter(id=best_node.id, name=best_node.name, degree=best_node.degree)

        isolated = [IsolatedCharacter(id=n.id, name=n.name) for n in nodes if n.degree == 0]

        strongest = None
        if edges:
            best_edge = max(edges, key=lambda e: e.weight)
            strongest = StrongestBond(source=best_edge.source, target=best_edge.target, weight=best_edge.weight)

        entity_summary = WorldEntitySummary(
            characters=len(characters),
            cities=len(cities),
            factions=len(factions),
            artifacts=len(artifacts),
            glossary=len(glossary),
            total=len(characters) + len(cities) + len(factions) + len(artifacts) + len(glossary),
        )

        relationships = RelationshipInsights(
            total_nodes=len(nodes),
            total_edges=len(edges),
            relationship_density=density,
            most_connected=most_connected,
            isolated_characters=isolated,
            strongest_bond=strongest,
            world_entity_summary=entity_summary,
        )

        return StoryInsights(
            productivity=productivity,
            comprehension=comprehension,
            narrative=narrative,
            creative=creative,
            relationships=relationships,
            generated_at=_dt.utcnow().isoformat() + "Z",
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
                is_pov = (char_id in (ch.pov_character_ids or []))
                scene_ref = (char_id in (ch.scene_breakdown or ""))
                is_interactor = (char_id in (ch.interacting_character_ids or []))
                if is_pov or scene_ref or is_interactor:
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
        Derives a character-relationship graph from plot beat co-occurrence AND
        declared relationships[] on each character. Every plot beat listing 2+
        characters contributes one interaction edge between each pair. Declared
        relationships add edges with weight=0 (declaration-only, no beat) or
        augment existing edges with their label.
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
                            key, {"source": key[0], "target": key[1], "interactions": [], "relationship_label": ""}
                        )
                        record["interactions"].append(CharacterMapInteraction(
                            book_id=book.id,
                            book_title=book.title,
                            beat_id=beat.id,
                            beat_title=beat.title,
                            beat_description=beat.description or "",
                            chapter=chapter_ref,
                        ))

        # Merge declared relationships into edges
        for char in characters:
            for rel in (char.relationships or []):
                if rel.character_id not in node_map:
                    continue
                key = tuple(sorted((char.id, rel.character_id)))
                if key in edges_by_pair:
                    if rel.label and not edges_by_pair[key]["relationship_label"]:
                        edges_by_pair[key]["relationship_label"] = rel.label
                else:
                    edges_by_pair[key] = {
                        "source": key[0],
                        "target": key[1],
                        "interactions": [],
                        "relationship_label": rel.label or "",
                    }

        edges = [
            CharacterMapEdge(
                id=f"{rec['source']}--{rec['target']}",
                source=rec["source"],
                target=rec["target"],
                weight=max(len(rec["interactions"]), 1 if rec.get("relationship_label") else 0),
                interactions=rec["interactions"],
                relationship_label=rec.get("relationship_label", ""),
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
        return read_json_safe(path, default=[])

    def save_world_section(self, story_slug: str, section: str, data: Any) -> Any:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, section)
        write_json_safe(path, data)
        return data

    def _slugify(self, name: str) -> str:
        slug = name.lower()
        slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
        return slug or "mechanics"

    def get_world_mechanics(self, story_slug: str) -> List[WorldMechanics]:
        path = self.get_world_file_path(story_slug, "mechanics")
        data = read_json_safe(path, default=[])
        if not isinstance(data, list):
            data = [data]
        mechanics = []
        for item in data:
            if not item:
                continue
            mech = WorldMechanics(**item)
            if not mech.id:
                mech.id = self._slugify(mech.name or mech.magic_system or "mechanics")
            mechanics.append(mech)
        return mechanics

    def save_world_mechanics(self, story_slug: str, mechanics_list: List[WorldMechanics]) -> List[WorldMechanics]:
        self.ensure_story_structure(story_slug)
        path = self.get_world_file_path(story_slug, "mechanics")
        write_json_safe(path, [m.model_dump() for m in mechanics_list])
        return mechanics_list

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

        # Auto-populate interacting_character_ids from @mentions in prose
        if prose.strip():
            characters = self.list_characters(story_slug)
            chapter.interacting_character_ids = extract_mentioned_character_ids(prose, characters)

        if not chapter.order:
            existing = self.list_chapters(story_slug, book_id)
            chapter.order = max([c.order or 0 for c in existing] or [0]) + 1

        write_json_safe(ch_json_path, chapter.model_dump())
        return chapter

    def set_chapter_image_url(self, story_slug: str, book_id: str, chapter_id: str, image_url: str) -> Optional[Chapter]:
        """Persist a generated illustration url on an existing chapter (in-place)."""
        ch = self.get_chapter(story_slug, book_id, chapter_id)
        if not ch:
            return None
        ch.image_url = image_url
        write_json_safe(
            self.get_chapter_json_path(story_slug, book_id, chapter_id),
            ch.model_dump(),
        )
        return ch

    def get_chapter(self, story_slug: str, book_id: str, chapter_id: str) -> Optional[Chapter]:
        ch_json_path = self.get_chapter_json_path(story_slug, book_id, chapter_id)
        data = read_json_safe(ch_json_path)
        if not data:
            return None
        return Chapter(**data)

    def list_chapters(self, story_slug: str, book_id: str, reverse: bool = False) -> List[Chapter]:
        chapters_dir = self.get_book_dir(story_slug, book_id) / "chapters"
        chapters: List[Chapter] = []
        if not chapters_dir.exists():
            return chapters

        def _id_num(cid: str) -> int:
            m = re.search(r'\d+', cid or '')
            return int(m.group()) if m else 0

        for file_path in chapters_dir.glob("ch-*.json"):
            data = read_json_safe(file_path)
            if data:
                try:
                    chapters.append(Chapter(**data))
                except Exception as e:
                    print(f"Error parsing chapter {file_path}: {e}")

        chapters.sort(key=lambda c: (c.order or 0, _id_num(c.id)), reverse=reverse)
        return chapters

    def rename_chapter(self, story_slug: str, book_id: str, old_id: str, new_id: str):
        """Rename or swap chapter ids. Returns (renamed_chapter, swapped_chapter_or_None)."""
        if old_id == new_id:
            return self.get_chapter(story_slug, book_id, old_id), None

        target = self.get_chapter(story_slug, book_id, new_id)
        source = self.get_chapter(story_slug, book_id, old_id)
        if not source:
            return None, None

        swap_ch = None
        if target:
            tmp_id = f"_swap_{old_id}_{new_id}"
            target.id = tmp_id
            target.markdown_file_path = f"books/book-{book_id}/chapters/ch-{tmp_id}.md"
            write_json_safe(self.get_chapter_json_path(story_slug, book_id, tmp_id), target.model_dump())
            old_target_json = self.get_chapter_json_path(story_slug, book_id, new_id)
            new_target_json = self.get_chapter_json_path(story_slug, book_id, tmp_id)
            if old_target_json.exists():
                os.rename(old_target_json, new_target_json)
            old_target_md = self.get_chapter_md_path(story_slug, book_id, new_id)
            new_target_md = self.get_chapter_md_path(story_slug, book_id, tmp_id)
            if old_target_md.exists():
                os.rename(old_target_md, new_target_md)

        old_json = self.get_chapter_json_path(story_slug, book_id, old_id)
        new_json = self.get_chapter_json_path(story_slug, book_id, new_id)
        old_md = self.get_chapter_md_path(story_slug, book_id, old_id)
        new_md = self.get_chapter_md_path(story_slug, book_id, new_id)

        if old_json.exists():
            os.rename(old_json, new_json)
        if old_md.exists():
            os.rename(old_md, new_md)

        source.id = new_id
        source.markdown_file_path = f"books/book-{book_id}/chapters/ch-{new_id}.md"
        new_id_num = re.search(r'\d+', new_id or '')
        if new_id_num:
            source.order = int(new_id_num.group())
        write_json_safe(new_json, source.model_dump())

        if target:
            swap_ch = self.get_chapter(story_slug, book_id, f"_swap_{old_id}_{new_id}")
            if swap_ch:
                swap_ch.id = old_id
                swap_ch.markdown_file_path = f"books/book-{book_id}/chapters/ch-{old_id}.md"
                old_id_num = re.search(r'\d+', old_id or '')
                if old_id_num:
                    swap_ch.order = int(old_id_num.group())
                swap_tmp_json = self.get_chapter_json_path(story_slug, book_id, f"_swap_{old_id}_{new_id}")
                swap_final_json = self.get_chapter_json_path(story_slug, book_id, old_id)
                if swap_tmp_json.exists():
                    os.rename(swap_tmp_json, swap_final_json)
                swap_tmp_md = self.get_chapter_md_path(story_slug, book_id, f"_swap_{old_id}_{new_id}")
                swap_final_md = self.get_chapter_md_path(story_slug, book_id, old_id)
                if swap_tmp_md.exists():
                    os.rename(swap_tmp_md, swap_final_md)
                write_json_safe(swap_final_json, swap_ch.model_dump())

        plot = self.get_plot(story_slug, book_id)
        changed = False
        for beat in plot.beats:
            if beat.chapter_id == old_id:
                beat.chapter_id = new_id
                changed = True
            elif target and beat.chapter_id == new_id:
                beat.chapter_id = old_id
                changed = True
        if changed:
            self.save_plot(story_slug, book_id, plot)

        return source, swap_ch

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

        # Update word count and @mention interactors from markdown content
        word_count = len(re.findall(r'\b\w+\b', content))
        chapter = self.get_chapter(story_slug, book_id, chapter_id)
        if chapter:
            chapter.word_count = word_count
            characters = self.list_characters(story_slug)
            chapter.interacting_character_ids = extract_mentioned_character_ids(content, characters)
            ch_json_path = self.get_chapter_json_path(story_slug, book_id, chapter_id)
            write_json_safe(ch_json_path, chapter.model_dump())

        return word_count

    def find_replace_across_chapters(self, story_slug: str, find_text: str, replace_text: str = "", case_sensitive: bool = False, whole_word: bool = False, dry_run: bool = True):
        """
        Search (and optionally replace) text across all chapters in all books.
        Returns list of matches per chapter.
        """
        import re as _re

        if not find_text:
            return {"total_matches": 0, "chapters": [], "total_replaced": 0}

        flags = 0 if case_sensitive else _re.IGNORECASE
        if whole_word:
            pattern = _re.compile(r'\b' + _re.escape(find_text) + r'\b', flags)
        else:
            pattern = _re.compile(_re.escape(find_text), flags)

        results = []
        total_matches = 0
        total_replaced = 0

        for book in self.list_books(story_slug):
            chapters = self.list_chapters(story_slug, book.id)
            for ch in chapters:
                prose = self.read_chapter_prose(story_slug, book.id, ch.id)
                if not prose:
                    continue

                matches = list(pattern.finditer(prose))
                if not matches:
                    continue

                chapter_result = {
                    "book_id": book.id,
                    "book_title": book.title,
                    "chapter_id": ch.id,
                    "chapter_title": ch.title,
                    "match_count": len(matches),
                    "contexts": [],
                }

                for m in matches[:5]:
                    start = max(0, m.start() - 40)
                    end = min(len(prose), m.end() + 40)
                    chapter_result["contexts"].append({
                        "offset": m.start(),
                        "before": prose[start:m.start()],
                        "match": prose[m.start():m.end()],
                        "after": prose[m.end():end],
                    })

                total_matches += len(matches)

                if not dry_run and replace_text:
                    new_prose, n = pattern.subn(replace_text, prose)
                    if n > 0:
                        self.save_chapter_prose(story_slug, book.id, ch.id, new_prose)
                        total_replaced += n
                        chapter_result["replaced"] = True

                results.append(chapter_result)

        return {
            "total_matches": total_matches,
            "total_replaced": total_replaced,
            "chapters": results,
        }
