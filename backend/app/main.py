import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.db.database import init_db
from app.api.ingest import router as ingest_router
from app.api.stress_test import router as stress_test_router
from app.api.rehearsal import router as rehearsal_router
from app.api.readiness import router as readiness_router

app = FastAPI(
    title="Cairn - Project Continuity Intelligence Platform",
    description="Deterministic project continuity engine preventing critical knowledge loss during transitions.",
    version="1.0.0"
)

# Enable CORS for local and production deployment (including Render)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cairn-oua7.onrender.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ingest_router)
app.include_router(stress_test_router)
app.include_router(rehearsal_router)
app.include_router(readiness_router)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "platform": "Cairn", "gravity_lock": "ACTIVE"}

# Mount frontend static distribution if built (for unified single-service deployments on Render)
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")

