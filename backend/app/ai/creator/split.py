"""Chapter splitting for the Creator Pipeline (no LLM).

Tries to detect explicit chapter markers in the pasted text; when none are
found, falls back to chunking by page-break-like double newlines into
~reasonable word-sized blocks. Produces ordered SplitChapter entries whose
content is written by the pipeline via FileManager.
"""
import re
from typing import List, Tuple

_CHAPTER_RE = re.compile(
    r"^(?:#{1,6}[ \t]+)?(?:chapter|ch\.?|part|book)[ \t]+"
    r"([0-9]+|[ivxlcdm]+)[ \t]*[:.\-–—]?[ \t]*([^\n]*?)[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)

_HEADING_RE = re.compile(r"^\s*(#{1,6})\s+(.+?)\s*$", re.MULTILINE)

CHUNK_WORDS = 1500


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def _clean_segment(seg: str) -> str:
    return seg.strip("\n \t")


def split_chapters(raw_text: str) -> List[Tuple[str, str]]:
    """Return a list of (title, content) chapter tuples.

    Order of preference:
    1. explicit `Chapter N ...` (or `## Chapter N`) markers on their own lines
    2. markdown headings (## Title)
    3. chunk the whole text into ~CHUNK_WORDS blocks
    """
    raw = (raw_text or "").strip()
    if not raw:
        return []

    # 1) Explicit chapter/part markers — each marker line becomes a chapter title
    #    (the title is whatever follows on the SAME line, so content isn't swallowed).
    matches = list(_CHAPTER_RE.finditer(raw))
    if len(matches) >= 2:
        chapters: List[Tuple[str, str]] = []
        for i, m in enumerate(matches):
            title = (m.group(2) or "").strip()
            if not title:
                title = f"Chapter {m.group(1)}"
            elif not title.lower().startswith(("chapter", "part", "book")):
                title = f"{m.group(1)} — {title}".strip(" —")
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
            content = _clean_segment(raw[start:end])
            if content:
                chapters.append((title, content))
        if chapters:
            return chapters

    # 2) Markdown headings (at least 2)
    headings = list(_HEADING_RE.finditer(raw))
    if len(headings) >= 2:
        sections: List[Tuple[str, str]] = []
        for i, h in enumerate(headings):
            start = h.end()
            end = headings[i + 1].start() if i + 1 < len(headings) else len(raw)
            title = h.group(2).strip()
            content = _clean_segment(raw[start:end])
            if content:
                sections.append((title, content))
        if sections:
            return sections

    # 3) Paragraph chunking
    paragraphs = [p for p in re.split(r"\n\s*\n", raw) if p.strip()]
    if not paragraphs:
        return [("Chapter 1", raw)]

    chunks: List[Tuple[str, str]] = []
    current = []
    current_words = 0
    for p in paragraphs:
        w = _word_count(p)
        if current and current_words + w > CHUNK_WORDS:
            body = _clean_segment("\n\n".join(current))
            chunks.append((f"Chapter {len(chunks) + 1}", body))
            current = []
            current_words = 0
        current.append(p)
        current_words += w
    if current:
        body = _clean_segment("\n\n".join(current))
        chunks.append((f"Chapter {len(chunks) + 1}", body))
    return chunks

