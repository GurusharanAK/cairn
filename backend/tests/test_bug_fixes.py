import pytest
import os
import sys
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import (
    Base,
    User,
    UserRole,
    Project,
    Component,
    ComponentStatus,
    Decision,
    DecisionStatus,
    Dependency,
    DependencyType,
    KnowledgeGap,
    GapType,
    GapStatus,
    SourceDocument,
    SourceType,
    AccessLevel,
    RehearsalQuestion,
    RehearsalStatus
)
from app.services.extractor import RulesBasedExtractor
from app.services.stress_test import calculate_continuity_score, run_continuity_stress_test
from app.api.rehearsal import (
    ask_rehearsal_question,
    review_rehearsal_reply,
    reply_to_rehearsal_question,
    RehearsalAskRequest,
    RehearsalReplyRequest,
    RehearsalReviewRequest
)
from app.api.ingest import ingest_project_source, IngestRequest


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()

    # Seed base project and actors
    manager = User(
        id="usr-mgr-01",
        full_name="Engineering Manager",
        email="manager@cairn.local",
        role=UserRole.MANAGER
    )
    departing = User(
        id="usr-dev-a",
        full_name="Departing Member",
        email="departing@cairn.local",
        role=UserRole.DEPARTING_MEMBER
    )
    incoming = User(
        id="usr-dev-b",
        full_name="Successor Member",
        email="successor@cairn.local",
        role=UserRole.INCOMING_MEMBER
    )
    project = Project(
        id="proj-cairn-mvp",
        name="FinTrack Ledger",
        description="Core transaction processing system",
        manager_id=manager.id,
        departing_member_id=departing.id,
        incoming_member_id=incoming.id
    )
    db.add_all([manager, departing, incoming, project])
    db.flush()

    # Seed base architecture doc
    doc_arch = SourceDocument(
        id="src-doc-arch-01",
        project_id=project.id,
        title="ADR 001 - Database Selection",
        source_type=SourceType.DOC,
        content="We decided to use PostgreSQL for our ledger because relational transactions and strict ACID compliance are non-negotiable for financial auditing.",
        access_level=AccessLevel.RESTRICTED_TEAM,
        created_by_id=departing.id
    )
    db.add(doc_arch)
    db.flush()

    # Seed component
    comp_auth = Component(
        id="comp-auth-api",
        project_id=project.id,
        name="Authentication Service",
        owner_id=departing.id,
        source_id=doc_arch.id,
        status=ComponentStatus.ACTIVE
    )
    comp_pay = Component(
        id="comp-pay-worker",
        project_id=project.id,
        name="Payment Retry Worker",
        owner_id=departing.id,
        source_id=doc_arch.id,
        status=ComponentStatus.ACTIVE
    )
    db.add_all([comp_auth, comp_pay])
    db.flush()

    # Dependency
    dep = Dependency(
        id="dep-1",
        project_id=project.id,
        source_component_id=comp_pay.id,
        target_component_id=comp_auth.id,
        dependency_type=DependencyType.CALLS_API,
        is_hidden=False,
        source_id=doc_arch.id
    )
    db.add(dep)
    db.flush()

    # Base decision with evidence
    dec_postgres = Decision(
        id="dec-db-choice",
        project_id=project.id,
        component_id=comp_auth.id,
        title="Use PostgreSQL for Financial Ledger",
        reason="Relational transactions and strict ACID compliance needed for ledger auditing",
        status=DecisionStatus.EVIDENCE_SUPPORTED,
        source_id=doc_arch.id,
        evidence_quote="because relational transactions and strict ACID compliance are non-negotiable for financial auditing"
    )

    # Base decision missing reason
    dec_retry = Decision(
        id="dec-retry-limit",
        project_id=project.id,
        component_id=comp_pay.id,
        title="Set Payment Retry Limit to 3",
        reason=None,
        status=DecisionStatus.REASON_MISSING,
        source_id=doc_arch.id,
        evidence_quote="Decided to set payment retry limit to 3"
    )
    gap_retry = KnowledgeGap(
        id="gap-retry",
        project_id=project.id,
        component_id=comp_pay.id,
        decision_id=dec_retry.id,
        title="Missing Reason: Set Payment Retry Limit to 3",
        description="No reason given for retry limit 3",
        gap_type=GapType.MISSING_REASON,
        status=GapStatus.OPEN,
        question_to_departing="Why is the payment retry limit set to 3?"
    )
    db.add_all([dec_postgres, dec_retry, gap_retry])
    db.commit()

    yield db, project, manager, departing, incoming
    db.close()


def test_bug_1_ingestion_and_rehearsal(test_db):
    """
    Test Bug 1 Acceptance Criteria:
    - Ingest 'Missing Reason Sample': new gap appears and score drops
    - Ingest 'Document with Reason': decision shows as evidence-supported with source ID
    - Ingest GitHub commit text (Redis cache): new decision appears, 'Why Redis?' answers with citation
    """
    db, project, manager, departing, incoming = test_db

    initial_score = calculate_continuity_score(project.id, db)

    # 1. Ingest Missing Reason Sample
    missing_reason_doc = IngestRequest(
        title="Team Slack Export: Notification Polling Interval",
        source_type=SourceType.TASK_EXPORT,
        content="Departing Member: Decided to set notification polling interval to 15 seconds.",
        access_level=AccessLevel.RESTRICTED_TEAM
    )
    ingest_res_1 = ingest_project_source(project.id, missing_reason_doc, db, current_user=manager)
    assert len(ingest_res_1.knowledge_gaps_flagged) == 1
    assert ingest_res_1.decisions_extracted[0].status == DecisionStatus.REASON_MISSING

    score_after_missing = calculate_continuity_score(project.id, db)
    # Score drops because a new open gap was introduced
    assert score_after_missing.overall_score < initial_score.overall_score

    # 2. Ingest Document with Reason
    with_reason_doc = IngestRequest(
        title="ADR-003: Storage Engine Selection",
        source_type=SourceType.DOC,
        content="We decided to use AWS S3 for statement archiving because cold storage costs are 90% lower than primary disk storage.",
        access_level=AccessLevel.RESTRICTED_TEAM
    )
    ingest_res_2 = ingest_project_source(project.id, with_reason_doc, db, current_user=manager)
    assert len(ingest_res_2.decisions_extracted) == 1
    dec = ingest_res_2.decisions_extracted[0]
    assert dec.status == DecisionStatus.EVIDENCE_SUPPORTED
    assert dec.source_id is not None
    assert "90% lower" in dec.reason

    # 3. Ingest GitHub commit text (Redis cache)
    redis_commit = IngestRequest(
        title="git commit 88f2a1: Add Redis cache layer",
        source_type=SourceType.GITHUB_COMMIT,
        content="commit 88f2a1b9\nAuthor: Departing Member <departing.member@cairn.local>\n\nDecided to add Redis cache layer in front of PostgreSQL database. Reason: Cache merchant session tokens to reduce DB query pressure during peak trading hours.",
        access_level=AccessLevel.RESTRICTED_TEAM
    )
    ingest_res_3 = ingest_project_source(project.id, redis_commit, db, current_user=manager)
    assert len(ingest_res_3.decisions_extracted) == 1
    assert ingest_res_3.decisions_extracted[0].status == DecisionStatus.EVIDENCE_SUPPORTED

    # Rehearsal: Asking "Why Redis?" must answer with citation!
    ask_req = RehearsalAskRequest(project_id=project.id, question="Why Redis?")
    ask_res = ask_rehearsal_question(ask_req, db, current_user=incoming)
    assert ask_res.status == RehearsalStatus.ANSWERED_FROM_EVIDENCE
    assert ask_res.found_in_evidence is True
    assert len(ask_res.cited_source_ids) > 0
    assert "reduce DB query pressure" in ask_res.evidence_answer


def test_bug_2_approved_answers_reach_rehearsal(test_db):
    """
    Test Bug 2 Acceptance Criteria:
    - Before approval: 'Why is the payment retry limit set to 3?' returns PENDING_DEPARTING_REPLY.
    - Departing member answers and manager approves.
    - Rationale saved as evidence record with source ID and metadata.
    - Rehearsal searches approved evidence first and answers with citation and quote.
    """
    db, project, manager, departing, incoming = test_db

    # 1. Ask question before approval
    ask_req = RehearsalAskRequest(project_id=project.id, question="Why is the payment retry limit set to 3?")
    ask_res = ask_rehearsal_question(ask_req, db, current_user=incoming)
    assert ask_res.status == RehearsalStatus.PENDING_DEPARTING_REPLY
    assert ask_res.found_in_evidence is False

    # 2. Departing member replies
    reply_req = RehearsalReplyRequest(
        question_id=ask_res.rehearsal_question_id,
        reply_text="We capped retries at 3 because downstream Stripe API enforces strict rate limits on payment endpoints."
    )
    reply_res = reply_to_rehearsal_question(reply_req, db, current_user=departing)
    assert reply_res.status == RehearsalStatus.PENDING_REVIEW

    # 3. Manager approves
    review_req = RehearsalReviewRequest(
        question_id=ask_res.rehearsal_question_id,
        approved=True,
        manager_comment="Approved. Verified against payment gateway SLA."
    )
    review_res = review_rehearsal_reply(review_req, db, current_user=manager)
    assert review_res.status == RehearsalStatus.APPROVED_AS_EVIDENCE
    assert review_res.new_verified_source_id is not None

    # Check evidence record exists with metadata
    evidence_doc = db.query(SourceDocument).filter(SourceDocument.id == review_res.new_verified_source_id).first()
    assert evidence_doc is not None
    assert evidence_doc.doc_metadata.get("status") == "approved"
    assert "quote" in evidence_doc.doc_metadata

    # 4. Now ask question AGAIN: Rehearsal MUST find approved evidence first and return citation
    re_ask_res = ask_rehearsal_question(ask_req, db, current_user=incoming)
    assert re_ask_res.status == RehearsalStatus.ANSWERED_FROM_EVIDENCE
    assert re_ask_res.found_in_evidence is True
    assert review_res.new_verified_source_id in re_ask_res.cited_source_ids
    assert "rate limits" in re_ask_res.evidence_answer.lower()


def test_bug_3_score_plain_sum_and_no_100_with_spofs(test_db):
    """
    Test Bug 3 Acceptance Criteria:
    - Compute score as plain sum of the four factors.
    - Only show 100 when NO gaps remain, NO single points of failure remain, and ownership transferred.
    - Count only manager-approved answers, not submitted ones.
    """
    db, project, manager, departing, incoming = test_db

    score = calculate_continuity_score(project.id, db)
    expected_sum = round(
        score.evidence_coverage_score +
        score.ownership_clarity_score +
        score.dependency_doc_score +
        score.gap_penalty_score,
        2
    )
    assert score.overall_score == expected_sum

    # Departing member still owns Authentication Service and Payment Retry Worker (SPOF)
    assert score.overall_score < 100.0

    # Even if decisions are resolved, if SPOFs remain, score CANNOT be 100
    dec = db.query(Decision).filter(Decision.id == "dec-retry-limit").first()
    dec.status = DecisionStatus.EVIDENCE_SUPPORTED
    dec.reason = "Stripe limit"
    gap = db.query(KnowledgeGap).filter(KnowledgeGap.id == "gap-retry").first()
    gap.status = GapStatus.APPROVED_AS_EVIDENCE
    db.commit()

    score2 = calculate_continuity_score(project.id, db)
    # Since components are still owned by departing member (SPOFs exist), score must NOT be 100
    assert score2.overall_score < 100.0
    assert score2.overall_score <= 95.0

    # Now transfer ownership of all components to incoming member
    for comp in db.query(Component).filter(Component.project_id == project.id).all():
        comp.owner_id = incoming.id
    db.commit()

    score_100 = calculate_continuity_score(project.id, db)
    # Now that 0 gaps, 0 SPOFs, and ownership transferred:
    assert score_100.overall_score == 100.0
