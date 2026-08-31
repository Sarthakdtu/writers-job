import os
import time
from pathlib import Path
from typing import Dict, List, Optional

from app.file_utils import read_json_safe, write_json_safe


class GoogleDriveBackupService:
    """Uploads story files to the connected Google Drive account.

    Backs up into a top-level "LoreSmith" folder, one subfolder per story slug.
    Sync is idempotent: each local file is tracked by its relative path -> Drive
    file id in a per-story manifest, so re-syncing updates in place instead of
    duplicating. Files removed locally are deleted from Drive.
    """

    ROOT_FOLDER_NAME = "LoreSmith"

    def __init__(self, auth_service, base_data_dir: Path):
        self.auth_service = auth_service
        self.base_data_dir = Path(base_data_dir)
        self.state_dir = self.base_data_dir / ".credentials" / "backup"
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.state_dir / "state.json"

    # --- state persistence -------------------------------------------------

    def _load_state(self) -> Dict:
        state = read_json_safe(self.state_path, default={}) or {}
        state.setdefault("root_folder_id", None)
        state.setdefault("stories", {})
        return state

    def _save_state(self, state: Dict) -> None:
        write_json_safe(self.state_path, state)

    def save_sync_time(self, last_sync_time: str) -> None:
        state = self._load_state()
        state["last_sync_time"] = last_sync_time
        self._save_state(state)

    def load_last_sync_time(self) -> Optional[str]:
        state = self._load_state()
        return state.get("last_sync_time")

    # --- folder resolution -------------------------------------------------

    def _find_child_folder(self, service, parent_id: str, name: str) -> Optional[str]:
        response = (
            service.files()
            .list(
                q=f"'{parent_id}' in parents and name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields="files(id)",
                spaces="drive",
            )
            .execute()
        )
        files = response.get("files", [])
        return files[0]["id"] if files else None

    def _create_folder(self, service, parent_id: str, name: str) -> str:
        metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_id:
            metadata["parents"] = [parent_id]
        file = service.files().create(body=metadata, fields="id").execute()
        return file["id"]

    def _ensure_root_folder(self, service) -> str:
        state = self._load_state()
        root_id = state.get("root_folder_id")
        if not root_id:
            root_id = self._find_child_folder(service, None, self.ROOT_FOLDER_NAME)
            if not root_id:
                root_id = self._create_folder(service, None, self.ROOT_FOLDER_NAME)
            state["root_folder_id"] = root_id
            self._save_state(state)
        return root_id

    def _ensure_story_folder(self, service, story_slug: str) -> str:
        root_id = self._ensure_root_folder(service)
        story_id = self._find_child_folder(service, root_id, story_slug)
        if not story_id:
            story_id = self._create_folder(service, root_id, story_slug)
        return story_id

    # --- file upload -------------------------------------------------------

    def _upload_file(self, service, local_path: Path, parent_id: str, drive_file_id: Optional[str]) -> str:
        from googleapiclient.http import MediaFileUpload
        media = MediaFileUpload(str(local_path), resumable=False)

        if drive_file_id:
            service.files().update(
                fileId=drive_file_id,
                media_body=media,
            ).execute()
            return drive_file_id

        metadata = {"name": local_path.name, "parents": [parent_id]}
        file = service.files().create(body=metadata, media_body=media, fields="id").execute()
        return file["id"]

    def _delete_file(self, service, drive_file_id: str) -> None:
        try:
            service.files().delete(fileId=drive_file_id).execute()
        except Exception:
            pass

    # --- sync --------------------------------------------------------------

    def sync_story(self, service, story_slug: str) -> int:
        """Sync one story dir to Drive. Returns the number of files synced (incl. deletes)."""
        story_dir = self.base_data_dir / story_slug
        if not story_dir.exists():
            return 0

        state = self._load_state()
        stories = state["stories"]
        if story_slug not in stories or not stories[story_slug].get("folder_id"):
            stories[story_slug] = {"folder_id": self._ensure_story_folder(service, story_slug), "files": {}}
        story_state = stories[story_slug]
        story_folder_id = story_state["folder_id"]
        manifest = story_state.setdefault("files", {})

        synced_count = 0

        local_files: Dict[str, Path] = {}
        for root, dirs, files in os.walk(story_dir):
            for file_name in files:
                if file_name.endswith(".tmp") or ".tmp." in file_name:
                    continue
                abs_path = Path(root) / file_name
                rel_path = abs_path.relative_to(story_dir).as_posix()
                local_files[rel_path] = abs_path

        for rel_path, abs_path in local_files.items():
            drive_file_id = self._upload_file(service, abs_path, story_folder_id, manifest.get(rel_path))
            manifest[rel_path] = drive_file_id
            synced_count += 1

        for rel_path in list(manifest.keys()):
            if rel_path not in local_files:
                self._delete_file(service, manifest[rel_path])
                del manifest[rel_path]
                synced_count += 1

        self._save_state(state)
        return synced_count

    def sync_all_or_story(self, story_slug: Optional[str], available_slugs: List[str]) -> Dict:
        service = self.auth_service.get_drive_service()
        if service is None:
            raise ConnectionError("Google Drive credentials unavailable or expired.")

        slugs = [story_slug] if story_slug else available_slugs
        self._ensure_root_folder(service)

        total = 0
        for slug in slugs:
            total += self.sync_story(service, slug)

        return {
            "stories_backed_up": slugs,
            "files_synced": total,
        }
