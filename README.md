# Visionforge

Synthetic dataset generator for vision AI: prompt templating, batch generation, and ML-ready export.

## Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS
- **Backend**: FastAPI, SQLAlchemy, SQLite (MVP)

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**OpenAI API key** (for image generation): create `backend/.env` with:

```bash
OPENAI_API_KEY=sk-your-key-here
```

API: http://localhost:8000 — Docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # optional; defaults to http://localhost:8000
npm install
npm run dev
```

App: http://localhost:3000

### Run both

1. Start the backend (port 8000), then start the frontend (port 3000).
2. Open http://localhost:3000/dashboard — create a project and open it.

## Project layout

- `frontend/` — Next.js app (dashboard, project list, project detail)
- `backend/` — FastAPI app (`app/`: api, core, models, schemas)
- `backend/visionforge.db` — SQLite DB (created on first run)

## Next steps (from project plan)

- Prompt builder and templates
- Generation job (OpenAI image API)
- Gallery and keep/reject
- ZIP and classification export
