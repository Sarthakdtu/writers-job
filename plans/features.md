# Feature List

This is the canonical index of features in LoreSmith — both **implemented** and
**planned**. Each entry has a short summary and a reference to the detailed plan
document (or the implementation, if done).

## Conventions

- **Implemented** features live under `plans/implemented/`. Their plan documents
  were moved there once the feature shipped.
- **Planned** features live under `plans/`. Their documents are design-only until
  the feature is implemented, at which point they are moved to `plans/implemented/`.
- `feature-ideas.md` is a brainstorm backlog — items there may not yet have a dedicated
  plan document.

---

## Implemented

| Feature | Summary | Reference |
|---------|---------|-----------|
| **Ollama AI Pipelines & Skills** | Full local AI layer: generic Ollama client, 20+ built-in analysis pipelines, 3 import pipelines, context router, custom Skill Studio, AI job queue. Pro-tier gated. | `plans/implemented/ollama-ai-skills.md` |
| **Creator Pipeline (Pro)** | **Pro-tier** story import from pasted raw prose. Multi-stage, iterative, review-gated pipeline: split prose into book/chapters, then extracts characters, world entities, plot beats/themes, and character arcs via Ollama (strict JSON, retries). Processes chapter batches merging on top of prior extractions. Separate `creator/` backend sub-package + dedicated wizard UI (`CreatorPipelineView`). | `plans/implemented/creator-pipeline.md` |
| **Notion → LoreSmith Import** | One-off script that ingests a Notion Markdown export and builds stories/books/chapters, with Ollama enrichment (prose-vs-notes classification + entity extraction: characters, cities, factions, plot beats, tags). | `plans/implemented/notion-import-pipeline.md` |
| **Google Sign-In (OAuth2)** | Google account auth via OAuth2; `GoogleAuthService` provides a Drive service for backup. | `plans/implemented/google-signin-implementation.md` |
| **Google Drive Backup & Sync** | Real, idempotent backup of all story files to a `LoreSmith` Drive folder (per-story manifests, upload/update/delete), plus **restore from Drive** with per-story conflict resolution (`drive`/`local` choice). | `plans/implemented/google-drive-sync.md` |
| **AI Skills — Beginner-Friendly UX Overhaul** | Progressive disclosure (simple/advanced toggle), entity focus picker replacing raw source chips, skill templates/presets, inline field help text, and per-run scope override in AIPanel. | `plans/implemented/ai-ux-simplification.md` |

---

## Planned (design only)

### Backlog — no plan doc yet
- See `feature-ideas.md` for brainstormed ideas not yet specced.

### Has a plan document (design phase)

| # | Feature | Summary | Plan doc |
|---|---------|---------|----------|
| 1 | **Dashboard Insights** | Deeper dashboard insights cards (fun facts, writing progress, memorable quotes) — a design plan for richer per-story analytics UI. | `plans/dashboard-insights.md` |
| 2 | **Google Drive Two-Way Sync** | Export **and** import stories between LoreSmith and Google Drive (the read/restore side of full two-way sync beyond the current backup). **Design/planning only — not implemented.** | `plans/google-drive-two-way-sync.md` |
| 3 | **Telegram Integration** | Push story updates/receive writing commands via Telegram bot. **Not implemented** — treat as design only. | `plans/telegram-integration.md` |

---

## Moving a feature to "Implemented"

When a planned feature is fully implemented:

1. Move its plan document into `plans/implemented/`:
   ```bash
   git mv plans/<feature>.md plans/implemented/<feature>.md
   ```
2. Update the tables above (remove the row from **Planned**, add it to **Implemented**).
3. Record the change in `CHANGELOG/YYYY-MM-DD.md` (create if needed).
4. Update the relevant sections of `AGENTS.md` if the codebase knowledge needs to reflect the new functionality.
