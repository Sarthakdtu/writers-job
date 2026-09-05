#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───
WIKI_URL="https://github.com/Sarthakdtu/writers-job.wiki.git"
TMPDIR_WIKI=$(mktemp -d)
DOCS_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Cloning wiki repo into $TMPDIR_WIKI ..."
git clone "$WIKI_URL" "$TMPDIR_WIKI" 2>/dev/null || {
  echo "ERROR: Could not clone wiki repo. Make sure the wiki is enabled on GitHub."
  echo "  Go to https://github.com/Sarthakdtu/writers-job and click 'Create a new wiki'."
  rm -rf "$TMPDIR_WIKI"
  exit 1
}

cd "$TMPDIR_WIKI"

# ─── Helper: copy doc as wiki page ───
add_page() {
  local source="$1"
  local name="$2"
  cp "$source" "${name}.md"
  echo "  + ${name}"
}

# ─── 1. Home page (landing) ───
cat > Home.md << 'HOMEEOF'
# LoreSmith Wiki

**LoreSmith** is a local-first fiction writing application for fiction authors, worldbuilders, and storytellers. Manage characters, maps, timelines, plot arcs, and prose — all in one beautiful, distraction-free workspace.

> Your data lives on your machine. Your story stays yours.

---

## Quick Links

| Page | What you'll find |
|------|------------------|
| [[Project-Overview]] | Project summary, stack, repository layout |
| [[Features]] | Implemented and planned features |
| [[Architecture]] | Deep architecture reference — data flow, module internals |
| [[Data-Model]] | Pydantic schemas, on-disk storage structure, gotchas |
| [[Backend]] | `file_utils`, `FileManager`, FastAPI routes |
| [[Frontend]] | Providers, contexts, theming, components/views |
| [[AI-System]] | Ollama AI integration, Creator Pipeline, env vars |
| [[API-Contract]] | Frontend ↔ backend API usage patterns |
| [[Operations]] | Running the project, PWA, Google Drive backup |
| [[Conventions]] | Change guidelines, coding conventions, known issues |

---

## Tech Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 19 + Vite 6 + Tailwind CSS v4 |
| Backend   | Python + FastAPI + Pydantic v2 |
| Storage   | Local JSON + Markdown (no database) |
| AI        | Local Ollama integration (optional) |
| Backup    | Google Drive OAuth2 (optional) |

---

## Get Started

```bash
# Clone and install
git clone https://github.com/Sarthakdtu/writer_job.git
cd writer_job
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..

# Run (two terminals)
# Terminal 1:
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2:
cd frontend && npm run dev
```

Open **http://localhost:3000**
HOMEEOF
echo "  + Home"

# ─── 2. Core documentation pages ───
add_page "$DOCS_DIR/docs/overview.md"     "Project-Overview"
add_page "$DOCS_DIR/docs/data-model.md"   "Data-Model"
add_page "$DOCS_DIR/docs/backend.md"      "Backend"
add_page "$DOCS_DIR/docs/frontend.md"     "Frontend"
add_page "$DOCS_DIR/docs/ai-system.md"    "AI-System"
add_page "$DOCS_DIR/docs/api-contract.md" "API-Contract"
add_page "$DOCS_DIR/docs/operations.md"   "Operations"
add_page "$DOCS_DIR/docs/conventions.md"  "Conventions"
add_page "$DOCS_DIR/docs/ARCHITECTURE.md" "Architecture"
add_page "$DOCS_DIR/plans/features.md"    "Features"

# ─── 3. README as a page ───
add_page "$DOCS_DIR/README.md"            "README"

# ─── 4. Commit & push ───
echo "==> Committing and pushing ..."
git add -A
git commit -m "Initialize wiki with full project documentation" 2>/dev/null || {
  echo "No changes to commit."
}
git push origin main 2>/dev/null || git push origin master 2>/dev/null

echo ""
echo "==> Done! Wiki is live at:"
echo "    https://github.com/Sarthakdtu/writers-job/wiki"

# Cleanup
rm -rf "$TMPDIR_WIKI"
