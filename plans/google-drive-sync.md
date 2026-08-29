# Real Google Drive Sync + Google Docs Conversion

## Status

**Diagnosed:** drive sync is currently a *simulation*, not a real integration.
This plan replaces it with a working, idempotent backup that mirrors local data to
Google Drive and converts chapter prose to native Google Docs.

### Chosen approach: OAuth, but zero token juggling by the user
Google's Drive API requires auth on every call — no token-free path exists (Drive
doesn't even allow bare API keys). We keep OAuth but make it effectively invisible:
the user clicks **Connect to Google Drive** once, consents in the browser for ~2
minutes, and from then on the app stores a refresh token locally on the server and
auto-refreshes it on every call. No codes to copy, no token files to manage by hand,
no re-auth unless the user revokes access in their Google account.

### Why the current sync "does nothing"
1. `POST /api/backup/google-drive` (`backend/app/main.py`) never authenticates, never
   uploads, never creates Docs. It only walks local dirs, counts `.json`/`.md`/asset
   files, sets a module-level `_backup_status`, and returns a fake "success".
2. `GET /api/auth/google` returns an auth URL whose `redirect_uri` points to
   `/api/auth/google/callback` — a route that **does not exist**.
3. No `client_secret.json` is present, so the endpoint returns the "Local developer
   mode" fallback and never produces credentials.
4. There is no token storage, no credential refresh, no Drive service, no
   folder-manifest (so re-sync would duplicate everything), and no code that writes a
   `google_doc_id` back to chapters for the embedded Docs editor.
5. Frontend (`GoogleDriveModal.jsx`, `Navbar.jsx`) never calls `/api/auth/google`; the
   Navbar "In Sync" badge is hardcoded.

### Goal
- One-click "Connect to Google Drive" OAuth in the app.
- Real, idempotent mirror of the whole `data/stories/` tree into a `LoreSmith Backups`
  Drive folder.
- Per data type:
  - **Chapter prose (`.md`)** → native Google Doc, editable in the app's embedded
    Google Docs iframe (`Chapter.google_doc_id`).
  - **Structured data (`.json`)** → mirrored as `.json` files (source of truth).
  - **Assets (images, txt)** → mirrored as binary files.
  - **(Optional)** human-readable overview Doc per dataset (characters/world/plot).

---

## Architecture

### New backend module: `backend/app/google_drive.py`
`GoogleDriveBackupService` class, instantiated once in `main.py` (parallel to
`FileManager`). Responsibilities:

- **Auth**: full OAuth2 via `google_auth_oauthlib`, simplified to a single
  Connect-and-forget action:
  - `start_auth()` → one-time authorization URL (scopes: `drive.file` — only files
    the app creates).
  - `handle_callback(code, state)` → exchanges code, stores the refresh token
    automatically.
  - `get_service()` → lazy service builder; **silently refreshes** the access token
    via the stored refresh token whenever it's close to expiry. The user never sees,
    copies, or manages tokens.
  - `disconnect()` → revoke + delete stored token (only used if the user want to
    re-link to a different account).
- **Credential storage**: token JSON written to git-ignored
  `<base_data_dir>/.credentials/` (e.g. `data/.credentials/google_token.json`).
  `client_secret.json` stays out of git (already the convention).
- **Drive tree**: root folder `LoreSmith Backups/<story-slug>/` with subfolders:
  - `data/` — mirrored `*.json` (keeps relative path)
  - `prose/` — Google Docs per chapter (and per book overview)
  - `assets/` — mirrored binary assets
- **Idempotency**: per-story sync manifest stored at
  `data/stories/<slug>/.loresmith-sync.json` (git-ignored) mapping
  `relative_path -> { drive_file_id | doc_id, etag, sync_ts }`. On re-sync, update in
  place instead of re-creating. Deleted local files → delete Drive files.
- **Sync algorithm** (per story):
  1. ensure root + subfolders exist (cached ids in manifest).
  2. walk `data/stories/<slug>`; for each file, route by type (see table below);
     upsert if content changed (compare local mtime/size or Drive `modifiedTime`).
  3. for chapter `.md`, create/update a Google Doc: on create, `files.create` with
     `mimeType=application/vnd.google-apps.document` + content upload; on update,
     push markdown via `documents.batchUpdate` (or `UpdateDocument` of content). Then
     write the doc id into the chapter's `google_doc_id` in `chapters/ch-<id>.json`
     via `FileManager.save_chapter` (keeps derived `word_count` intact).
  4. record manifest + update `_backup_status`.

### Data-type → destination mapping

| Data type                       | Local path                 | Drive destination            | Format                           |
|---------------------------------|----------------------------|------------------------------|----------------------------------|
| Chapter prose                   | `books/b-*/chapters/*.md`  | `prose/` → Google Doc        | Native Google Doc (editable)     |
| Chapter metadata                | `chapters/*.json`          | `data/` mirror               | JSON file                        |
| Book / plot / arcs              | `books/b-*/*.json`         | `data/` mirror               | JSON file                        |
| Characters                      | `characters/*.json`        | `data/` mirror               | JSON file                        |
| World sections                  | `world/*.json`             | `data/` mirror               | JSON file                        |
| Story config                    | `story.json`               | `data/` mirror               | JSON file                        |
| Image/text assets               | `assets/*`                 | `assets/` mirror             | Binary file                      |
| (Optional) overviews            | generated                  | top-level `*.docx→Doc`       | Google Doc per dataset           |

### API changes (`backend/app/main.py`)
- `GET /api/auth/google` → return `{ status, auth_url, state }` (real URL or
  `{ status: "configured"|"missing_client" }`).
- `GET /api/auth/google/callback?code=&state=` → exchange + store token, then serve a
  tiny HTML page that auto-closes the popup. The modal polls `/api/backup/status`
  until `connected=true`. No copy-paste of codes.
- `GET /api/backup/status` → extend shape with `connected: bool`, `account_email`,
  `last_sync_time`, `total_files_synced`, `documents_created`, `error_message`.
- `POST /api/backup/google-drive?story_id=<id>` → real sync. 401/409 if not connected
  (frontend shows "Connect" CTA instead of fake progress).
- `POST /api/backup/disconnect` → revoke token.
- Keep the existing `_backup_status` keys so the modal contract stays compatible.

### Frontend changes
- `GoogleDriveModal.jsx`:
  - On mount, hit `/api/auth/google` + `/api/backup/status`.
  - If not connected → **one** "Connect to Google Drive" button that opens `auth_url`
    in a popup. The popup closes itself on success; the modal polls
    `/api/backup/status` until `connected=true` and shows the linked account email.
  - If connected → "Sync" button, per-type summary after sync (files mirrored, docs
    created), error state with retry.
- `Navbar.jsx`: dynamic badge — "In Sync" / "Needs Sync" / "Not Connected" from
  `/api/backup/status` (drop hardcoded static badge).
- `DraftEditorView.jsx`: after a successful sync, refresh `google_doc_id` for the
  open chapter (it will be populated by the sync) so the embedded Docs pane works.

### Config / env
- `GOOGLE_CLIENT_SECRET_PATH` (default `client_secret.json`) — reused as-is.
- New optional `GOOGLE_DRIVE_ROOT` folder name (default `LoreSmith Backups`).
- Token path derived from `DATA_DIR`; both are outside git.

### Prerequisites (documented in run-then-plan)
1. Create a Google Cloud OAuth **Desktop app** client in Google Cloud Console,
   download `client_secret.json` to repo root (git-ignored) or set
   `GOOGLE_CLIENT_SECRET_PATH`.
2. Add the redirect URI `http://localhost:8000/api/auth/google/callback` to the
   client's authorized redirect URIs.
3. First run: user clicks Connect once and approves consent (~2 min). After that the
   refresh token lives in `data/.credentials/`, auto-refreshes on every sync, and the
   user never handles tokens again.

### Security
- Scope stays `drive.file` (only app-created files visible).
- Never log tokens; token file chmod 0600; `client_secret.json` & token git-ignored.
- Re-auth prompt on revoked/expired refresh token → surfaced as status, not crash.

---

## Implementation phasing

### Phase 1 — Auth foundation
- Add `google_drive.py` with credential load/save/refresh + service builder.
- Implement `/api/auth/google` (real), `/api/auth/google/callback`,
  `/api/backup/disconnect`, extend `/api/backup/status` with `connected`/`account_email`.
- **Verify:** browser flow completes; status shows connected account; token persisted;
  restart keeps session.

### Phase 2 — JSON + asset mirroring
- Drive folder scaffolding + manifest + upsert/delete logic.
- Mirror all non-`.md` files under a story into `data/` + `assets/`.
- **Verify:** run sync twice → file counts stable (no duplicates); edit a JSON → only
  changed file updates.

### Phase 3 — Chapter ⇒ Google Doc conversion
- Create/update/delete Google Docs for `chapters/*.md`; push content; write
  `google_doc_id` back to chapter JSON.
- **Verify:** open the generated doc link; open the app's embedded GDocs iframe; then
  pull the doc back (docs `export`) and confirm content round-trips.

### Phase 4 — Frontend wiring
- DriveModal connect/sync/disconnect; Navbar dynamic badge; DraftEditor refresh of
  `google_doc_id`.
- **Verify:** end-to-end from a fresh story → connect → sync → open doc in app.

*(Optional Phase 5: human-readable overview Docs per dataset.)*

---

## Decisions / gotchas
- Use `drive.file` scope; do **not** request full Drive access.
- Store each story manifest in its own story dir so moving a story moves its mapping.
- Google Docs write path: on first creation use `files.create` with media; on update
  prefer `documents.batchUpdate` (preserves structure) and always re-derive the local
  `word_count` from local markdown (Drive word counts differ).
- Respect API quota: modest batching, retry with exponential backoff on 429/5xx.
- Keep `_backup_status` keys stable (`status|last_sync_time|total_files_synced|
  error_message`) — only add fields.
- Docs named `<Book N – Chapter Title>`; duplicate-safe via manifest lookup.