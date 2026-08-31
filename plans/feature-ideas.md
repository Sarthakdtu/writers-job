# LoreSmith — Feature Ideas Brainstorm

> Captured 2025-09-01. Candidates for implementation.

---

## High-Impact "Must-Haves"

### 1. Real Google Drive Backup
The UI prominently shows a sync button that does nothing. This is the single biggest trust gap. Without it, a disk failure means total data loss. The design doc exists (`google-drive-sync.md`, 4 phases) — it's the most important unbuilt feature.

### 2. Global Timeline View
Timeline events exist per-character but there's no way to see the whole story's chronology on one axis. A merged, filterable timeline (by character, book, era) would be incredibly useful for catching continuity errors and visualizing story structure.

### 3. Prose Content Search
Cmd+K finds entities but can't search inside chapter text. A writer looking for where they mentioned "the amber seal" has to open every chapter manually. Full-text search across `.md` files is a small feature with huge daily utility.

### 4. Version History / Chapter Snapshots
Right now every save is destructive with no rollback. Even a simple approach — keeping the last N saves as `.md.bak` files or a `snapshots/` folder per chapter — would give writers confidence to experiment. Git-style diffs between versions would be a bonus.

---

## Medium-Impact Power Features

### 5. Export to DOCX / EPUB / PDF
Writers need to get their work *out*. A "Export Book" button that compiles all chapters in order into a formatted DOCX (via `python-docx`) or EPUB (via `ebooklib`) would close the loop from outline → prose → deliverable.

### 6. Manuscript View / Compile
Related to export but deeper — a view that lets you stitch chapters from one or more books into a single scrollable manuscript with a title page, part dividers, and chapter headings. This is how writers actually review their work.

### 7. Telegram Quick Capture
The design doc exists (`telegram-integration.md`). Writers constantly have ideas at inconvenient times (walking, lying in bed). A Telegram bot that drops notes into a story's inbox — and surfaces them in the frontend — would capture a real workflow pain point.

### 8. AI Result History + Markdown Export
Phase 7 polish. Right now re-running a pipeline overwrites the previous result. Keeping a history log (with timestamps) and letting users download results as `.md` would make the AI analysis actually useful for comparison over time.

---

## Subtle but Valuable

### 9. Writing Streaks / Session Stats
A dashboard card showing daily word count, writing streak, session duration. Writers are motivated by visible progress. Could be derived from file modification times — no new data model needed.

### 10. Cross-Chapter Find & Replace
Global search-and-replace across all chapters in a book. When you rename a character or change a place name, you need to catch every occurrence. Currently requires manual editing of each chapter.

### 11. Sidebar "Recently Edited"
A quick-access list of the last 5-10 chapters/characters/cities you worked on. Reduces navigation friction when jumping between related entities during a writing session.

### 12. Chapter Word Count Targets + Progress Bars
Books have `target_word_count` but there's no visual progress toward it. A progress bar per book showing current total vs. target, and per-chapter targets, would help writers pace themselves.

### 13. Character Relationship Editor
The Character Map *shows* relationships derived from plot beats, but there's no way to explicitly declare relationships (siblings, rivals, mentors, lovers). Adding a `relationships[]` field to characters would make the map richer and enable relationship-aware AI analysis.

---

## Infrastructure / Reliability

### 14. Automated Tests
The codebase has zero tests. Even basic integration tests for the FileManager CRUD routes and Pydantic schema validation would prevent regressions. The backend is pure Python — pytest would be straightforward.

### 15. Data Migration / Schema Versioning
As new fields get added (like `persona`, `background_images`, `deleted_at`), old story JSON files lack them. A lightweight schema version field + migration runner would prevent subtle bugs when users have old stories.

---

## Priority Shortlist

If picking three to implement first:

1. **Real Google Drive Backup** — trust (data safety)
2. **Global Timeline View** — insight (story structure visibility)
3. **Export to DOCX/EPUB** — output (sharing with the world)

These close the loop from "I store my writing locally" to "my work is safe, I can see my whole story, and I can share it."
