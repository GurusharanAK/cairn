from app.db.database import SessionLocal, engine
from app.models.models import Base, User, KnowledgeGap
from app.seeds.seed_demo_data import seed_synthetic_project
from app.services.stress_test import calculate_continuity_score
from app.api.rehearsal import (
    ask_rehearsal_question,
    RehearsalAskRequest,
    reply_to_rehearsal_question,
    RehearsalReplyRequest,
    review_rehearsal_reply,
    RehearsalReviewRequest
)

def main():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_synthetic_project(db)

        s1 = calculate_continuity_score('proj-cairn-mvp', db)
        print("=================================================================")
        print("CAIRN PROJECT CONTINUITY PLATFORM: LIVE DEMONSTRATION")
        print("=================================================================")
        print(f"INITIAL CONTINUITY SCORE: {s1.overall_score}/100")
        print(f"  • Evidence Coverage (40%):      {s1.evidence_coverage_score}/40")
        print(f"  • Ownership Clarity (20%):      {s1.ownership_clarity_score}/20")
        print(f"  • Dependency Doc (20%):         {s1.dependency_doc_score}/20")
        print(f"  • Open Critical Gaps (20%):     {s1.gap_penalty_score}/20 (-{20 - s1.gap_penalty_score} penalty)")

        successor = db.query(User).filter(User.id == 'usr-dev-b').first()
        departing = db.query(User).filter(User.id == 'usr-dev-a').first()
        manager = db.query(User).filter(User.id == 'usr-mgr-01').first()

        # Step 1: Successor asks question about undocumented decision
        print("\n--- STEP 1: SUCCESSOR INQUIRY (Zero-Hallucination Gate) ---")
        question_text = "Why is the payment retry limit set to 3?"
        print(f"Successor asks: '{question_text}'")
        q_ask = ask_rehearsal_question(
            RehearsalAskRequest(project_id='proj-cairn-mvp', question=question_text),
            db,
            successor
        )
        print(f"Status:            {q_ask.status.value}")
        print(f"Found in Evidence: {q_ask.found_in_evidence}")
        print(f"Cairn Guard:       {q_ask.message}")

        # Step 2: Departing Member replies
        print("\n--- STEP 2: DEPARTING MEMBER SUBMITS TACIT KNOWLEDGE ---")
        reply_text = (
            "Stripe webhook throws an idempotent charge conflict on the 4th retry within 60s, "
            "so retries were strictly capped at 3 with exponential backoff."
        )
        print(f"Departing member replies: '{reply_text}'")
        q_reply = reply_to_rehearsal_question(
            RehearsalReplyRequest(question_id=q_ask.rehearsal_question_id, reply_text=reply_text),
            db,
            departing
        )
        print(f"Status:            {q_reply.status.value} (Pending Review - Invariant: Not yet verified evidence!)")

        # Step 3: Manager approves
        print("\n--- STEP 3: MANAGER HUMAN SIGN-OFF GATE ---")
        q_rev = review_rehearsal_reply(
            RehearsalReviewRequest(
                question_id=q_ask.rehearsal_question_id,
                approved=True,
                manager_comment="Verified against Stripe developer webhook race condition documentation."
            ),
            db,
            manager
        )
        print(f"Status:            {q_rev.status.value}")
        print(f"New Source ID:     {q_rev.new_verified_source_id} (Minted as permanent SourceDocument)")

        # Step 4: Re-calculate score
        s2 = calculate_continuity_score('proj-cairn-mvp', db)
        print("\n--- STEP 4: POST-VERIFICATION CONTINUITY SCORE ---")
        print(f"UPDATED CONTINUITY SCORE: {s2.overall_score}/100")
        print(f"  • Evidence Coverage (40%):      {s2.evidence_coverage_score}/40 (+{round(s2.evidence_coverage_score - s1.evidence_coverage_score, 2)})")
        print(f"  • Open Critical Gaps (20%):     {s2.gap_penalty_score}/20 (+{round(s2.gap_penalty_score - s1.gap_penalty_score, 2)})")
        print(f"OVERALL CONTINUITY IMPROVEMENT:   +{round(s2.overall_score - s1.overall_score, 2)} points")
        print("=================================================================")
    finally:
        db.close()

if __name__ == "__main__":
    main()

