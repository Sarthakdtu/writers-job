# Frontend ↔ Backend Contract

The frontend calls relative `/api/...` URLs (proxied by Vite to `:8000`).

## Common patterns

- **Active story** is `activeStory.id` (the slug) — every data call uses it in the URL.
- **Chapters:** to load prose, call
  `GET /api/stories/{story}/books/{book}/chapters/{ch}/content` → `{ content }`.
- **Autosave:** `DraftEditorView` markdown mode renders prose as **stacked, note-style
  blocks** (split from the flat `.md` content on `\n\n`). Each block is a card with
  move-up/move-down/edit/delete; an "Add Block" composer appends new blocks; editing a
  block uses an inline textarea with explicit **Save Block** (notes-style, no per-keystroke
  autosave). Saving flattens the blocks (`\n\n` join) and PUTs `{ content }` to
  `/content`. Track `saveState` (`saved|unsaved|saving`).
- **Assets:** upload via `FormData` (`file` field) to `/assets/upload`; the returned
  `{ url }` is an `/api/stories/{story}/assets/{file}` path used directly in `<img>`.
  `DELETE /api/stories/{id}/assets/{filename}` removes a stored asset file.
- **Characters are saved via `POST /api/stories/{id}/characters`** (upsert) — the frontend
  uses POST both to create and update (not PUT) in `CharacterRosterView`/`WorldbuildingView`.
- **Plot & arcs are saved via `POST .../plot` and `POST .../arcs`** (upsert, full array).
- **Find & Replace:** `POST /api/stories/{story}/find-replace` with
  `{ find, replace, case_sensitive, whole_word, dry_run }` → `{ count, replacements[] }`
  (Book Outliner modal: Preview → Replace All).
- **Appearances matrix** loads via
  `GET .../characters/{char_id}/appearances` → `{ books, chapters, plot_points }`.
- **Entity references:** fetch `GET /api/stories/{id}/references` → `List[EntityRefItem]`
  (flat, each with `type`). Attach `useEntityMention(refs).bind` (`onInput`/`onKeyDown`) to a
  prose/notes `<textarea>`/`<input>` and render `useEntityMention(refs).dropdown` once per
  view to get the `@` type→entity picker; inserting stores `[[type:id|label]]` in the text.
  To render references, wrap the `react-markdown` components with
  `withEntityReferences(components, refs)` (Markdown surfaces) or use
  `EntityReferenceText text={...} refs={refs}` (plain-text notes). References are plain text
  tokens, so AI context builders, imports, word counts, gdocs mode and backups are unaffected.
