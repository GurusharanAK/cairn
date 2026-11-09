"""Load the synthetic demo project ("Orbit Pay") with an answer key.

    python seed.py            # create tables and demo data if the database is empty
    python seed.py --reset    # wipe the database first

All demo data is synthetic. Nothing here comes from a real workplace.
"""
import json
import os
import sys
from pathlib import Path

from sqlalchemy import select

from app import config, ingest, service
from app.auth import hash_password
from app.db import SessionLocal, engine
from app.models import Base, Project, Source, User

DEMO = Path(__file__).parent / "demo_data"
PASSWORD = os.environ.get("CAIRN_DEMO_PASSWORD", "cairn-demo")
USERS = [
    ("admin@cairn.demo", "Admin", config.ADMIN),
    ("manager@cairn.demo", "Nikhil Shah", config.MANAGER),
    ("departing@cairn.demo", "Arjun Rao", config.DEPARTING),
    ("incoming@cairn.demo", "Sana Khan", config.INCOMING),
]
# (file, restricted?)
SOURCES = [
    ("architecture.md", False),
    ("meeting_notes_2026-09-12.md", False),
    ("tasks.csv", False),
    ("github_export.json", False),
    ("incident_log.md", False),
    ("hr_private_notes.md", True),
]


def seed(reset: bool = False) -> int:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(Project.id).limit(1)) is not None:
            print("Database already has data. Use --reset to start over.")
            return db.scalar(select(Project.id).limit(1))
        for email, name, role in USERS:
            db.add(User(email=email, name=name, role=role, password_hash=hash_password(PASSWORD)))
        p = Project(
            name="Orbit Pay - Campus Commerce checkout",
            description="Synthetic demo project: a small checkout platform handed over when its lead developer leaves.",
            departing_member="Arjun Rao",
            successor="Sana Khan",
            answer_key=json.loads((DEMO / "answer_key.json").read_text()),
        )
        db.add(p)
        db.flush()
        for fname, restricted in SOURCES:
            data = (DEMO / fname).read_bytes()
            text, kind = ingest.classify(fname, data)
            vis = config.RESTRICTED_ROLES if restricted else config.ALL_ROLES
            db.add(Source(project_id=p.id, name=fname, kind=kind, content=text, visibility=list(vis),
                          approved=True, added_by="Nikhil Shah"))
        db.commit()
        service.analyze(db, p, None)
        print(f"Seeded project #{p.id}. Sign in with any of:")
        for email, name, role in USERS:
            print(f"  {role:<10} {email}  /  {PASSWORD}")
        return p.id


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
