"""App settings from environment. Load .env from backend directory if present."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend/ so you can put OPENAI_API_KEY there
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(_BACKEND_DIR / ".env")


def get_openai_api_key() -> str | None:
    """OpenAI API key for image generation. Set OPENAI_API_KEY in backend/.env"""
    return os.getenv("OPENAI_API_KEY") or None
