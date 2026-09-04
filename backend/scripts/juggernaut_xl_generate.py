"""
Generate images with Juggernaut XL (an SDXL-based checkpoint) on a Mac.

Setup (run once, in a terminal):
    pip install diffusers torch torchvision transformers accelerate safetensors huggingface_hub

First run will download the model weights (~7GB) from Hugging Face and
cache them locally, so it needs an internet connection and a few GB of
free disk space the first time only.

Usage:
    python juggernaut_xl_generate.py "85mm portrait of an elderly fisherman, golden hour"
    python juggernaut_xl_generate.py "a cat in a spacesuit" --steps 25 --seed 7 --out cat.png
"""

import argparse

import torch
from diffusers import StableDiffusionXLPipeline, EulerDiscreteScheduler
from huggingface_hub import hf_hub_download

REPO_ID = "RunDiffusion/Juggernaut-XL-v9"
CHECKPOINT_FILE = "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors"


def get_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_pipeline(device: str) -> StableDiffusionXLPipeline:
    # float16 is fastest on Apple Silicon; fall back to float32 on CPU.
    dtype = torch.float16 if device in ("mps", "cuda") else torch.float32

    # Juggernaut XL ships as one merged checkpoint (not a diffusers-format
    # multi-folder pipeline), so it needs from_single_file rather than
    # from_pretrained. hf_hub_download grabs the file once and caches it —
    # later runs reuse the cached copy without re-downloading.
    ckpt_path = hf_hub_download(repo_id=REPO_ID, filename=CHECKPOINT_FILE)

    pipe = StableDiffusionXLPipeline.from_single_file(
        ckpt_path,
        torch_dtype=dtype,
        use_safetensors=True,
    )
    pipe = pipe.to(device)
    pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config)

    # Trims peak memory use — helpful on 8-16GB Macs, negligible cost elsewhere.
    pipe.enable_attention_slicing()

    return pipe


def generate(
    pipe: StableDiffusionXLPipeline,
    prompt: str,
    negative_prompt: str = "blurry, low quality, deformed, extra limbs",
    steps: int = 30,
    guidance_scale: float = 5.0,
    width: int = 1024,
    height: int = 1024,
    seed: int | None = None,
    device: str = "cpu",
):
    generator = None
    if seed is not None:
        generator = torch.Generator(device=device).manual_seed(seed)

    result = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
        generator=generator,
    )
    return result.images[0]


def main():
    parser = argparse.ArgumentParser(description="Generate an image with Juggernaut XL")
    parser.add_argument("prompt", help="What to generate")
    parser.add_argument("--negative", default="blurry, low quality, deformed, extra limbs")
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--guidance", type=float, default=5.0)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--out", default="output.png")
    args = parser.parse_args()

    device = get_device()
    print(f"Using device: {device}")

    pipe = load_pipeline(device)
    image = generate(
        pipe,
        prompt=args.prompt,
        negative_prompt=args.negative,
        steps=args.steps,
        guidance_scale=args.guidance,
        width=args.width,
        height=args.height,
        seed=args.seed,
        device=device,
    )
    image.save(args.out)
    print(f"Saved {args.out}")


if __name__ == "__main__":
    main()
