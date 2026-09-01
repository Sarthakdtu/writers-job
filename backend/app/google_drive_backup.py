import hashlib
import os
import shutil
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

    def _find_child_folder(self, service, parent_id: Optional[str], name: str) -> Optional[str]:
        parent = parent_id or "root"
        response = (
            service.files()
            .list(
                q=f"'{parent}' in parents and name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields="files(id)",
                spaces="drive",
            )
            .execute()
        )
        files = response.get("files", [])
        return files[0]["id"] if files else None

    def _create_folder(self, service, parent_id: Optional[str], name: str) -> str:
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

    # --- restore -----------------------------------------------------------

    def _md5(self, path: Path) -> str:
        try:
            hasher = hashlib.md5()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except OSError:
            return ""

    def _get_drive_file(self, service, file_id: str) -> Optional[Dict]:
        try:
            file = (
                service.files()
                .get(fileId=file_id, fields="id,name,md5Checksum,modifiedTime")
                .execute()
            )
            return file
        except Exception:
            return None

    def _download_drive_file(self, service, file_id: str) -> Optional[bytes]:
        from googleapiclient.http import MediaIoBaseDownload
        import io

        try:
            request = service.files().get_media(fileId=file_id)
            buf = io.BytesIO()
            downloader = MediaIoBaseDownload(buf, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            return buf.getvalue()
        except Exception:
            return None

    def _remote_manifests(self) -> Dict[str, Dict[str, str]]:
        """Return {story_slug: {rel_path: file_id}} from the persisted backup manifest."""
        state = self._load_state()
        stories = state.get("stories", {})
        result = {}
        for slug, st in stories.items():
            manifest = (st or {}).get("files", {}) or {}
            if manifest:
                result[slug] = dict(manifest)
        return result

    def preview_restore(self) -> Dict:
        """Compare local files against the Drive backup manifest.

        Returns, per story, which files are in sync, which conflict (local != drive),
        which are remote-only (present on Drive but not locally), and which are local-only.
        """
        service = self.auth_service.get_drive_service()
        if service is None:
            raise ConnectionError("Google Drive credentials unavailable or expired.")

        manifests = self._remote_manifests()
        result = {"stories": {}, "total": {"in_sync": 0, "conflicts": 0, "remote_only": 0, "local_only": 0}}

        for slug, manifest in manifests.items():
            story_dir = self.base_data_dir / slug
            in_sync, conflicts, remote_only, local_only = [], [], [], []

            for rel_path, file_id in manifest.items():
                local_path = story_dir / rel_path
                drive_file = self._get_drive_file(service, file_id)
                if drive_file is None:
                    continue

                local_exists = local_path.exists()
                drive_md5 = (drive_file.get("md5Checksum") or "").lower()
                if local_exists:
                    local_md5 = self._md5(local_path).lower()
                    if local_md5 and drive_md5 and local_md5 == drive_md5:
                        in_sync.append(rel_path)
                    elif not local_md5 or not drive_md5:
                        conflicts.append(rel_path)
                    else:
                        conflicts.append(rel_path)
                else:
                    remote_only.append(rel_path)

            if story_dir.exists():
                for root, dirs, files in os.walk(story_dir):
                    for file_name in files:
                        abs_path = Path(root) / file_name
                        rel = abs_path.relative_to(story_dir).as_posix()
                        if rel not in manifest:
                            local_only.append(rel)

            if not any([in_sync, conflicts, remote_only, local_only]):
                continue

            result["stories"][slug] = {
                "in_sync": in_sync,
                "conflicts": conflicts,
                "remote_only": remote_only,
                "local_only": local_only,
            }
            result["total"]["in_sync"] += len(in_sync)
            result["total"]["conflicts"] += len(conflicts)
            result["total"]["remote_only"] += len(remote_only)
            result["total"]["local_only"] += len(local_only)

        return result

    def restore_all(self, choice: str) -> Dict:
        """Restore story files from Drive. choice is 'drive' or 'local'.

        Applies to conflicting files only:
          - 'drive' -> overwrite local with the Drive version (old local is kept as a
            local backup under .restore-backup/), remote-only files are created.
          - 'local' -> keep local; remote-only files are still created so no Drive data
            is lost.
        local-only files are always preserved.
        """
        if choice not in ("drive", "local"):
            raise ValueError("choice must be 'drive' or 'local'")

        service = self.auth_service.get_drive_service()
        if service is None:
            raise ConnectionError("Google Drive credentials unavailable or expired.")

        manifests = self._remote_manifests()

        backup_root = self.base_data_dir / ".restore-backup"
        if backup_root.exists():
            shutil.rmtree(backup_root, ignore_errors=True)

        restored_files = 0
        created_files = 0
        preserved_backups = 0
        skipped_conflicts = 0

        for slug, manifest in manifests.items():
            story_dir = self.base_data_dir / slug
            story_dir.mkdir(parents=True, exist_ok=True)

            for rel_path, file_id in manifest.items():
                local_path = story_dir / rel_path
                drive_file = self._get_drive_file(service, file_id)
                if drive_file is None:
                    continue

                local_exists = local_path.exists()
                drive_md5 = (drive_file.get("md5Checksum") or "").lower()
                local_md5 = self._md5(local_path).lower() if local_exists else ""
                differs = not local_exists or not local_md5 or not drive_md5 or local_md5 != drive_md5

                content = self._download_drive_file(service, file_id)
                if content is None:
                    continue

                if not local_exists:
                    self._write_restored(local_path, content)
                    created_files += 1
                    continue

                if not differs:
                    continue

                if choice == "drive":
                    backup_path = backup_root / slug / rel_path
                    if local_exists:
                        backup_path.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(local_path, backup_path)
                        preserved_backups += 1
                    self._write_restored(local_path, content)
                    restored_files += 1
                else:
                    skipped_conflicts += 1

        return {
            "restored_files": restored_files,
            "created_files": created_files,
            "preserved_backups": preserved_backups,
            "skipped_conflicts": skipped_conflicts,
        }

    @staticmethod
    def _write_restored(local_path: Path, content: bytes) -> None:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = local_path.with_name(f".{local_path.name}.restore.tmp")
        with open(tmp, "wb") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, local_path)
