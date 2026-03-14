"""FastAPI app: CORS, DB init, API router."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import settings  # loads .env from backend/
from app.core.database import Base, engine
from app.api.v1 import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup."""
    Base.metadata.create_all(bind=engine)
    # Ensure generated/ exists (used by image generation endpoints)
    backend_dir = Path(__file__).resolve().parents[2]
    (backend_dir / "generated").mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="Visionforge API",
    description="Synthetic dataset generator backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

backend_dir = Path(__file__).resolve().parents[2]
generated_dir = backend_dir / "generated"
generated_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(generated_dir)), name="static")

app.include_router(api_router)


@app.get("/")
async def root():
    return {"message": "Visionforge API", "docs": "/docs"}
