# LoreSmith — The Fiction Writer's Creative Suite

**Plan your world. Write your story. Never lose a word.**

LoreSmith is a powerful, local-first writing app built for fiction authors, worldbuilders, and storytellers. Manage characters, maps, timelines, plot arcs, and prose — all in one beautiful, distraction-free workspace. Your data lives on your machine. Your story stays yours.

---

## Why Writers Love LoreSmith

- **Worldbuilding Made Easy** — Build cities, magic systems, factions, artifacts, and a living glossary. Every detail links together.
- **Character Roster & Timeline** — Track every character with portraits, bios, timelines, and an appearances matrix that shows who shows up where.
- **Plot Outlining & Beat Sheets** — Organize books, chapters, and scenes. Map plot beats to characters. Track character arcs across your entire series.
- **Distraction-Free Writing** — Write in a clean Markdown editor with autosave, or switch to an embedded Google Docs mode. Your choice.
- **One-Click Google Drive Backup** — Sync your entire writing project to Google Drive with a single click. Restore anytime.
- **AI-Powered Tools** — Analyze characters, rewrite scenes, generate chapter art, and more — all running locally on your machine via Ollama. No cloud. No subscriptions.
- **Your Data, Your Machine** — 100% local storage. No database required. No internet needed to write. Your files are plain JSON and Markdown — portable and future-proof.

---

## Beautiful Themes for Every Mood

Choose from three literary themes designed to match your writing style:

- **Sepia Parchment** — Warm, classic paper feel for long-form prose sessions.
- **Midnight Ink** — Dark, immersive mode for late-night writing.
- **Typewriter Minimal** — Clean monochrome for focused, no-frills drafting.

---

## What's Inside

| Feature | What It Does |
|---|---|
| **Story Dashboard** | Overview of your story with summaries, fun facts, and custom banners. |
| **Worldbuilding Hub** | Cities, magic systems, factions, artifacts, glossary, and a concept art gallery. |
| **Character Roster** | Avatar cards, bios, timelines, linked powers, and an appearances matrix. |
| **Character Map** | Interactive relationship graph showing how characters connect across your story. |
| **Book Outliner** | Drag-and-drop chapter ordering, plot beats, character arcs, and a POV tracker. |
| **Writing Editor** | Markdown editor with block-based editing, perspective rewrite, and Google Docs mode. |
| **Quote Collector** | Save memorable lines and standalone quotes with tags and notes. |
| **Concept Art Gallery** | Upload and organize concept art with lore context and tags. |
| **Global Search** | Find any character, chapter, city, or book instantly with Cmd+K. |
| **Universe Explorer** | Quick-access widget showing your most-used entities and their key details. |
| **AI Skill Studio** | Create custom AI workflows, run built-in analysis pipelines, and generate chapter art. |
| **Google Drive Backup** | One-click sync to your Google Drive. Restore with conflict resolution. |

---

## Get Started in 2 Minutes

### What You Need

- **Python 3.10+** installed on your computer
- **Node.js 18+** installed on your computer
- A terminal (Command Prompt on Windows, Terminal on Mac)

### Step 1: Download & Install

```bash
# Clone the repository
git clone https://github.com/yourusername/writer_job.git
cd writer_job

# Install Python dependencies
python3 -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Launch LoreSmith

Open **two terminal windows**:

**Terminal 1 — Backend (the engine):**
```bash
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend (the app):**
```bash
cd frontend && npm run dev
```

### Step 3: Start Writing

Open your browser and go to **http://localhost:3000**

That's it. Create your first story and start building your world.

---

## Optional: Enable AI Features

LoreSmith works beautifully without AI. If you want the extra creative power:

1. Install [Ollama](https://ollama.com) on your machine (free, local AI engine).
2. Pull a model: `ollama pull qwen3.5:9b`
3. LoreSmith auto-detects it — no configuration needed.

AI features include character analysis, scene rewriting, plot suggestions, chapter illustration, and custom workflows you can build yourself.

---

## Optional: Enable Google Drive Backup

1. Set up a Google Cloud project and download your `client_secret.json` file.
2. Place it in the project root folder.
3. Click the Backup button in the app and connect your Google account.

Your entire writing project syncs to your personal Drive — one click, fully encrypted, fully yours.

---

## LoreSmith Is Perfect For

- **Novelists** managing multi-book series with sprawling casts and complex timelines.
- **Worldbuilders** crafting magic systems, factions, cities, and deep lore.
- **Screenwriters** organizing scenes, beats, and character arcs.
- **Tabletop RPG Game Masters** building campaign worlds and tracking NPC relationships.
- **Creative Writing Students** learning structure through hands-on outlining tools.
- **Any writer** who wants a beautiful, private, powerful workspace without subscriptions.

---

## Privacy & Ownership

Your writing never leaves your computer unless you choose to back it up. No cloud accounts required. No telemetry. No tracking. LoreSmith is open-source and built on the belief that your stories belong to you.

---

## Tech Stack (for the curious)

- **Frontend:** React 19, Vite 6, Tailwind CSS v4
- **Backend:** Python, FastAPI, Pydantic v2
- **Storage:** Local JSON + Markdown files (no database)
- **AI:** Local Ollama integration (optional)
- **Backup:** Google Drive OAuth2 (optional)

---

## Contributing

LoreSmith is open source. Contributions, issues, and feature requests are welcome.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
git commit -m "Add your feature"
git push origin feature/your-feature
```

Open a Pull Request and describe what you changed.

---

## License

MIT License — use it, modify it, ship it. Just don't blame us if you write a bestseller.

---

**LoreSmith** — *Where worlds come to life.*
