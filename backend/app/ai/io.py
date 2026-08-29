"""Image input prep for AI pipelines.

Resolves story asset references (the `/api/stories/<slug>/assets/<file>` URLs the
frontend already stores in `image_url` fields) into base64-encoded image blobs that
Ollama's `/api/chat` accepts. No re-encoding or downscaling — raw bytes round-trip
so OCR fidelity is preserved (Pillow optional, never required).
"""
import base64
import re
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import HTTPException

from app.ai import config as ai_config

_ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}
_MAX_FILE_BYTES = 8 * 1024 * 1024

_ASSET_URL_RE = re.compile(r"^/api/stories/([^/]+)/assets/([^/?#]+)")


def _extract_filename(ref: str, story_id: str) -> Optional[str]:
    clean = ref.split("?")[0].split("#")[0].strip()
    if clean.startswith("data:"):
        return None
    match = _ASSET_URL_RE.match(clean)
    if match:
        ref_story, filename = match.group(1), match.group(2)
        if ref_story != story_id:
            raise HTTPException(
                status_code=400,
                detail={
                    "bad_images": [ref],
                    "reason": f"image belongs to story '{ref_story}', not '{story_id}'",
                },
            )
    elif "/assets/" in clean:
        filename = clean.rsplit("/assets/", 1)[1].strip("/")
    else:
        filename = clean.rsplit("/", 1)[-1].strip("/")
    if not filename or filename != Path(filename).name or ".." in filename:
        return None
    return filename


def prepare_images(
    file_manager,
    story_id: str,
    image_refs: List[str],
) -> List[str]:
    """Return base64 image list for `image_refs`, or raise HTTPException(400)."""
    if not image_refs:
        return []
    max_images = ai_config.get_max_images_per_run()
    if len(image_refs) > max_images:
        raise HTTPException(
            status_code=400,
            detail={
                "bad_images": image_refs,
                "reason": f"too many images: {len(image_refs)} > {max_images}",
            },
        )

    bad: List[str] = []
    encoded: List[str] = []
    for ref in image_refs:
        if isinstance(ref, str) and ref.startswith("data:image/"):
            try:
                encoded.append(ref.split(",", 1)[1])
                continue
            except (IndexError, ValueError):
                bad.append(ref)
                continue
        try:
            filename = _extract_filename(ref, story_id)
            if filename is None:
                bad.append(ref)
                continue
            path = file_manager.get_asset_path(story_id, filename)
            if not path.is_file():
                bad.append(ref)
                continue
            ext = path.suffix.lower()
            if ext not in _ALLOWED_EXTS:
                bad.append(ref)
                continue
            data = path.read_bytes()
            if len(data) > _MAX_FILE_BYTES:
                bad.append(ref)
                continue
            encoded.append(base64.b64encode(data).decode("ascii"))
        except OSError:
            bad.append(ref)

    if bad:
        raise HTTPException(
            status_code=400,
            detail={
                "bad_images": bad,
                "reason": "unresolvable or invalid image reference(s)",
            },
        )
    return encoded


def image_plan(image_refs: List[str]) -> Dict[str, int]:
    """Count inbound images per run (useful for jobs/progress estimates)."""
    return {"images": len(image_refs), "limit": ai_config.get_max_images_per_run()}