"""AI settings, all overridable via environment variables."""
import os
from pathlib import Path
from typing import Optional


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def get_ollama_base_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


def get_default_model() -> str:
    return os.getenv("OLLAMA_DEFAULT_MODEL", "qwen3.5:9b")


def get_ocr_model() -> str:
    return os.getenv("OLLAMA_OCR_MODEL", "glm-ocr:latest")


def get_vision_model() -> str:
    return os.getenv("OLLAMA_VISION_MODEL", "minicpm-v:latest")


def get_router_model() -> str:
    return os.getenv("OLLAMA_ROUTER_MODEL", get_default_model())


def get_ollama_timeout_s() -> float:
    try:
        return float(os.getenv("OLLAMA_TIMEOUT_S", "300"))
    except ValueError:
        return 300.0


def get_router_timeout_s() -> float:
    """Max wall-clock allowed for one LLM routing call before falling back to the
    keyword matcher. Keeps Skill Studio responsive even on slow default models."""
    try:
        return float(os.getenv("OLLAMA_ROUTER_TIMEOUT_S", "20"))
    except ValueError:
        return 20.0


def get_context_budget_chars() -> int:
    try:
        return int(os.getenv("OLLAMA_CONTEXT_BUDGET_CHARS", "40000"))
    except ValueError:
        return 40000


def get_ollama_temperature() -> float:
    try:
        return float(os.getenv("OLLAMA_TEMPERATURE", "0.2"))
    except ValueError:
        return 0.2


def get_max_images_per_run() -> int:
    try:
        return int(os.getenv("OLLAMA_MAX_IMAGES_PER_RUN", "6"))
    except ValueError:
        return 6


def get_generate_script() -> Optional[str]:
    """Path to the local diffusion image-generation script (juggernaut_xl_generate.py,
    vendored under backend/scripts/). Empty/None disables the chapter-art generation stage."""
    raw = os.getenv("GENERATE_SCRIPT", "").strip()
    if raw:
        return raw
    vendored = Path(__file__).resolve().parents[2] / "scripts" / "juggernaut_xl_generate.py"
    return str(vendored) if vendored.exists() else None


def get_generate_steps() -> int:
    try:
        return int(os.getenv("GENERATE_STEPS", "25"))
    except ValueError:
        return 25


def get_generate_seed() -> Optional[int]:
    raw = os.getenv("GENERATE_SEED", "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def get_generate_guidance() -> float:
    try:
        return float(os.getenv("GENERATE_GUIDANCE", "5.0"))
    except ValueError:
        return 5.0


def get_generate_width() -> int:
    try:
        return int(os.getenv("GENERATE_WIDTH", "1024"))
    except ValueError:
        return 1024


def get_generate_height() -> int:
    try:
        return int(os.getenv("GENERATE_HEIGHT", "1024"))
    except ValueError:
        return 1024


def get_generate_python() -> str:
    """Python interpreter used to run the generation script. It must have torch +
    diffusers installed. Prefers `GENERATE_PYTHON`, then a PATH `python3` that can import
    both, then common Apple-Silicon framework pythons, then plain `python3`."""
    from_env = os.getenv("GENERATE_PYTHON", "").strip()
    if from_env:
        return from_env

    import shutil
    import subprocess

    def has_deps(py: str) -> bool:
        try:
            code = py if os.path.isabs(py) else str(shutil.which(py) or py)
            r = subprocess.run(
                [code, "-c", "import torch, diffusers"],
                capture_output=True,
                timeout=10,
            )
            return r.returncode == 0
        except Exception:
            return False

    for cand in (shutil.which("python3"), "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"):
        if cand and has_deps(cand):
            return cand
    return "python3"


def get_capability_override(name: str) -> Optional[str]:
    """Manual capability override for a model family, e.g.
    capability_overrides={'gemma4': 'text,vison'} is read from
    OLLAMA_CAPABILITY_OVERRIDES as 'gemma4:text,vison;foo:ocr'."""
    raw = os.getenv("OLLAMA_CAPABILITY_OVERRIDES", "")
    for entry in raw.split(";"):
        if not entry:
            continue
        if ":" in entry:
            family, caps = entry.split(":", 1)
            if name.startswith(family):
                return caps
    return None