"""One-off Notion Markdown export -> LoreSmith importer.

Imports a Notion export folder (~/Downloads/notion_export by default) into the
local LoreSmith data model using the existing `FileManager`/`file_utils`
helpers (never raw disk writes).

Design: see plans/notion-import-pipeline.md

Usage:
    PYTHONPATH=backend .venv/bin/python scripts/import_notion.py \
        --dir ~/Downloads/notion_export \
        [--data-dir PATH] [--dry-run] [--overwrite] [--enrich]
"""
import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from urllib.parse import unquote

from app.file_manager import FileManager
from app.schemas import Story, Book, Chapter

INDEX_LINK_RE = re.compile(r"^\s*\[[^\]]+\]\([^)]+\)\s*$")
CHAPTER_MARKER_RE = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:chapter|ch\.?)\s*([0-9ivx]+)[\s:—-]*([^\n#]*)",
    re.IGNORECASE,
)


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return s.strip("-") or "story"


@dataclass
class ChapterSpec:
    title: str
    number: Optional[int]
    content: str


@dataclass
class Page:
    path: Path
    title: str
    is_index: bool
    body: str = ""
    overview: str = ""
    chapters: List[ChapterSpec] = field(default_factory=list)


def _clean_title(path: Path) -> str:
    """Strip the trailing Notion block-hash (' <32hex>.md') from a filename."""
    stem = path.stem
    return re.sub(r"\s+[0-9a-fA-F]{32}$", "", stem).strip()


def _is_index(body: str) -> bool:
    """An index page is mostly a list of relative links with little/no body."""
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
    if not lines:
        return True
    first_line = lines[0]
    if first_line.startswith("#"):
        lines = lines[1:]
    if not lines:
        return True
    non_links = [ln for ln in lines if not INDEX_LINK_RE.match(ln)]
    link_count = len(lines) - len(non_links)
    return link_count > 0 and (len(non_links) == 0 or link_count > len(non_links))


def _parse_chapters(body: str, title: str) -> List[ChapterSpec]:
    """Split a page body into chapters based on inline 'CHAPTER n' markers."""
    lines = body.splitlines()
    current_title = title
    current_number: Optional[int] = None
    buffers: List[ChapterSpec] = []
    buf: List[str] = []

    def flush():
        content = "\n".join(buf).strip()
        if content:
            buffers.append(ChapterSpec(title=current_title, number=current_number, content=content))
        buf.clear()

    for ln in lines:
        match = CHAPTER_MARKER_RE.match(ln)
        if match and current_number is None:
            continue
        if match:
            flush()
            current_title = match.group(2).strip() or f"Chapter {match.group(1)}"
            current_number = _roman(match.group(1))
        else:
            buf.append(ln)
    flush()

    if len(buffers) <= 1 and current_number is None:
        buffers = []
    return buffers


def _roman(token: str) -> Optional[int]:
    token = token.strip().lower()
    if token.isdigit():
        return int(token)
    roman = {"i": 1, "v": 5, "x": 10}
    total, prev = 0, 0
    for ch in reversed(token):
        val = roman.get(ch)
        if val is None:
            return None
        total += -val if val < prev else val
        prev = val
    return total


def discover_export(root: Path) -> List[Page]:
    """Walk the export, classifying every .md file. Returns all pages (incl. index)."""
    pages: List[Page] = []
    for path in sorted(root.rglob("*.md")):
        try:
            body = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            body = ""
        title = _clean_title(path)
        pages.append(Page(path=path, title=title, is_index=_is_index(body), body=body))
    return pages


def build_story_tree(root: Path, pages: List[Page]) -> List[Page]:
    """Link child pages to their parent (via links inside the parent body) and split
    each root page into chapters. Nested chapter child-pages become the authoritative
    chapters of their parent story."""
    by_path = {p.path: p for p in pages}
    index = {p.path for p in pages if p.is_index}
    parent_of: dict = {}

    for p in pages:
        for m in re.finditer(r"\(([^)]+)\)", p.body):
            target = unquote(m.group(1))
            candidate = (p.path.parent / target)
            try:
                resolved = (p.path.parent / target).resolve()
            except OSError:
                continue
            if resolved in by_path:
                parent_of[by_path[resolved].path] = p.path

    def is_child(p: Page) -> bool:
        parent = parent_of.get(p.path)
        return parent is not None and parent not in index

    # Group children under each parent path
    children_of: dict = {}
    for child_path, parent_path in parent_of.items():
        if parent_path not in index:
            children_of.setdefault(parent_path, []).append(by_path[child_path])

    stories: List[Page] = []
    for p in pages:
        if p.is_index or is_child(p):
            continue
        kids = children_of.get(p.path, [])
        if kids:
            p.chapters = [_child_chapter(c) for c in sorted(kids, key=_child_sort_key)]
            p.overview = _strip_links(p.body)
        else:
            p.chapters = _chapters_from_body(p)
        stories.append(p)
    return stories


def _child_sort_key(page: Page):
    m = re.search(r"(?:chapter|ch\.?)\s*([0-9ivx]+)", page.title, re.IGNORECASE)
    num = _roman(m.group(1)) if m else None
    return (0 if num is not None else 1, num if num is not None else 0, page.title.lower())


def _strip_links(body: str) -> str:
    """Remove markdown link markup, keeping link text, for storing as overview."""
    lines = []
    for ln in body.splitlines():
        if INDEX_LINK_RE.match(ln):
            continue
        lines.append(re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", ln).strip())
    return "\n".join([l for l in lines if l]).strip()


def _child_chapter(page: Page) -> ChapterSpec:
    return ChapterSpec(title=page.title, number=None, content=page.body)


def _chapters_from_body(page: Page) -> List[ChapterSpec]:
    parsed = _parse_chapters(page.body, page.title)
    if parsed:
        return parsed
    return [ChapterSpec(title=page.title, number=None, content=page.body)]


def import_story(fm: FileManager, page: Page, book_id: str = "1") -> None:
    slug = slugify(page.title)
    fm.ensure_story_structure(slug)
    story = Story(id=slug, title=page.title)
    if page.overview:
        story.overview = [page.overview]
    fm.save_story(story)
    fm.save_book(slug, Book(id=book_id, title=page.title, order=1, target_word_count=0))

    for i, ch in enumerate(page.chapters, start=1):
        ch_id = str(i)
        fm.save_chapter(slug, book_id, Chapter(id=ch_id, title=ch.title))
        fm.save_chapter_prose(slug, book_id, ch_id, ch.content)


SHORT_SEED_THRESHOLD = 60


def dry_run_report(stories: List[Page]) -> None:
    print("\n=== DRY-RUN REPORT ===")
    print(f"{'Story':<40} {'#ch':>4}  {'words':>7}  flag")
    total_stories = total_ch = total_words = 0
    for s in stories:
        nch = len(s.chapters)
        words = sum(len(x.content.split()) for x in s.chapters)
        flag = "short-seed" if words < SHORT_SEED_THRESHOLD else ""
        total_stories += 1
        total_ch += nch
        total_words += words
        print(f"{s.title[:40]:<40} {nch:>4}  {words:>7}  {flag}")
    print("-" * 58)
    print(f"{'TOTAL':<40} {total_ch:>4}  {total_words:>7}  ({total_stories} stories)")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Import a Notion Markdown export into LoreSmith")
    parser.add_argument("--dir", default="~/Downloads/notion_export",
                        help="Path to the Notion export folder")
    parser.add_argument("--data-dir", default=None,
                        help="DATA_DIR override (default: env DATA_DIR or data/stories)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Only discover + report; write nothing")
    parser.add_argument("--overwrite", action="store_true",
                        help="Overwrite existing stories with the same slug")
    parser.add_argument("--enrich", action="store_true",
                        help="Run Ollama enrichment (classify prose/notes + extract entities)")
    args = parser.parse_args(argv)

    root = Path(args.dir).expanduser().resolve()
    if not root.is_dir():
        print(f"[error] export dir not found: {root}", file=sys.stderr)
        return 1

    pages = discover_export(root)
    stories = build_story_tree(root, pages)

    dry_run_report(stories)
    if args.dry_run:
        return 0

    fm = FileManager(Path(args.data_dir)) if args.data_dir else FileManager()

    created = skipped_existing = 0
    for s in stories:
        slug = slugify(s.title)
        if fm.get_story(slug) and not args.overwrite:
            print(f"[skip] existing story '{s.title}' ({slug})")
            skipped_existing += 1
            continue
        import_story(fm, s)
        created += 1
        print(f"[import] '{s.title}' -> {slug} ({len(s.chapters)} chapters)")

    print(f"\nDone. created={created} skipped_existing={skipped_existing} "
          f"total_stories={len(stories)}")
    print(f"Data dir: {fm.base_data_dir}")

    flags = [s.title for s in stories if sum(len(x.content.split()) for x in s.chapters) < SHORT_SEED_THRESHOLD]
    if flags:
        print(f"\n[flag] {len(flags)} short idea-seed page(s) for manual review: {', '.join(flags)}")

    if args.enrich:
        from app.ai.notion_enrich import run_enrich
        print("\n[enrich] Running Ollama enrichment on imported stories…")
        total = {"characters": 0, "cities": 0, "factions": 0, "plot_beats": 0, "tags": 0, "notes": 0}
        for s in stories:
            slug = slugify(s.title)
            if not fm.get_story(slug):
                continue
            counts = run_enrich(fm, slug)
            for k, v in counts.items():
                total[k] = total.get(k, 0) + v
            print(f"[enrich] '{s.title}': " + ", ".join(f"{k}={v}" for k, v in counts.items()))
        print("[enrich] totals: " + ", ".join(f"{k}={v}" for k, v in total.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
