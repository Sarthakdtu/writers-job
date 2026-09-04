import json
import os
import re
import uuid
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Global thread lock dictionary mapping resolved canonical file path to Lock object
_file_locks: Dict[str, threading.Lock] = {}
_lock_mgr_lock = threading.Lock()


def get_file_lock(file_path: Union[str, Path]) -> threading.Lock:
    """Retrieves or creates a thread-safe Lock for a specific file path."""
    canonical_path = str(Path(file_path).resolve())
    with _lock_mgr_lock:
        if canonical_path not in _file_locks:
            _file_locks[canonical_path] = threading.Lock()
        return _file_locks[canonical_path]


def read_json_safe(file_path: Union[str, Path], default: Any = None) -> Any:
    """
    Safely reads and parses a JSON file with locking protection.
    Returns `default` if the file does not exist or fails to parse.
    """
    path = Path(file_path)
    if not path.exists():
        return default

    lock = get_file_lock(path)
    with lock:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"[FileUtil Error] Failed to read JSON at {path}: {e}")
            return default


def write_json_safe(file_path: Union[str, Path], data: Any, indent: int = 2) -> bool:
    """
    Safely writes data to a JSON file using atomic file operations and locks
    to prevent file corruption during concurrent saves or sudden crashes.
    """
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    
    lock = get_file_lock(path)
    with lock:
        # Unique temporary file path in the same directory to enable atomic os.replace
        temp_path = path.with_name(f"{path.name}.tmp.{uuid.uuid4().hex}")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=indent, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            
            # Atomic swap replacing target file atomically
            os.replace(temp_path, path)
            return True
        except Exception as e:
            print(f"[FileUtil Error] Failed to write JSON at {path}: {e}")
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            return False


def read_text_safe(file_path: Union[str, Path], default: str = "") -> str:
    """Safely reads raw text (e.g., Markdown files) with locking."""
    path = Path(file_path)
    if not path.exists():
        return default

    lock = get_file_lock(path)
    with lock:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except OSError as e:
            print(f"[FileUtil Error] Failed to read text file at {path}: {e}")
            return default


def write_text_safe(file_path: Union[str, Path], content: str) -> bool:
    """Safely writes raw text (e.g., Markdown files) using atomic operations."""
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    lock = get_file_lock(path)
    with lock:
        temp_path = path.with_name(f"{path.name}.tmp.{uuid.uuid4().hex}")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())

            os.replace(temp_path, path)
            return True
        except Exception as e:
            print(f"[FileUtil Error] Failed to write text file at {path}: {e}")
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            return False


def delete_file_safe(file_path: Union[str, Path]) -> bool:
    """Safely removes a file if present with lock protection."""
    path = Path(file_path)
    if not path.exists():
        return True

    lock = get_file_lock(path)
    with lock:
        try:
            path.unlink()
            return True
        except OSError as e:
            print(f"[FileUtil Error] Failed to delete file at {path}: {e}")
            return False


def extract_mentioned_character_ids(content: str, characters: list) -> List[str]:
    """
    Scans markdown content for @CharacterName patterns and returns the matching
    character IDs. Matches case-insensitively against character names.
    Handles multi-word names (e.g. @Gandalf the White matches "Gandalf the White").
    """
    if not content or not characters:
        return []

    name_to_id: Dict[str, str] = {}
    for char in characters:
        if hasattr(char, "name") and hasattr(char, "id"):
            name_to_id[char.name.lower().strip()] = char.id

    # Sort names longest-first so multi-word names match before single-word prefixes
    sorted_names = sorted(name_to_id.keys(), key=len, reverse=True)

    found_ids: List[str] = []
    seen: set = set()
    remaining = content

    while remaining:
        at_pos = remaining.find('@')
        if at_pos == -1:
            break
        after_at = remaining[at_pos + 1:]
        matched = False
        for name in sorted_names:
            if after_at.lower().startswith(name):
                # Ensure match is followed by a non-alphanumeric char or end of string
                end = len(name)
                if end < len(after_at) and after_at[end].isalnum():
                    continue
                char_id = name_to_id[name]
                if char_id not in seen:
                    found_ids.append(char_id)
                    seen.add(char_id)
                remaining = after_at[end:]
                matched = True
                break
        if not matched:
            remaining = after_at

    return found_ids
