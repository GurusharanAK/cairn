import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.db.database import init_db
from app.api.auth import router as auth_router
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
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(stress_test_router)
app.include_router(rehearsal_router)
app.include_router(readiness_router)

@app.on_event("startup")
def on_startup():
    init_db()
    from app.db.database import SessionLocal
    from app.models.models import User
    from app.seeds.seed_demo_data import seed_synthetic_project
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == "usr-mgr-01").first()
        if not user:
            print("Auto-seeding initial Cairn synthetic project data...")
            seed_synthetic_project(db)
    except Exception as e:
        print(f"Auto-seed exception: {e}")
    finally:
        db.close()

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "platform": "Cairn", "gravity_lock": "ACTIVE"}

@app.post("/api/demo/reset")
@app.get("/api/demo/reset")
def reset_demo():
    from app.seeds.seed_demo_data import reset_database
    reset_database()
    return {"status": "reset", "message": "Demo data reset to example benchmark state"}

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
