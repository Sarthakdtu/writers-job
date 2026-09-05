# Mobile / PWA Migration Plan

## Status

**Design / planning only — not implemented.**

## The core question

> Can we dodge Android/native entirely and just use a PWA?

**Yes — the phone shell can be 100% PWA** (no native app, no Android SDK, no store
submission). The frontend is *already* a Vite PWA with a manifest + service worker (see
`docs/operations.md` → PWA section). The **real blocker is the backend**, not the shell:

- All data lives on the **local filesystem** (`data/stories/`) behind a **Python FastAPI
  backend** bound to `127.0.0.1:8000`.
- A phone cannot run that Python process — the storage is not present on the device and
  `file_utils`/`FileManager` assume a local POSIX filesystem.
- The service worker is `NetworkOnly` for `/api/*` — data is never cached, by design.

So the migration is: **keep the PWA shell, but move/abstract where the backend and its
data live.** The whole effort is deciding *where the backend runs* and *how the phone
reaches it*.

Three viable host strategies (pick one — they shape every later step):

| Strategy | Backend + data host | Phone reaches it via | Offline writing | Cost |
|----------|--------------------|---------------------|-----------------|------|
| **A. LAN/self-host remote** | A machine the user owns (desktop, NAS, Raspberry Pi, cloud VPS) | Wi-Fi/LAN or public HTTPS URL | ❌ (needs network) | Low |
| **B. Cloud-hosted backend** | A cloud VPS / PaaS (Fly, Railway, Render, DO) | Public HTTPS | ❌ | Medium + recurring cost |
| **C. On-device storage (IndexedDB)** | In the browser (remove backend dependency) | Nothing — all local to the phone | ✅ | High (rewrite data layer) |

> **Recommendation for a single user + a phone:** **Strategy A (LAN/self-host remote)**
> is the shortest path. It reuses ~100% of the existing backend and data on a machine the
> user already has; the phone PWA just points at the desktop's URL. Full offline-on-phone
> (Strategy C) is a large rewrite that only makes sense later if offline writing
> becomes a hard requirement.

---

## Guiding constraints (from the existing codebase)

1. **Never touch storage outside `file_utils`** — all file I/O goes through
   `read_json_safe`/`write_json_safe`/etc. Any cloud work must preserve this layer, not
   bypass it.
2. **API is REST over `/api/*`** — the frontend never assumes `localhost` (it uses the Vite
   proxy in dev only). Points to external URLs are already workable via config.
3. **AI is local Ollama** (`backend/app/ai/`) — not available on a phone. It must be
   hosted on the same machine as the backend, or excluded on mobile.
4. **Google Drive backup already exists** — this is the *only* existing cross-device
   transport. Mobile reads the same Drive folder as desktop write; a strong fallback sync
   channel and the basis for Strategy C's sync layer.
5. **Frontend is already a PWA** — icons, manifest, `display: standalone` done. No rework
   needed there for installability.

---

## Phase 1 — Make the backend reachable (Strategy A/LAN)

**Goal:** serve the existing backend + frontend from one co-located HTTPS endpoint so a
phone browser can reach it; verify nothing is hardcoded to `localhost`.

1. **Config the API base URL in the frontend.**
   - Introduce a runtime `VITE_API_BASE` (or a config file the PWA reads) so the API client
     targets `http://<desktop-ip>:<port>/api` instead of the dev-proxy `/api`.
   - Audit `frontend/src/` for any hardcoded `localhost:8000` / `/api` wiring (grep
     `8000`, `localhost`, `127.0.0.1`). Service worker `/api` rules are already relative —
     confirm they match a same-origin deploy.
   - Update the PWA `start_url`/`scope` if served from a subpath.

2. **Co-locate & serve the built frontend from FastAPI.**
   - `vite build` produces `dist/`; mount it in `main.py` as StaticFiles + an SPA fallback
     for the PWA routes, now that it's served from the same origin as `/api`.
   - Result: ONE port serves the app shell + API (matches service-worker same-origin caches).

3. **Static file / asset uploads on mobile.**
   - Asset upload (`POST .../assets/upload`) already streams multipart — verify it works
     over a slower phone link (SCA 47 regarding thumbnailing/size if needed; not a blocker).

4. **CORS + host binding.**
   - FastAPI currently binds `127.0.0.1`. Add an env-driven host (`0.0.0.0`) + a proper CORS
     allow-list so the phone origin can call the API. Enable HTTPS for the phone (self-signed
     cert warning or a `mkcert`-style local CA, or a Cloudflare Tunnel / reverse proxy like
     Caddy for `https://` + valid cert from a subdomain).

**Acceptance:** a phone on the same Wi-Fi opens `https://loresmith.local`, installs it as a
PWA, and reads/writes stories end-to-end. This is the *bulk* of the migration value.

---

## Phase 2 — Mobile UI hardening (pure frontend)

No backend change. These are usability passes specific to small screens/touch.

1. **Responsive layout sweep** — the modules currently assume wide viewports
   (`Navbar`/`Sidebar`/`MainLayout`, force-graph `CharacterMapView`, multi-pane
   `BookOutlinerView`, `DraftEditorView`). Introduce breakpoints: collapsible sidebar →
   drawer, stacked panes, full-width dashboards.
2. **Touch targets & gestures** — increase tap targets, replace hover-only interactions
   (e.g. the ExplorerPanel hover zone, which cannot work on touch — see `docs/frontend.md`
   `Universe Explorer`). Add an explicit open button for touch.
3. **`beforeinstallprompt` / iOS Add-to-Home-Screen** — already handled by
   `usePwaInstallPrompt`; verify copy and that it appears correctly on the LAN origin
   (PWA install requires HTTPS + service worker).
4. **Keyboard-dependent flows** — ⌘K / ⌘⇧F / Esc hotkeys (`StoryContext`) and the
   `@`-mention `EntityMentionPicker` use keyboard nav; ensure mobile on-screen equivalents
   exist (search icon, on-screen buttons).

**Acceptance:** every primary flow (browse library, open story, edit a chapter with
autosave, worldbuilding, character roster, backup) is usable from a phone-sized viewport.

---

## Phase 3 — Offline-first data (carry + sync)

Optional but recommended once Phase 1+2 ship. Current SW is `NetworkOnly` for API; a phone
that loses coverage goes blank.

1. **Add an offline cache layer in the service worker** for `GET` reads (`/api/...`), with
   `StaleWhileRevalidate`, so the app loads and shows last-known data offline.
2. **Queue mutating writes** (`PUT/POST/DELETE`) in the SW when offline (Background Sync or a
   simple outbox in `CacheStorage`/`IndexedDB`), replaying when connectivity returns.
   Guard against double-write/conflict — this is the hard part and must be designed (see
   the conflict-handling pattern already in `google_drive_backup.py` md5 checksums).
3. **Do NOT** attempt to move data files onto the device; keep source of truth on the
   backend host. Treat the phone cache strictly as a mirror.

**Acceptance:** phone open/edits a story on a dead network; changes queue and sync when
back online, without corrupting the canonical files.

---

## Phase 4 — Full on-device (Strategy C, optional / later)

Only pursue if offline-editing with **no** backing server is a hard requirement. This is a
rewrite, not a migration:

- Replace the FastAPI+filesystem layer with the browser's **IndexedDB** as the data store,
  and port `FileManager` semantics into a frontend store (per-story JSON blobs, chapter md).
- Migrate the Pydantic schema/validation layer to a frontend equivalent (Zod) and enforce
  the same shapes.
- Keep **Google Drive** as the cross-device sync transport (upload/restore already exists).
- AI features (Ollama, Google Docs embedded editor) either stay server-side or get dropped
  on mobile.

---

## Recommended path & sequencing

1. **Phase 1 (Strategy A)** — biggest value, least code: get the existing app on the phone.
   ~1-2 days.
2. **Phase 2** — responsive/touch pass. ~3-5 days spread across modules.
3. **Phase 3** — offline cache + write queue. ~2-4 days, needs a conflict design review.
4. **Phase 4** — only if offline-with-no-server becomes mandatory.

## Out of scope / explicitly avoided

- No native Android/iOS app, no Kotlin/Swift, no Capacitor/Cordova/React Native — the phone
  shell stays a PWA.
- No moving the data model off the filesystem for Phase 1-3.

## References

- `docs/operations.md` (PWA section, network-only `/api` note, `usePwaInstallPrompt`)
- `docs/frontend.md` (viewport-dependent modules — ExplorerPanel hover, Hotkeys)
- `docs/backend.md` (`file_utils` / `FileManager`, `127.0.0.1:8000`, asset upload)
- `vite.config.js` (PWA config, dev proxy, `NetworkOnly` runtime caching)
- `plans/google-drive-two-way-sync.md` (existing cross-device transport + conflict design)
