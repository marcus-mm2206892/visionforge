"""FastAPI app: CORS, DB init, API router."""
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy import text
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import settings  # loads .env from backend/
from app.core.database import Base, engine
from app.api.v1 import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup and run optional migrations."""
    Base.metadata.create_all(bind=engine)
    # Add master_prompt column to projects if missing (e.g. existing SQLite DBs)
    with engine.connect() as conn:
        if "sqlite" in str(engine.url):
            try:
                conn.execute(text("ALTER TABLE projects ADD COLUMN master_prompt TEXT"))
                conn.commit()
            except Exception:
                conn.rollback()
        elif "postgresql" in str(engine.url):
            try:
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS master_prompt TEXT"))
                conn.commit()
            except Exception:
                conn.rollback()
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
