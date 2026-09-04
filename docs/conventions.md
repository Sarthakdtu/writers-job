# Conventions & Change Guidelines

Follow these to keep code consistent and safe.

## Backend

1. **All file I/O through `file_utils` helpers** — never raw `open()` on data files.
2. **Add new route handlers in `main.py`** with typed Pydantic `response_model`s (import
   from `app.schemas`). Keep REST shape consistent.
3. **Put filesystem logic in `FileManager`** (`file_manager.py`), not inline in routes.
4. **Add a Pydantic model in `schemas.py`** for every new entity/shape.
5. **Slug / id convention:** story/char/city/book/chapter ids are lowercase URL-safe
   slugs (`name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`). Books are `"1","2",...`
   and dirs are `book-<id>`. Chapters use `ch-<id>` file prefix.
6. When adding a new world section/file, remember to add a default to
   `ensure_story_structure` **and** decide whether it's an array or object (all world
   files except `mechanics` are arrays; `mechanics` is now also an array).

## Frontend

1. **UI reads theme from CSS variables** (`var(--accent)`, etc.) — no hardcoded colors.
2. **Reuse existing components/modal patterns** (modals are fixed-overlay divs with
   `animate-in fade-in`; `ArtifactFormModal` for artifacts).
3. **Use `useStory()`/`useTheme()` contexts** rather than prop-drilling story/theme state.
4. **Icons:** import from `lucide-react`.
5. **Component/module naming:** module views live in `components/modules/` and end in
   `View`; shared components live in `components/`.
6. **New active views** must be registered in the `activeTab` switch in `App.jsx` **and**
   in `NAV_ITEMS` in `Sidebar.jsx`.

## General

- **Do not add code comments unless asked** (project convention).
- Match existing formatting/indentation. Backend is Python/PEP-8-ish; frontend uses 2-space
  indent in JSX.
- Do **not** commit secrets. `client_secret.json` and `.env`-style tokens must stay out of git.
- `data/` is git-ignored (`.gitignore`: `data/*`) — user-generated content stays local.

---

# Known Issues / Gotchas

- `WorldbuildingView`/`CharacterRosterView` each contain a duplicated
  `syncArtifactCharacters` helper — there is no shared util yet. If you refactor, keep both
  callers working.
- `AmbientBackground` uses `background_images` (cycling, 20s), falling back to
  `background_url`, then `background_path`.
- `schemas.Story.theme` uses literal `"paper"` as the third theme id in the **schema**, but
  `ThemeContext.THEMES` uses `"typewriter"`. Keep the frontend literal (`typewriter`) for
  the UI; be aware `Story.theme` may contain either. Don't "fix" this without checking both.
