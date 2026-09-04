"""Local diffusion image generation (Juggernaut XL) wired into the job pipeline.

The chapter-art skill ends with a "generation" step: instead of calling an LLM, it
shells out to a local `juggernaut_xl_generate.py` script (diffusers + torch on Apple
Silicon) to render the chapter illustration, saves the PNG into the story's assets,
and attaches the resulting url to the chapter.

This keeps the heavy generation out of the async Ollama transport while still being
trackable per-step in the Job section (the stage + model show in the job card).
"""
import asyncio
import base64
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

from app.ai import config as ai_config


def _last_error(err_text: str, default: str = "image generation failed") -> str:
    lines = [ln.strip() for ln in (err_text or "").strip().splitlines() if ln.strip()]
    return lines[-1] if lines else default


async def _run(cmd) -> None:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    out = stdout.decode("utf-8", "replace")
    err = stderr.decode("utf-8", "replace")
    if proc.returncode != 0:
        raise RuntimeError(_last_error(err + "\n" + out, f"generation exited {proc.returncode}"))
    if not re.search(r"Saved .+\.png", out + err, re.IGNORECASE):
        raise RuntimeError(_last_error(out or err, "image generation finished but the output was not found"))


async def generate_image(
    prompt: str,
    *,
    out_dir: Optional[str] = None,
    steps: Optional[int] = None,
    seed: Optional[int] = None,
    guidance: Optional[float] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> Path:
    """Run the local Juggernaut script to produce a PNG, return the path to it.

    `GENERATE_SCRIPT` must point at an executable `juggernaut_xl_generate.py`.
    Raises RuntimeError on failure / missing script.
    """
    script = ai_config.get_generate_script()
    if not script:
        raise RuntimeError(
            "Image generation is not configured. Set GENERATE_SCRIPT to the path of "
            "juggernaut_xl_generate.py to enable the chapter-art skill."
        )
    script = os.path.expanduser(script)
    if not Path(script).exists():
        raise RuntimeError(f"GENERATE_SCRIPT not found: {script}")

    out_dir = out_dir or tempfile.mkdtemp(prefix="loresmith_art_")
    out_path = Path(out_dir) / "chapter_art.png"
    if out_path.exists():
        out_path.unlink()

    cmd = [
        ai_config.get_generate_python(),
        script,
        prompt,
        "--steps", str(steps if steps is not None else ai_config.get_generate_steps()),
        "--guidance", str(guidance if guidance is not None else ai_config.get_generate_guidance()),
        "--width", str(width if width is not None else ai_config.get_generate_width()),
        "--height", str(height if height is not None else ai_config.get_generate_height()),
    ]
    seed = seed if seed is not None else ai_config.get_generate_seed()
    if seed is not None:
        cmd += ["--seed", str(seed)]
    cmd += ["--out", str(out_path)]

    await _run(cmd)

    if not out_path.exists():
        raise RuntimeError(_last_error("", "image generation produced no output file"))

    return out_path


def is_generation_enabled() -> bool:
    script = ai_config.get_generate_script()
    return bool(script) and Path(os.path.expanduser(script)).exists()


def data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
