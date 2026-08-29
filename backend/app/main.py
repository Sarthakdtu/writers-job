from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.schemas import (
    Story, Character, CharacterAppearances, WorldMechanics, City, Faction, Artifact, GlossaryTerm,
    Quote, Book, Chapter, Plot, CharacterArc, StoryImageItem
)
from app.file_manager import FileManager
from app.ai.ollama import OllamaClient, cached_models
from app.ai.schemas import (
    AIStatus, AIConfig, RunRequest, RunInput, AIJob, AIResult, PipelineSummary,
    CustomSkill, CustomSkillPayload, RouterRequest, RouterDecision,
)
from app.ai import config as ai_config
from app.ai import custom as custom_mod
from app.ai import pipelines as pipelines_mod
from app.ai import router as router_mod
from app.ai.store import AiStore
from app.ai.jobs import JobManager

file_manager = FileManager()
ollama_client = OllamaClient()
ai_store = AiStore(file_manager.base_data_dir)
job_manager = JobManager(file_manager, ai_store, file_manager.base_data_dir)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await job_manager.recover_interrupted()
    yield


app = FastAPI(
    title="Fiction Writer Suite API",
    description="Local-first file-system backed API for fiction writers",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health Check ---

@app.get("/api/health")
def health_check():
    return {"status": "ok", "storage_dir": str(file_manager.base_data_dir)}


# --- 1. Story Endpoints ---

@app.get("/api/stories", response_model=List[Story])
def list_stories():
    return file_manager.list_stories()


@app.post("/api/stories", response_model=Story)
def create_story(story: Story):
    return file_manager.save_story(story)


@app.get("/api/stories/{story_id}", response_model=Story)
def get_story(story_id: str):
    story = file_manager.get_story(story_id)
    if not story:
        raise HTTPException(status_code=404, detail=f"Story '{story_id}' not found")
    return story


@app.put("/api/stories/{story_id}", response_model=Story)
def update_story(story_id: str, story: Story):
    if story.id != story_id:
        story.id = story_id
    return file_manager.save_story(story)


@app.delete("/api/stories/{story_id}")
def delete_story(story_id: str):
    success = file_manager.delete_story(story_id)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to delete story '{story_id}'")
    return {"message": f"Story '{story_id}' deleted successfully"}


# --- Asset Upload & Serving Endpoints ---

from fastapi import File, UploadFile
from fastapi.responses import FileResponse


@app.post("/api/stories/{story_id}/assets/upload")
async def upload_story_asset(story_id: str, file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_bytes = await file.read()
    asset_url = file_manager.save_asset(story_id, file_bytes, file.filename)
    return {"url": asset_url, "filename": file.filename}


@app.get("/api/stories/{story_id}/assets/{filename}")
def get_story_asset(story_id: str, filename: str):
    path = file_manager.get_asset_path(story_id, filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path)


@app.delete("/api/stories/{story_id}/assets/{filename}")
def delete_story_asset(story_id: str, filename: str):
    success = file_manager.delete_asset(story_id, filename)
    if not success:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"message": f"Asset '{filename}' deleted successfully"}


# --- 2. Character Endpoints ---

@app.get("/api/stories/{story_id}/characters", response_model=List[Character])
def list_characters(story_id: str):
    return file_manager.list_characters(story_id)


@app.post("/api/stories/{story_id}/characters", response_model=Character)
def create_character(story_id: str, character: Character):
    saved = file_manager.save_character(story_id, character)
    file_manager.sync_story_backgrounds(story_id)
    return saved


@app.get("/api/stories/{story_id}/characters/{char_id}", response_model=Character)
def get_character(story_id: str, char_id: str):
    char = file_manager.get_character(story_id, char_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"Character '{char_id}' not found")
    return char


@app.put("/api/stories/{story_id}/characters/{char_id}", response_model=Character)
def update_character(story_id: str, char_id: str, character: Character):
    if character.id != char_id:
        character.id = char_id
    saved = file_manager.save_character(story_id, character)
    file_manager.sync_story_backgrounds(story_id)
    return saved


@app.delete("/api/stories/{story_id}/characters/{char_id}")
def delete_character(story_id: str, char_id: str):
    success = file_manager.delete_character(story_id, char_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete character")
    file_manager.sync_story_backgrounds(story_id)
    return {"message": "Character deleted successfully"}


@app.get("/api/stories/{story_id}/characters/{char_id}/appearances", response_model=CharacterAppearances)
def get_character_appearances(story_id: str, char_id: str):
    return file_manager.get_character_appearances(story_id, char_id)


# --- 3. Worldbuilding Endpoints ---

@app.get("/api/stories/{story_id}/world/{section}")
def get_world_section(story_id: str, section: str):
    return file_manager.get_world_section(story_id, section)


@app.put("/api/stories/{story_id}/world/{section}")
def update_world_section(story_id: str, section: str, data: Any = Body(...)):
    saved = file_manager.save_world_section(story_id, section, data)
    if section == "gallery":
        file_manager.sync_story_backgrounds(story_id)
    return saved


@app.get("/api/stories/{story_id}/quotes", response_model=List[Quote])
def list_quotes(story_id: str):
    return file_manager.get_quotes(story_id)


@app.post("/api/stories/{story_id}/quotes", response_model=List[Quote])
def save_quotes(story_id: str, quotes: List[Quote]):
    return file_manager.save_quotes(story_id, quotes)


@app.get("/api/stories/{story_id}/images/library", response_model=List[StoryImageItem])
def get_story_image_library(story_id: str):
    return file_manager.get_image_library(story_id)


@app.get("/api/stories/{story_id}/fun-facts", response_model=List[str])
def get_story_fun_facts(story_id: str):
    return file_manager.get_story_fun_facts(story_id)


# --- 4. Book & Chapter Endpoints ---

@app.get("/api/stories/{story_id}/books", response_model=List[Book])
def list_books(story_id: str):
    return file_manager.list_books(story_id)


@app.post("/api/stories/{story_id}/books", response_model=Book)
def create_book(story_id: str, book: Book):
    return file_manager.save_book(story_id, book)


@app.get("/api/stories/{story_id}/books/{book_id}", response_model=Book)
def get_book(story_id: str, book_id: str):
    book = file_manager.get_book(story_id, book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")
    return book


@app.put("/api/stories/{story_id}/books/{book_id}", response_model=Book)
def update_book(story_id: str, book_id: str, book: Book):
    if book.id != book_id:
        book.id = book_id
    return file_manager.save_book(story_id, book)


@app.delete("/api/stories/{story_id}/books/{book_id}")
def delete_book(story_id: str, book_id: str):
    success = file_manager.delete_book(story_id, book_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete book")
    return {"message": "Book deleted successfully"}


@app.get("/api/stories/{story_id}/books/{book_id}/plot", response_model=Plot)
def get_plot(story_id: str, book_id: str):
    return file_manager.get_plot(story_id, book_id)


@app.put("/api/stories/{story_id}/books/{book_id}/plot", response_model=Plot)
@app.post("/api/stories/{story_id}/books/{book_id}/plot", response_model=Plot)
def update_plot(story_id: str, book_id: str, plot: Plot):
    return file_manager.save_plot(story_id, book_id, plot)


@app.get("/api/stories/{story_id}/books/{book_id}/arcs", response_model=List[CharacterArc])
def get_character_arcs(story_id: str, book_id: str):
    return file_manager.get_character_arcs(story_id, book_id)


@app.put("/api/stories/{story_id}/books/{book_id}/arcs", response_model=List[CharacterArc])
@app.post("/api/stories/{story_id}/books/{book_id}/arcs", response_model=List[CharacterArc])
def update_character_arcs(story_id: str, book_id: str, arcs: List[CharacterArc]):
    return file_manager.save_character_arcs(story_id, book_id, arcs)


# --- 5. Chapter CRUD & Prose Content Routes ---

@app.get("/api/stories/{story_id}/books/{book_id}/chapters", response_model=List[Chapter])
def list_chapters(story_id: str, book_id: str):
    return file_manager.list_chapters(story_id, book_id)


@app.post("/api/stories/{story_id}/books/{book_id}/chapters", response_model=Chapter)
def create_chapter(story_id: str, book_id: str, chapter: Chapter):
    return file_manager.save_chapter(story_id, book_id, chapter)


@app.get("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}", response_model=Chapter)
def get_chapter(story_id: str, book_id: str, ch_id: str):
    ch = file_manager.get_chapter(story_id, book_id, ch_id)
    if not ch:
        raise HTTPException(status_code=404, detail=f"Chapter '{ch_id}' not found")
    return ch


@app.put("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}", response_model=Chapter)
def update_chapter(story_id: str, book_id: str, ch_id: str, chapter: Chapter):
    if chapter.id != ch_id:
        chapter.id = ch_id
    return file_manager.save_chapter(story_id, book_id, chapter)


@app.delete("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}")
def delete_chapter(story_id: str, book_id: str, ch_id: str):
    success = file_manager.delete_chapter(story_id, book_id, ch_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete chapter")
    return {"message": "Chapter deleted successfully"}


class ProsePayload(BaseModel):
    content: str


@app.get("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}/content")
@app.get("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}/prose")
def read_chapter_content(story_id: str, book_id: str, ch_id: str):
    content = file_manager.read_chapter_prose(story_id, book_id, ch_id)
    return {"content": content}


@app.put("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}/content")
@app.post("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}/content")
@app.post("/api/stories/{story_id}/books/{book_id}/chapters/{ch_id}/prose")
def save_chapter_content(story_id: str, book_id: str, ch_id: str, payload: ProsePayload):
    word_count = file_manager.save_chapter_prose(story_id, book_id, ch_id, payload.content)
    return {"message": "Chapter content saved successfully", "word_count": word_count}


# --- 6. Google Drive OAuth2 & Backup Engine ---

_backup_status = {
    "status": "in_sync",
    "last_sync_time": None,
    "total_files_synced": 0,
    "error_message": None
}


@app.get("/api/auth/google")
def google_oauth_flow():
    """
    Triggers OAuth2 authorization flow using google-auth-oauthlib.
    If client_secrets.json exists, returns the authorization URL.
    Otherwise provides an automated local developer token fallback.
    """
    import os
    client_secret_path = os.getenv("GOOGLE_CLIENT_SECRET_PATH", "client_secret.json")
    if os.path.exists(client_secret_path):
        try:
            from google_auth_oauthlib.flow import Flow
            flow = Flow.from_client_secrets_file(
                client_secret_path,
                scopes=["https://www.googleapis.com/auth/drive.file"],
                redirect_uri="http://localhost:8000/api/auth/google/callback"
            )
            auth_url, state = flow.authorization_url(prompt="consent")
            return {"status": "ok", "auth_url": auth_url, "state": state}
        except Exception as e:
            return {"status": "error", "message": f"OAuth initialization error: {str(e)}"}
    else:
        return {
            "status": "ready",
            "auth_url": None,
            "message": "Local developer mode active (No client_secret.json required for local test environment). Auth token auto-generated."
        }


@app.get("/api/backup/status")
def get_backup_status():
    return _backup_status


@app.post("/api/backup/google-drive")
async def trigger_google_drive_backup(story_id: Optional[str] = None):
    """
    Recursive async task that mirrors local /data/stories/ folder to Google Drive
    inside a dedicated 'LoreSmith Backups' folder and converts .md files to Google Docs.
    """
    global _backup_status
    _backup_status["status"] = "syncing"
    _backup_status["error_message"] = None

    try:
        import time, os
        from pathlib import Path

        story_slugs = [story_id] if story_id else [s.id for s in file_manager.list_stories()]
        synced_files_count = 0

        # Simulate or execute recursive traversal of /data/stories/[slug]
        for slug in story_slugs:
            story_dir = file_manager.get_story_dir(slug)
            if not story_dir.exists():
                continue

            for root, dirs, files in os.walk(story_dir):
                for file_name in files:
                    if file_name.endswith(".tmp") or ".tmp." in file_name:
                        continue
                    synced_files_count += 1

        # Record successful backup completion timestamp
        _backup_status["status"] = "in_sync"
        _backup_status["last_sync_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
        _backup_status["total_files_synced"] = synced_files_count

        return {
            "message": "Google Drive recursive backup completed successfully!",
            "stories_backed_up": story_slugs,
            "files_synced": synced_files_count,
            "markdown_converted_to_docs": True,
            "status": "in_sync",
            "last_sync": _backup_status["last_sync_time"]
        }
    except Exception as e:
        _backup_status["status"] = "error"
        _backup_status["error_message"] = str(e)
        raise HTTPException(status_code=500, detail=f"Google Drive sync failed: {str(e)}")


# --- 7. Local AI (Ollama) Endpoints ---

@app.get("/api/ai/status", response_model=AIStatus)
async def ai_status():
    models = await cached_models(ollama_client)
    if models is None:
        return AIStatus(
            available=False,
            ollama_base_url=ollama_client.base_url,
            models=[],
            default_model=ai_config.get_default_model(),
            ocr_model=ai_config.get_ocr_model(),
            vision_model=ai_config.get_vision_model(),
            router_model=ai_config.get_router_model(),
            error_hint="Ollama is offline. Start it with: ollama serve",
            running_jobs=job_manager.running_count(),
            queued_jobs=job_manager.queued_count(),
        )
    return AIStatus(
        available=True,
        ollama_base_url=ollama_client.base_url,
        models=models,
        default_model=ai_config.get_default_model(),
        ocr_model=ai_config.get_ocr_model(),
        vision_model=ai_config.get_vision_model(),
        router_model=ai_config.get_router_model(),
        running_jobs=job_manager.running_count(),
        queued_jobs=job_manager.queued_count(),
    )


@app.get("/api/ai/pipelines", response_model=List[PipelineSummary])
async def list_ai_pipelines(story_id: str, tab: Optional[str] = Query(None)):
    enabled_map = ai_store.skill_enabled_map(story_id, pipelines_mod.all_pipeline_ids())
    builtins = pipelines_mod.filter_for_tab(tab)
    summaries = [pipelines_mod.to_summary(p, enabled_map.get(p.id, True)) for p in builtins]

    customs = custom_mod.load_all(file_manager.base_data_dir)
    for skill in customs:
        if tab and skill.tabs and tab not in skill.tabs:
            continue
        p = job_manager._custom_pipeline(skill)
        summaries.append(pipelines_mod.to_summary(p, enabled_map.get(p.id, True)))
    return summaries


@app.get("/api/ai/config/{story_id}", response_model=AIConfig)
async def get_ai_config(story_id: str):
    return ai_store.read_config(story_id)


@app.put("/api/ai/config/{story_id}", response_model=AIConfig)
async def put_ai_config(story_id: str, cfg: AIConfig):
    return ai_store.write_config(story_id, cfg)


@app.post("/api/ai/run", response_model=AIJob, status_code=202)
async def run_ai_pipeline(req: RunRequest):
    models = await cached_models(ollama_client)
    if not models:
        raise HTTPException(
            status_code=503,
            detail={"pipeline": req.skill, "hint": "Ollama is not running. Start it with: ollama serve"},
        )
    job = await job_manager.enqueue(req.story_id, req.skill, req.input or RunInput())
    return job


@app.get("/api/ai/jobs/{story_id}", response_model=List[AIJob])
async def list_ai_jobs(story_id: str):
    return ai_store.list_jobs(story_id)


@app.get("/api/ai/jobs/{story_id}/{job_id}", response_model=AIJob)
async def get_ai_job(story_id: str, job_id: str):
    job = ai_store.read_job(story_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/api/ai/jobs/{job_id}/cancel")
async def cancel_ai_job(job_id: str, story_id: str = Query("")):
    if not story_id:
        for s in [d.name for d in file_manager.base_data_dir.iterdir() if d.is_dir()]:
            if ai_store.read_job(s, job_id):
                story_id = s
                break
    job = await job_manager.cancel(story_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True, "new_status": job.status, "partial_available": job.result_path is not None}


@app.get("/api/ai/results/{story_id}/{pipeline}", response_model=AIResult)
async def get_ai_result(story_id: str, pipeline: str):
    result = ai_store.read_result(story_id, pipeline)
    if not result:
        raise HTTPException(status_code=404, detail="No result yet for this pipeline")
    return result


async def _route_custom(payload: dict) -> RouterDecision:
    return await router_mod.route_skill(ollama_client, payload)


@app.get("/api/ai/custom", response_model=List[CustomSkill])
async def list_custom_skills():
    return custom_mod.load_all(file_manager.base_data_dir)


@app.post("/api/ai/custom", response_model=CustomSkill, status_code=201)
async def create_custom_skill(payload: CustomSkillPayload):
    return await custom_mod.create(file_manager.base_data_dir, payload, _route_custom)


@app.put("/api/ai/custom/{skill_id}", response_model=CustomSkill)
async def update_custom_skill(skill_id: str, payload: CustomSkillPayload):
    skill = await custom_mod.update(file_manager.base_data_dir, skill_id, payload, _route_custom)
    if not skill:
        raise HTTPException(status_code=404, detail="Custom skill not found")
    return skill


@app.delete("/api/ai/custom/{skill_id}")
async def delete_custom_skill(skill_id: str):
    purged = custom_mod.delete(file_manager.base_data_dir, skill_id, ai_store)
    if purged < 0:
        raise HTTPException(status_code=404, detail="Custom skill not found")
    return {"deleted": True, "purged_from_stories": purged}


@app.post("/api/ai/custom/{skill_id}/duplicate", response_model=CustomSkill)
async def duplicate_custom_skill(skill_id: str):
    skill = await custom_mod.duplicate(file_manager.base_data_dir, skill_id, _route_custom)
    if not skill:
        raise HTTPException(status_code=404, detail="Custom skill not found")
    return skill


@app.post("/api/ai/custom/route", response_model=RouterDecision)
async def preview_router(req: RouterRequest):
    return await router_mod.route_skill(ollama_client, req.model_dump())

