# Running the Project

## Backend (from repo root)

```bash
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Frontend (from repo root)

```bash
cd frontend && npm run dev
```

Open http://localhost:3000/ (Vite proxies `/api` → `:8000`).

## Frontend scripts (`frontend/package.json`)

`dev`, `build` (`vite build`), `lint` (`eslint .`), `preview`.

## PWA / installable app

The frontend is a Progressive Web App. The production build (`vite build`) emits
`manifest.webmanifest`, `sw.js`, and `registerSW.js` (via `vite-plugin-pwa`). Opening
http://localhost:3000 lets you install it like a desktop app (Chrome/Edge show an "Install"
prompt; the Navbar's Install button triggers it via `beforeinstallprompt`, captured in
`hooks/usePwaInstallPrompt.js`). On iOS/Safari use "Add to Home Screen". When installed
it runs `standalone` (no browser chrome). The service worker is **network-only for `/api/*`**
(data lives on the local backend), so the app shell works offline but data operations need
the backend running.

### PWA gotchas

- `devOptions.enabled` is **false** — the service worker only runs in the **production
  build/preview**, never in `npm run dev`.
- `usePwaInstallPrompt` unregisters any pre-existing service worker + clears caches when
  running in `import.meta.env.DEV`, so leftover dev SWs from older builds self-clean.
- If a browser is already stuck on a white screen from a stale SW, unregister from
  DevTools → Application → Service Workers, then reload.

## Testing

There is currently **no automated test suite** in the repo. "Verification" means:
run the backend + frontend and manually exercise affected features, and run
`npm run lint` / `npm run build` in `frontend/` after frontend changes.

---

# Backup & Google Drive Integration

## Backup specifics

- `Navbar.jsx` shows a static "In Sync" badge; real status only updates inside
  `GoogleDriveModal` by polling `GET /api/backup/status`.
- `_backup_status` is in-memory (backend) — it resets on restart.

## Google Drive backup service (`google_drive_backup.py`)

- `GoogleDriveBackupService(auth_service, base_data_dir)` — uploads story dirs to the
  connected account's Drive using `auth_service.get_drive_service()`.
- Key methods: `sync_all_or_story(story_slug, available_slugs)` → `{stories_backed_up,
  files_synced}`; `sync_story(service, story_slug)` syncs one story (uploads new/changed
  files, deletes removed ones); `save_sync_time`/`load_last_sync_time` persist the last sync
  time across restarts. Restore: `preview_restore()` (per-story conflict classification) and
  `restore_all(choice)` (`'drive'`/`'local'`).
- Root folder name: `ROOT_FOLDER_NAME = "LoreSmith"`. Skips `.tmp` files. Sync does **not**
  convert Markdown to Google Docs.

## Backup routes

- `GET /api/auth/google` — OAuth flow init
- `GET /api/backup/status` — returns in-memory `_backup_status` dict (initialized from
  persisted backup state, so `last_sync_time` survives restarts)
- `POST /api/backup/google-drive?story_id=` — real recursive Drive backup
- `GET /api/backup/restore/preview` — conflict classification report
- `POST /api/backup/restore` — restore all stories from Drive (body `{choice}`)

## Backup note

`POST /api/backup/google-drive` performs a **real upload** to the connected account's Drive.
`GoogleDriveBackupService` places all stories under a top-level `LoreSmith` folder, one
subfolder per story slug. Sync is **idempotent** — each local file's relative path maps to
a Drive file id in a per-story manifest, so re-syncing updates in place (no duplicates) and
files removed locally are deleted from Drive. Backup state is persisted in
`data/stories/.credentials/backup/state.json`.

## Restore note

`GET /api/backup/restore/preview` classifies every tracked file as
`in_sync`/`conflicts`/`remote_only`/`local_only` (md5 vs Drive md5Checksum). `POST
/api/backup/restore` with body `{choice: 'drive'|'local'}` restores across **all stories**;
the choice applies to every conflicting file. `'drive'` overwrites local with the Drive
version and preserves each overwritten local file under `data/stories/.restore-backup/<slug>/`
(cleared at the start of each restore). Remote-only files are always created; local-only files
are never deleted.

## Google Docs integration

- Google Docs editing uses a chapter's `google_doc_id` (or book's `google_doc_url`) with
  iframes / `docs.google.com/document/d/<id>/edit?embedded=true`.
- Telegram (in `plans/telegram-integration.md`) is **not implemented** — do not reference it
  as existing functionality.
