# Frontend Architecture

## Provider nesting (`App.jsx`)

`ThemeProvider` → `StoryProvider` → `SkillLevelProvider` → `MainLayout`. `MainLayout` renders
`Navbar`, `Sidebar`, `AmbientBackground`, the active module (from `activeTab` switch), the
global `QuickSearchModal`, `GoogleDriveModal`, the global `ExplorerPanel` (bottom-right widget
+ right-drawer), and the `AIPanel`. **Focus mode** hides the navbar/sidebar; the Explorer
widget stays visible (as a locked, non-expanding compass below Intermediate).

## Skill Levels (`SkillLevelContext.jsx` + `SkillLevelToggle.jsx`)

Progressive-unlock "modes" (Beginner → Intermediate → Pro) that progressively reveal features
so new users aren't overwhelmed.

- `SkillLevelContext.jsx` exposes `SkillLevelProvider`, `useSkillLevel()`,
  `SKILL_LEVELS`, `LEVEL_ORDER` (`['beginner','intermediate','pro']`), `FEATURE_LEVELS`,
  `canUse(key)`, `featureLevel(key)`, `featureIndex(key)`. Level persisted in `localStorage`
  (`loresmith_skill_level`, default `beginner`).
- **Modes summary** (defaults; change `FEATURE_LEVELS` to remap):
  - **Beginner**: Home, Story Dashboard, Character Roster, Draft Editor (Markdown), Quotes,
    Trash, Quick Search, Themes, Create Story, Drive Backup.
  - **Intermediate**: Worldbuilding Hub, Book Outliner (Tree + Plot Beats only), Character Map,
    Universe Explorer, Google Doc editing mode, Focus Mode.
  - **Pro**: full AI Panel, Skill Studio, Character Arcs, POV Tracker, Chapter Judge,
    Perspective Rewrite, AI settings, AI image picker.
- UI: `Navbar.jsx` mounts the `SkillLevelToggle`; `Sidebar.jsx` filters `NAV_ITEMS` by tier.
  Locked tabs guarded by `LevelGate` in `App.jsx`. Changing tier triggers the
  `skill-level-unlock` animation on `<main>` (defined in `index.css`).
- **Convention:** to gate a feature behind a tier, add a `FEATURE_LEVELS` entry and call
  `canUse('your.feature')` at the relevant UI point.

## Universe Explorer (`ExplorerPanel.jsx`)

Global bottom-right compass widget + horizontal hover quick-access bar. A fixed
bottom-right circular compass anchors a **horizontal quick-access bar** (no sidebar, no
radial fan). The compass + bar form a single **hover zone** (~30rem-wide band):
hovering **expands** the tray **leftward** listing the **top 5 frequently-used entities**
(image avatars when available, else a type icon) plus a dashed "All" button;
leaving the band **collapses** it.

- Clicking an entity opens a compact popup with its **top-3 quick notes**; the "All" button
  opens a searchable "browse universe" popup (with per-type filter chips).
- **Top-5 ranking = relevance + usage.** Relevance is keyword overlap of character
  notes with the current chapter context (`loresmith:editor-context` window event);
  usage is a per-story tally persisted in `localStorage` (`loresmith_explorer_usage_v1`).
- **Characters**: top-3 `notes[]` ranked by relevance; fallback to first 3 when no context.
- **Cities / Factions / Artifacts / Glossary**: descriptive fields as quick notes.
- Notes render `[[type:id|label]]` tokens via `EntityReferenceText`.

## Contexts

- **`StoryContext`** (`useStory`): `stories`, `activeStory`, `selectStory`, `createStory`,
  `updateStory`, `updateActiveStory`, `fetchStories`, `activeTab`/`setActiveTab`,
  `selectedTag`, `availableTags`, `focusMode`/`setFocusMode`, `sidebarOpen`,
  `quickSearchOpen`, `loading`. Global hotkeys: **Ctrl/Cmd+Shift+F** focus,
  **Ctrl/Cmd+K** search, **Esc** closes search. Active story id persisted in
  `localStorage` (`writer_job_active_story_id`).
- **`ThemeContext`** (`useTheme`): `theme`, `setTheme`, `currentThemeObj`, `THEMES`.
  Sets `data-theme` on `<html>`; persists to `localStorage` (`writer_theme`).

## Theming / CSS variables (`index.css`)

Color theming via CSS custom properties switched by `html[data-theme="..."]`:
- `sepia` (default, light), `midnight` (dark), `typewriter` (monochrome).
- Core variables: `--bg-base`, `--bg-panel`, `--bg-card`, `--bg-hover`, `--border-color`,
  `--border-subtle`, `--text-main`, `--text-muted`, `--text-dim`, `--accent`,
  `--accent-hover`, `--accent-light`, `--shadow-color`, `--font-prose`, `--font-ui`.
- Components reference these via classes like `literary-card`, `glass-panel`,
  `font-prose`, `font-ui`. **When adding UI, use these variables — never hardcode colors.**

## Component/module structure

Module views live in `components/modules/` and end in `View`. Shared components
live in `components/`.

### Shared components
- `Navbar.jsx` — Story selector, theme picker, ⌘K, Drive backup, focus, AI panel toggle
- `Sidebar.jsx` — `NAV_ITEMS` + active universe badge + "Recently Edited" section
- `QuickSearchModal.jsx` — ⌘K global search (stories/chars/cities/books/chapters)
- `AmbientBackground.jsx` — story background_url cross-fade layer
- `GoogleDriveModal.jsx` — backup status + trigger sync
- `ArtifactFormModal.jsx` — shared artifact create/edit modal
- `CharacterPicker.jsx` — shared dropdown character selector (searchable, image
  thumbnails, single- or multi-select); reused for POV/arc/persona/scope pickers
- `AIPanel.jsx` — ⌘⇧A right-drawer: per-tab skill cards, run/cancel, config,
  image picker, per-run "Focus on:" scope override
- `ExplorerPanel.jsx` — global bottom-right compass widget + quick-access bar

### Module views
- `HomeView.jsx` — Home page: all-stories gallery, tags, New Story
- `DashboardView.jsx` — Per-story dashboard: overview, fun-facts, theme, memorable quotes
- `WorldbuildingView.jsx` — Tabbed: cities/mechanics/factions/artifacts/glossary/gallery
- `CharacterRosterView.jsx` — Roster, gallery, artifacts, mechanics (linked powers via
  `mechanic_ids`), appearances, timeline, relationships. Landing view: selection grid + a
  horizontal "Explore the cast" title-card strip (first cell = Add Character). Detail view:
  compact circled-portrait header, horizontal tab bar (Notes default, then Summary), and a
  **Summary** tab (stats grid + Story Presence blurb + Worldweb cross-links)
- `CharacterMapView.jsx` — Force-directed relationship graph (react-force-graph-2d);
  clickable edges, strength filter, hide-isolated, declared relationship labels on edges
- `BookOutlinerView.jsx` — Book/chapter tree, plot beats, arcs, POV tracker,
  per-chapter word-count target + progress bar, Find & Replace modal,
  "Chapter Judge" sub-tab, `@` entity references
- `QuotesView.jsx` — Standalone quotes (text + note + tags) tab
- `DraftEditorView.jsx` — Markdown + Google Docs dual mode, autosave; publishes
  `loresmith:editor-context` window event when a chapter loads
- `SkillStudioView.jsx` — Skill Studio: custom skill CRUD with Simple/Advanced
  progressive toggle, router preview, entity focus picker, test-run
- `EntityFocusPicker.jsx` — shared entity/focus picker for routing_sources
- `CreatorPipelineView.jsx` — Creator Pipeline wizard stepper

### Entity references (`entityRef/`)
- `entityRef.js` — token parsing/building helpers (`[[type:id|label]]`)
- `EntityReference.jsx` — bold + hover tooltip renderer; `withEntityReferences`;
  `EntityReferenceText`
- `EntityMentionPicker.jsx` — `useEntityMention` hook: `@` type→entity dropdown
  (portal near caret, keyboard nav) + insert token
