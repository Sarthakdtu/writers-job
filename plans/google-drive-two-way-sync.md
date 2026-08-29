# Two-Way Google Drive Sync (Export + Import)

## Status

**Design / planning only — not implemented.** This plan is the second half of
[google-drive-sync.md](google-drive-sync.md): that doc covers auth + **export**
(mirror local → Drive, chapters → native Google Docs). This doc adds the reverse
direction — **import/restore** — and the amendments export needs for it to be safe
and bidirectional. Implement export first (phases 1–4 of the other doc), then the
phases below.

### The asymmetry we must design for
- **Export** is additive and low-risk: local is the source of truth, Drive is a mirror.
- **Import** is destructive-by-default: Drive data overwrites local files. So import
  must be *read-only until confirmed*, *validated*, and *dry-runnable*. Two distinct
  user intentions exist:
  1. **Restore** — recover into an empty/new machine or after data loss. Drive wins, wholesale.
  2. **Pull back edits** — user edited prose in the embedded Google Docs pane; they want
     those doc revisions merged down into local `.md`. Per-chapter, doc-newer-wins.

  Both are import, but they have different conflict policies. The UI should surface
  them as distinct actions.

---

## Key design decisions

1. **Drive folders are IDs, not paths.** There is no user-visible "path" in Drive. The
   "path" the user gives is either a folder **ID/URL** pasted into the modal, or — better —
   a friendly picker using Google's Drive Picker (v2) to let them click the folder. We
   store/accept both: parse `https://drive.google.com/drive/folders/<ID>` URLs too.
2. **The backup must be self-contained.** Today's export plan mirrors JSON + assets and
   converts prose to Docs. For import to work without reverse-conversion complexity, the
   backup must also contain the **raw `.md` files**, and the local manifest must be
   included **inside the Drive folder** so a fresh machine can locate it. Amendment to
   the export layout:

   ```
   LoreSmith Backups/<slug>/
   ├── mirror/            # byte-exact copy of data/stories/<slug> (json, md, assets)
   ├── docs/              # native Google Docs for chapter prose (editing convenience)
   └── manifest.json      # relative_path -> {file_id|doc_id, md5, mtime, size}
   ```
   `manifest.json` is the import index; `mirror/` is the import payload; `docs/` is
   only consulted for "pull back edits".
3. **Import never trusts Drive filenames/paths.** Every relative path from the manifest
   is re-validated with the same traversal guard used in `ai/io.py` (`..` ban, allowed
   extensions). All JSON is validated through the existing Pydantic schemas before any
   local write; rejects go to a quarantine dir, never abort the whole import.
4. **Default import mode = restore-as-new.** If the story slug already exists locally,
   import with a suffixed slug (`<slug>-restored`) instead of clobbering. Overwrite is
   opt-in with a pre-import local snapshot.
5. **"Pull back edits" is doc-newer-wins per chapter.** Compare Drive doc
   `modifiedTime` vs local `.md` mtime; export doc → markdown (`drive.files.export`,
   `text/markdown`) and replace only newer ones. The raw `.md` in `mirror/` stays the
   fallback truth if a doc is older or missing.

---

## Import workflow (user-facing)

1. User opens Drive modal → **Import tab**.
2. Provides folder: paste folder URL/ID *or* click **Browse** (Drive Picker v2 popup).
3. `GET /api/backup/import/preview?folder_id=<id>` returns (read-only, no Drive writes):
   - `{ status, stories: [ { slug, title, last_sync, file_count, total_bytes,
       exists_locally, local_last_modified } ], doc_pullbacks_available }`.
   - One request per candidate story folder found under the chosen root.
4. User picks how to handle each story: **Restore as new** (default), **Overwrite**,
   or **Pull back doc edits only**. Can run `dry_run=true` first to see exact planned
   operations (per-file: create / update / skip / delete).
5. `POST /api/backup/import` `{ folder_id, story_ids, mode, dry_run }` executes via the
   atomic `file_utils` helpers, then refreshes the story list server-side and updates
   `_backup_status` (`last_import_time`, `imported_stories`, error).

---

## Backend

### New module surface (`backend/app/google_drive.py`, extends export service)
- `scan_backup_tree(folder_id)` → parse `manifest.json`, enumerate `mirror/` files,
  build a candidate list for preview.
- `import_story(service, slug, mode, dry_run)`:
  1. ensure local structure via `FileManager.ensure_story_structure(slug)`;
  2. for each manifest entry in `mirror/`, stream download, **Pydantic-validate** JSON
     by type (Story, Character, City, Faction, Artifact, GlossaryTerm, GalleryItem,
     Book, Chapter, Plot, CharacterArc), then `write_*_safe` atomically;
  3. binary assets → local `assets/` via `write_bytes_safe`-style helper (respect
     uuid-prefixed filenames);
  4. after restore, call `FileManager.sync_story_backgrounds(slug)` so
     `background_images`/`background_url` recompute from imported gallery/character data;
  5. mode `pull_edits`: for each chapter with a `docs/` entry newer than local `.md`,
     `drive.files.export` → markdown → `FileManager.save_chapter_prose`.
- `dry_run` collects a plan object `{ create: [], update: [], delete: [], skip: [] }`
  without writing.

### Path → type routing for validation
| Mirror path                        | Pydantic model          |
|------------------------------------|-------------------------|
| `story.json`                       | `Story`                 |
| `characters/<id>.json`             | `Character`             |
| `world/cities.json`                | `List[City]`            |
| `world/mechanics.json`             | `WorldMechanics` (object!) |
| `world/factions.json`              | `List[Faction]`         |
| `world/artifacts.json`             | `List[Artifact]`        |
| `world/glossary.json`              | `List[GlossaryTerm]`    |
| `world/gallery.json`               | `List[GalleryItem]`     |
| `books/book-*/book.json`           | `Book`                  |
| `books/book-*/plot.json`           | `Plot`                  |
| `books/book-*/character_arcs.json` | `List[CharacterArc]`    |
| `books/book-*/chapters/ch-*.json`  | `Chapter`               |
| `books/book-*/chapters/ch-*.md`    | raw text                |
| `assets/*`                         | binary                  |

Rule: a group entity fails if any member fails to validate → whole file quarantined to
`data/stories/_quarantine/<import-ts>/…`, remaining files proceed, and the summary lists
rejections.

### Load-bearing invariants to respect
- `mechanics.json` is an object, not a list (AGENTS.md §3.2).
- Chapter = two files (`.json` + `.md`), same `ch-<id>` base — import must restore both,
  then re-derive `word_count` via `save_chapter`/`save_chapter_prose`.
- All writes go through `file_utils` atomic helpers — no raw `open()`.
- `_backup_status` keys stay stable; add `connected`, `account_email`,
  `last_import_time`, `imported_stories`.

### New endpoints (`backend/app/main.py`)
- `GET /api/backup/import/preview?folder_id=` → preview object (401 if not connected).
- `POST /api/backup/import` `{ folder_id, story_ids[], mode, dry_run }` →
  plan-or-result summary. `418`-ish domain error object, not raw 500.
- `GET /api/backup/status` extended (above).
- `POST /api/backup/disconnect` (from the export plan) also clears import cache.

---

## Frontend (`GoogleDriveModal.jsx`, minor `Navbar.jsx`/`StoryContext.jsx`)

- Modal becomes two tabs: **Backup** (export, per existing plan) and **Restore**.
- Restore tab:
  - folder field (paste URL/ID) + **Browse folders** picker (Drive Picker v2 script
    loaded on demand; `<script src="https://apis.google.com/js/api.js">`).
  - preview table: per-story slug/title/last_sync/file counts/total size, badge
    NEW / EXISTS / CHANGED.
  - per-story mode select: `restore_as_new` (default), `overwrite`, `pull_doc_edits`.
  - **Dry run** button → shows planned op counts. **Import** button → confirm modal
    (destructive copy warning when overwrite selected).
  - progress row driven by `_backup_status`; result toast with counts + quarantine notes.
- After success: `StoryContext.fetchStories()` must run so the imported stories appear
  in the Navbar selector immediately.
- `Navbar` badge extends to `Not Connected` / `In Sync` / `Needs Sync` / `Import Available`.

---

## Config / security / scope

- `GOOGLE_DRIVE_ROOT` reused (default `LoreSmith Backups`).
- **Scope:** keep `drive.file` for export. Drive Picker + reading folders not created by
  the app need `https://www.googleapis.com/auth/drive.readonly` (or Picker's dedicated
  scope). Plan: add `drive.readonly` to the OAuth scope list so import can both read
  generated backups and let the user pick arbitrary backup folders — the refresh token is
  therefore slightly stronger, so keep the chmod-0600 + no-logging rules from the export
  plan.
- Import untrusted input path: manifest relative paths → traversal guard; JSON → schema
  validation; docs `export` output → treated as plain markdown, never executed.
- Imported Google Doc content may contain scripts/none; treat all doc text as inert data.

---

## Rollout phases

| Phase | Scope | Verify |
|-------|-------|--------|
| **I** | Manifest nested inside Drive folder; export also mirrors raw `.md` (amend export plan). | A fresh export folder can fully re-create the story tree from `mirror/` + `manifest.json` alone. |
| **II** | `scan_backup_tree` + `GET /import/preview` (read-only Drive scan + Pydantic validate). | Give a bogus folder id → clean 400; valid folder → accurate preview, no local writes. |
| **III** | `import_story` (restore_as_new + overwrite + quarantine + `sync_story_backgrounds`). | Restore into new/empty machine; a corrupt JSON is quarantined, rest imports. |
| **IV** | `pull_doc_edits` mode (doc `modifiedTime` > `.md` mtime → export-doc → markdown → save). | Edit in embedded Docs pane, import, local `.md` reflects the edit; unedited chapters skipped. |
| **V** | Frontend Restore tab, picker, dry-run + confirm, fetchStories refresh, Navbar badge. | End-to-end: pick folder → preview → dry run → import → story appears + opens. |

Cut scope: no deep JSON merge (whole-file wins; docs quoted as the only merge vector),
no scheduled/auto import, no remote two-machine conflict resolution beyond mtime/Hash
comparison.

---

## Decisions / gotchas (add to export doc's list)
- Drive `files.list` pagination (`nextPageToken`) — don't assume a single page.
- Server-side token storage means import preview runs on the server; if multiple users
  share a machine, this stays single-tenant as today.
- `drive.files.export` to `text/markdown`: tables/images degrade → keep the mirrored raw
  `.md` as authoritative; never let doc export delete a local `.md`.
- Hash for change detection: local `md5` vs Drive `md5Checksum` (`quotaBytesUsed`) —
  size-only compares are not enough.
- Story slug collisions on restore: never overwrite an existing dir implicitly; always
  suffix (`-restored-<n>`).