"""
Consolidated CLI seeder delegating directly to `app.seeds.seed_demo_data`.
Preserves the exact FinTrack synthetic benchmark (54.67 initial -> 72.67 post-approval).
"""
import argparse
from app.db.database import SessionLocal, init_db
from app.seeds.seed_demo_data import seed_synthetic_project, reset_database


def main():
    parser = argparse.ArgumentParser(description="Seed or reset Cairn demo database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate schema before seeding pristine baseline demo data.",
    )
    args = parser.parse_args()

    if args.reset:
        reset_database()
        print("Cairn database reset and re-seeded via app.seeds.seed_demo_data.")
        return

    init_db()
    db = SessionLocal()
    try:
        seed_synthetic_project(db)
        print("Cairn database seeded via app.seeds.seed_demo_data.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
