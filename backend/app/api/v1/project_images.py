"""Project-scoped image generation: generate, list, serve, delete, export."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.v1.images import (
    BatchGenerateRequest,
    BatchGenerateResponse,
    ExportRequest,
    run_batch_generate,
)
from app.api.v1.projects import get_project
from app.core.database import get_db
from app.models.project import Project


router = APIRouter()


def _project_generated_dir(project_id: int) -> Path:
    backend_dir = Path(__file__).resolve().parents[3]
    return backend_dir / "generated" / str(project_id)


def _safe_filename(name: str) -> bool:
    return bool(name) and "/" not in name and "\\" not in name and ".." not in name


def _media_type_for_filename(name: str) -> str:
    ext = Path(name).suffix.lower()
    return {".png": "image/png", ".webp": "image/webp", ".jpeg": "image/jpeg", ".jpg": "image/jpeg"}.get(
        ext, "application/octet-stream"
    )


def _require_project(project_id: int, db: Session = Depends(get_db)) -> Project:
    return get_project(project_id=project_id, db=db)


@router.get("", response_model=dict)
def list_project_images(
    project_id: int,
    db: Session = Depends(get_db),
    _: Project = Depends(_require_project),
):
    """List generated image filenames and URLs for this project."""
    out_dir = _project_generated_dir(project_id)
    if not out_dir.is_dir():
        return {"images": []}
    prefix = f"/api/v1/projects/{project_id}/images/files"
    files = [
        f
        for f in out_dir.iterdir()
        if f.is_file() and _safe_filename(f.name)
    ]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    images = [{"filename": f.name, "url": f"{prefix}/{f.name}"} for f in files]
    return {"images": images}


@router.post("/generate", response_model=BatchGenerateResponse)
def project_batch_generate(
    project_id: int,
    body: BatchGenerateRequest,
    db: Session = Depends(get_db),
    _: Project = Depends(_require_project),
):
    """Generate 1–20 images for this project."""
    out_dir = _project_generated_dir(project_id)
    file_url_prefix = f"/api/v1/projects/{project_id}/images/files"
    try:
        return run_batch_generate(body, out_dir, file_url_prefix)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}") from e


@router.get("/files/{filename}", response_class=FileResponse)
def serve_project_image(
    project_id: int,
    filename: str,
    db: Session = Depends(get_db),
    _: Project = Depends(_require_project),
):
    if not _safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = _project_generated_dir(project_id) / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath, media_type=_media_type_for_filename(filename))


@router.delete("/files/{filename}", status_code=204)
def delete_project_image(
    project_id: int,
    filename: str,
    db: Session = Depends(get_db),
    _: Project = Depends(_require_project),
):
    if not _safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = _project_generated_dir(project_id) / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    filepath.unlink()
    return None


@router.post("/export", response_class=StreamingResponse)
def export_project_images(
    project_id: int,
    body: ExportRequest,
    db: Session = Depends(get_db),
    _: Project = Depends(_require_project),
):
    out_dir = _project_generated_dir(project_id)
    if not out_dir.is_dir():
        raise HTTPException(status_code=400, detail="No images to export")
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
        headers={"Content-Disposition": "attachment; filename=visionforge-project-export.zip"},
    )
