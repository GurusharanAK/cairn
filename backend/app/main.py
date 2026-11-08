from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# Enable CORS for local React development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
