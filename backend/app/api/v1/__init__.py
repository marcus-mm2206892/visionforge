from fastapi import APIRouter

from app.api.v1 import images, project_images, projects

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(project_images.router, prefix="/projects/{project_id}/images", tags=["project-images"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
