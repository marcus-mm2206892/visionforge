"""Image generation: single image, batch (master + scene), serve, delete, export."""
from __future__ import annotations

import base64
import io
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.core.settings import get_gemini_api_key, get_openai_api_key


# Hidden system prompt for synthetic dataset generation. Not exposed in API.
SYNTHETIC_DATASET_SYSTEM_PROMPT = """You are generating images for a synthetic dataset used to train computer vision models.

Each generated image must be visually distinct from the others. Avoid repeating the same composition, camera placement, lighting, object positioning, or scene layout.

Introduce natural variations in:
- camera distance (close, medium, far)
- camera angle and orientation (left, right, top-down, tilted)
- framing and object placement (center, edges, partially outside frame)
- scene layout and environment structure
- object scale and distance
- occlusion level (partially hidden, obstructed by other objects)
- lighting conditions (bright, dim, shadows, directional light)
- environmental conditions (dust, clutter, weather, reflections, motion blur if applicable)
- background complexity
- object orientation and pose

Objects of interest should sometimes appear small or distant in the frame to simulate realistic detection scenarios.

Avoid producing nearly identical images or repeating the same scene composition.

Prefer scene diversity over visual similarity. Prioritize variation in composition and environment layout."""


def _build_prompt(master: str = "", scene: str = "") -> str:
    """Build pipeline: [SYSTEM] + master + scene. For single-prompt calls, scene is the user prompt."""
    parts = [SYNTHETIC_DATASET_SYSTEM_PROMPT]
    if master:
        parts.append(master.strip())
    if scene:
        parts.append(scene.strip())
    return "\n\n".join(parts)


router = APIRouter()


class BatchGenerateRequest(BaseModel):
    master_prompt: str = Field(..., min_length=1, max_length=5000, description="Dataset context and general prompt")
    scene_prompt: str = Field(..., min_length=1, max_length=3000, description="Specific scene description")
    count: int = Field(default=1, ge=1, le=20, description="Number of images to generate (max 20)")
    provider: Literal["openai", "gemini"] = Field(
        default="openai",
        description="Image generation provider: openai or gemini",
    )
    model: Literal[
        "gpt-image-1-mini", "gpt-image-1", "gpt-image-1.5",
        "imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001", "imagen-4.0-fast-generate-001",
    ] = Field(
        default="gpt-image-1-mini",
        description="Model to use for generation. Must be compatible with chosen provider.",
    )
    size: Literal["1024x1024", "1024x1536", "1536x1024"] = "1024x1024"
    aspect_ratio: Literal["1:1", "2:1"] = "1:1"
    quality: Literal["low", "medium", "high"] = "low"
    output_format: Literal["png", "webp", "jpeg"] = "png"


class ImageItem(BaseModel):
    filename: str
    url: str


class BatchGenerateResponse(BaseModel):
    batch_id: str
    images: list[ImageItem]


class ExportRequest(BaseModel):
    filenames: list[str] = Field(..., max_length=20)


class GenerateSingleRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    provider: Literal["openai", "gemini"] = Field(
        default="openai",
        description="Image generation provider: openai or gemini",
    )
    model: Literal[
        "gpt-image-1-mini", "gpt-image-1", "gpt-image-1.5",
        "imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001", "imagen-4.0-fast-generate-001",
    ] = Field(
        default="gpt-image-1-mini",
        description="Model to use for generation. Must be compatible with chosen provider.",
    )
    size: Literal["1024x1024", "1024x1536", "1536x1024"] = "1024x1024"
    aspect_ratio: Literal["1:1", "2:1"] = "1:1"
    quality: Literal["low", "medium", "high"] = "low"
    output_format: Literal["png", "webp", "jpeg"] = "png"


class GenerateSingleResponse(BaseModel):
    filename: str
    url: str
    created_at: str
    usage: Optional[dict] = None


@dataclass(frozen=True)
class _GeneratedImage:
    filename: str
    bytes_: bytes
    usage: Optional[dict]


def _generated_dir() -> Path:
    # backend/app/api/v1/ -> backend/
    backend_dir = Path(__file__).resolve().parents[3]
    return backend_dir / "generated"


def _safe_filename(name: str) -> bool:
    """Allow only simple filenames (no path traversal)."""
    return bool(name) and "/" not in name and "\\" not in name and ".." not in name


def _call_openai(
    prompt: str,
    model: str = "gpt-image-1-mini",
    size: str = "1024x1024",
    quality: str = "low",
    output_format: str = "png",
) -> _GeneratedImage:
    api_key = get_openai_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set in backend/.env")

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    result = client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        quality=quality,
        output_format=output_format,
    )

    if not result.data or not getattr(result.data[0], "b64_json", None):
        raise HTTPException(status_code=502, detail="No image data returned from OpenAI")

    image_bytes = base64.b64decode(result.data[0].b64_json)
    raw_usage = getattr(result, "usage", None)
    usage: Optional[dict] = None
    if raw_usage is not None:
        if isinstance(raw_usage, dict):
            usage = raw_usage
        elif hasattr(raw_usage, "model_dump"):
            usage = raw_usage.model_dump()
        else:
            usage = {k: v for k, v in vars(raw_usage).items() if not k.startswith("_")}

    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"image-{ts}.{output_format}"
    return _GeneratedImage(filename=filename, bytes_=image_bytes, usage=usage)


def _call_gemini(
    prompt: str,
    model: str = "imagen-4.0-generate-001",
    output_format: str = "png",
) -> _GeneratedImage:
    api_key = get_gemini_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set in backend/.env")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    mime_type = f"image/{'jpeg' if output_format == 'jpeg' else 'png'}"
    response = client.models.generate_images(
        model=model,
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            output_mime_type=mime_type,
        ),
    )

    if not response.generated_images:
        raise HTTPException(status_code=502, detail="No image data returned from Gemini")

    image_bytes = response.generated_images[0].image.image_bytes
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    ext = "jpeg" if output_format == "jpeg" else "png"
    filename = f"image-{ts}.{ext}"
    return _GeneratedImage(filename=filename, bytes_=image_bytes, usage=None)


def _call_provider(
    prompt: str,
    provider: str = "openai",
    model: str = "gpt-image-1-mini",  # openai default; gemini defaults to imagen-4.0-generate-001
    size: str = "1024x1024",
    quality: str = "low",
    output_format: str = "png",
) -> _GeneratedImage:
    if provider == "gemini":
        return _call_gemini(prompt=prompt, model=model, output_format=output_format)
    return _call_openai(prompt=prompt, model=model, size=size, quality=quality, output_format=output_format)


def _center_crop_to_aspect(image_bytes: bytes, output_format: str, aspect_ratio: str) -> bytes:
    if aspect_ratio == "1:1":
        return image_bytes
    if aspect_ratio != "2:1":
        return image_bytes

    from PIL import Image

    with Image.open(io.BytesIO(image_bytes)) as img:
        w, h = img.size
        target_h = int(round(w / 2))
        if target_h <= 0 or target_h >= h:
            return image_bytes

        top = (h - target_h) // 2
        cropped = img.crop((0, top, w, top + target_h))

        fmt = {"png": "PNG", "webp": "WEBP", "jpeg": "JPEG"}.get(output_format, "PNG")
        if fmt == "JPEG" and cropped.mode not in ("RGB", "L"):
            cropped = cropped.convert("RGB")

        buf = io.BytesIO()
        cropped.save(buf, format=fmt)
        return buf.getvalue()


def _generate_one_image(req: GenerateSingleRequest) -> _GeneratedImage:
    gen = _call_provider(
        prompt=_build_prompt(scene=req.prompt),
        provider=req.provider,
        model=req.model,
        size=req.size,
        quality=req.quality,
        output_format=req.output_format,
    )
    # Gemini handles its own sizing; only crop for OpenAI
    if req.provider == "openai":
        cropped = _center_crop_to_aspect(gen.bytes_, req.output_format, req.aspect_ratio)
    else:
        cropped = gen.bytes_
    return _GeneratedImage(filename=gen.filename, bytes_=cropped, usage=gen.usage)


def run_batch_generate(
    body: BatchGenerateRequest,
    out_dir: Path,
    file_url_prefix: str,
) -> BatchGenerateResponse:
    """Generate 1–20 images and write to out_dir. file_url_prefix is used for ImageItem.url (no trailing slash)."""
    combined = _build_prompt(master=body.master_prompt, scene=body.scene_prompt)
    batch_id = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    images: list[ImageItem] = []
    for i in range(body.count):
        gen = _call_provider(
            prompt=combined,
            provider=body.provider,
            model=body.model,
            size=body.size,
            quality=body.quality,
            output_format=body.output_format,
        )
        # Gemini handles its own sizing; only crop for OpenAI
        if body.provider == "openai":
            image_bytes = _center_crop_to_aspect(gen.bytes_, body.output_format, body.aspect_ratio)
        else:
            image_bytes = gen.bytes_
        filename = f"batch-{batch_id}-{i}.{body.output_format}"
        filepath = out_dir / filename
        filepath.write_bytes(image_bytes)
        images.append(ImageItem(filename=filename, url=f"{file_url_prefix.rstrip('/')}/{filename}"))
    return BatchGenerateResponse(batch_id=batch_id, images=images)


@router.post("/generate", response_model=BatchGenerateResponse)
def batch_generate(body: BatchGenerateRequest):
    """Generate 1–20 images from master + scene prompt (global, not project-scoped)."""
    try:
        return run_batch_generate(body, _generated_dir(), "/api/v1/images/files")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}") from e


@router.post("/single", response_model=GenerateSingleResponse)
def generate_single_image(body: GenerateSingleRequest):
    """Generate a single image from a prompt (global images, not project-scoped)."""
    try:
        gen = _generate_one_image(body)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Image generation failed: {str(e)}",
        ) from e
    out_dir = _generated_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    filepath = out_dir / gen.filename
    filepath.write_bytes(gen.bytes_)
    return GenerateSingleResponse(
        filename=gen.filename,
        url=f"/api/v1/images/files/{gen.filename}",
        created_at=datetime.utcnow().isoformat() + "Z",
        usage=gen.usage,
    )


def _media_type_for_filename(name: str) -> str:
    ext = Path(name).suffix.lower()
    return {".png": "image/png", ".webp": "image/webp", ".jpeg": "image/jpeg", ".jpg": "image/jpeg"}.get(ext, "application/octet-stream")


@router.get("/files/{filename}", response_class=FileResponse)
def serve_generated_image(filename: str):
    """Serve a generated image by filename."""
    if not _safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = _generated_dir() / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath, media_type=_media_type_for_filename(filename))


@router.delete("/files/{filename}", status_code=204)
def delete_generated_image(filename: str):
    """Delete a generated image by filename."""
    if not _safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = _generated_dir() / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    filepath.unlink()
    return None


@router.post("/export", response_class=StreamingResponse)
def export_images_as_zip(body: ExportRequest):
    """Return a ZIP of the requested generated images."""
    out_dir = _generated_dir()
    valid = [f for f in body.filenames if _safe_filename(f) and (out_dir / f).is_file()]
    if not valid:
        raise HTTPException(status_code=400, detail="No valid filenames or files not found")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in valid:
            zf.write(out_dir / f, f)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=visionforge-export.zip"},
    )
