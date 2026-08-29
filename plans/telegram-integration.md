# Telegram Integration Plan

**Status:** Draft / Design only (no code written)
**Built for:** Local-first Fiction Writer Suite (FastAPI + React, file-system storage)
**Integration direction:** Bot → App (writes into stories)
**Connection method:** Webhook + tunnel/hosting (per decision)
**MVP feature:** Quick-capture notes from phone → saved into a story

---

## 1. Goals & Scope

### MVP (this plan)
- A Telegram bot that lets you send a short text note from your phone and saves it to a
  story as a quick-capture note.
- Frontend "Telegram Inbox" surface so captured notes show up in the app.
- Status badge in the Navbar indicating whether the bot is linked/online.

### Later (out of scope for MVP, noted for future)
- `add character` and `log timeline event` chat commands.
- Bot-to-app push notifications (save/sync/word-count alerts).
- Retrieval commands (read outlines / bios on demand).

---

## 2. Architecture

```
Telegram ──HTTPS POST──► [Tunnel: ngrok/cloudflared] ──► FastAPI
                                                          │  /api/telegram/webhook
                                                          ▼
                                                    FileManager (existing)
                                                          ▼
                                     data/stories/[slug]/inbox/quick_notes.md
```

**Decisions**
- **Webhook** (not long-polling): Telegram pushes `Update`s to our public URL. We register
  the webhook once via `setWebhook`. Requires a public URL → use a tunnel locally
  (`ngrok http 8000` or `cloudflared tunnel`) or host the backend.
- **Reuse `FileManager` + `file_utils`**: bot actions write through the same atomic,
  thread-safe storage layer that the API already uses — no new storage path/logic.
- **Config via env vars**, mirroring the existing `GOOGLE_CLIENT_SECRET_PATH` pattern.

### Storage target (new, minimal)
Each story gets an inbox file the bot appends to:
```
data/stories/[story-slug]/inbox/quick_notes.md
```
One lightweight `FileManager` method appends notes; the existing
`file_utils.write_*_safe` handles locking/atomic writes.

---

## 3. Backend changes (`backend/app/`)

### 3.1 Config
Read from env in a small helper (pattern already used in `main.py`):
- `TELEGRAM_BOT_TOKEN` (required)
- `TELEGRAM_WEBHOOK_SECRET` (optional signing secret to filter Telegram requests)
- `TELEGRAM_DEFAULT_CHAT_ID` (optional fallback; MVP can accept any message but we
  restrict to known chat ids to avoid bots creating files in wrong stories)

### 3.2 New module `app/telegram_bot.py`
- Thin wrapper around the Bot API using the already-present `httpx` dependency.
  No need for a heavyweight `python-telegram-bot` dependency.
- Functions:
  - `set_webhook(url)` / `delete_webhook()` — register the tunnel URL.
  - `send_message(chat_id, text)` — confirmations back to the sender.
  - `handle_update(update)` — parse `message.text`, dispatch to handlers.
- Command/router:
  - `/start`, `/help` — show usage.
  - `/story <name>` — select a story for subsequent captures (persist selection in a
    small `data/telegram_state.json` or in-memory).
  - **bare text (MVP):** append message to the selected story's
    `inbox/quick_notes.md` with a timestamp; reply "Saved ✓".
- Whitelist check: only process messages from `TELEGRAM_DEFAULT_CHAT_ID` (or a
  configured allowlist) to prevent abuse.

### 3.3 New routes in `app/main.py`
- `GET /api/telegram/status` → `{ configured, webhook_url, last_update }`.
- `POST /api/telegram/webhook` → receives Telegram `Update` JSON → `telegram_bot.handle_update(...)`.
- `GET /api/stories/{story_id}/inbox` → reads back `quick_notes.md` for the frontend panel.

### 3.4 FileManager addition
- `append_quick_note(story_slug, text) -> str` — writes `[YYYY-MM-DD HH:MM] text` to
  `inbox/quick_notes.md` using the atomic `write_text_safe` / lock helpers.

---

## 4. Frontend changes (`frontend/src/`)

### 4.1 Telegram status badge (Navbar)
Mirror the existing Google Drive backup badge already in `Navbar.jsx`:
- Poll `GET /api/telegram/status`.
- Show "Telegram: Online/Offline" + a link that opens `t.me/<bot_username>` to start a chat.

### 4.2 Telegram Inbox view / panel
- In the Dashboard (or a lightweight modal) load `GET /api/stories/{story_id}/inbox`.
- Display the note list; a "Copy" or "Move to Editor" shortcut can come later.

---

## 5. Setup / run sequence for the developer

1. Create a bot via **@BotFather** in Telegram → get `TELEGRAM_BOT_TOKEN`.
2. Export env vars:
   ```bash
   export TELEGRAM_BOT_TOKEN="<token>"
   export TELEGRAM_DEFAULT_CHAT_ID="<your-chat-id>"
   ```
3. Start the tunnel:
   ```bash
   ngrok http 8000
   # note the https URL, e.g. https://abcd-ngrok.app
   ```
4. Start backend as usual:
   ```bash
   PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
5. Call `setWebhook` on startup (or via a manual `POST /api/telegram/webhook/set`) with
   `https://abcd-ngrok.app/api/telegram/webhook`.
6. Open the frontend, pick a story, and message the bot: bot saves to that story's
   `quick_notes.md`. Frontend Inbox reflects it.

---

## 6. Security & robustness notes
- Whitelist chat ids (never process arbitrary users' messages into your files).
- Use the Telegram-issued `secret_token` header on the webhook route to reject
  non-Telegram requests.
- Tunnel URL changes every new `ngrok` run → re-register webhook on each startup
  (idempotent).
- Keep the message-handling path async and non-blocking so webhook acks quickly.

---

## 7. Dependencies
- **No new backend dependency required** — use existing `httpx`.
  (Optional: `python-telegram-bot` if a full-featured bot framework is preferred later.)
- No new frontend dependency.
- Developer tooling: `ngrok` or `cloudflared` (not a runtime dep).

---

## 8. Suggested implementation order
1. `FileManager.append_quick_note()` + `inbox/` directory creation.
2. `telegram_bot.py` wrapper + `/api/telegram/webhook` route + `setWebhook` helper.
3. Path through to quick-note save; reply "Saved ✓".
4. `GET /api/stories/{story_id}/inbox` route.
5. Frontend Navbar status badge + Inbox panel.
6. Harden: chat-id allowlist, secret token, error handling.
7. (Later) `add character` / `log event` / retrieval / push notifications.
