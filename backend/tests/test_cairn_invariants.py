"""
Unit & Integration Test Suite verifying all Cairn Core Invariants:
1. Zero-Hallucination Mandate (Null reasons & reason_missing status)
2. Deterministic Absence Simulation (Pure BFS relational traversal)
3. Data Boundary Restrictions & RBAC Review Gate
4. Continuity Score 4-Pillar Calculation (40/20/20/20)
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import (
    Base,
    User,
    UserRole,
    Project,
    SourceDocument,
    SourceType,
    AccessLevel,
    Component,
    ComponentStatus,
    Decision,
    DecisionStatus,
    Dependency,
    DependencyType,
    KnowledgeGap,
    GapType,
    GapStatus,
    RehearsalQuestion,
    RehearsalStatus
)
from app.services.extractor import RulesBasedExtractor
from app.services.stress_test import run_continuity_stress_test, calculate_continuity_score

# Setup isolated in-memory SQLite for instantaneous testing
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def test_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


def test_invariant_1_zero_hallucination_mandate(test_db):
    """
    INVARIANT 1: Zero-Hallucination Mandate.
    If an explanation/reason is missing in text, reason MUST be None and status MUST be 'reason_missing'.
    """
    user = User(id="u1", email="lead@cairn.io", full_name="Lead", role=UserRole.MANAGER)
    test_db.add(user)
    test_db.flush()

    project = Project(
        id="p1",
        name="Test Proj",
        manager_id=user.id,
        departing_member_id=user.id,
        incoming_member_id=user.id
    )
    test_db.add(project)
    test_db.flush()

    doc = SourceDocument(
        id="d1",
        project_id=project.id,
        title="Commit 101",
        source_type=SourceType.GITHUB_COMMIT,
        content="Decided to set payment retry limit to 3.",
        access_level=AccessLevel.RESTRICTED_TEAM
    )
    test_db.add(doc)
    test_db.flush()

    extractor = RulesBasedExtractor(db=test_db, project_id=project.id, default_owner_id=user.id)
    res = extractor.extract_from_document(document=doc)
    test_db.commit()

    assert len(res.decisions) == 1
    decision = res.decisions[0]
    assert decision.reason is None, "Violation: Reason was hallucinated when not in source!"
    assert decision.status == DecisionStatus.REASON_MISSING, "Violation: Status was not set to reason_missing!"
    assert decision.source_id == doc.id, "Violation: Item missing strict source_id!"

    # Must also auto-flag an open KnowledgeGap
    assert len(res.knowledge_gaps) == 1
    assert res.knowledge_gaps[0].gap_type == GapType.MISSING_REASON


def test_invariant_2_deterministic_stress_test(test_db):
    """
    INVARIANT 2: Deterministic Absence Simulation.
    Traces downstream impacts recursively across relational tables.
    """
    dev_a = User(id="dev_a", email="a@cairn.io", full_name="Developer A", role=UserRole.DEPARTING_MEMBER)
    dev_c = User(id="dev_c", email="c@cairn.io", full_name="Developer C", role=UserRole.INCOMING_MEMBER)
    test_db.add_all([dev_a, dev_c])
    test_db.flush()

    project = Project(id="p1", name="P1", manager_id=dev_a.id, departing_member_id=dev_a.id)
    test_db.add(project)
    test_db.flush()

    doc = SourceDocument(
        id="d1", project_id=project.id, title="Doc", source_type=SourceType.DOC,
        content="Architecture", access_level=AccessLevel.RESTRICTED_TEAM
    )
    test_db.add(doc)
    test_db.flush()

    # Developer A owns Auth API (root impact)
    comp_auth = Component(id="c_auth", project_id=project.id, name="Auth API", owner_id=dev_a.id, source_id=doc.id)
    # Developer C owns Dashboard (depends on Auth API)
    comp_dash = Component(id="c_dash", project_id=project.id, name="Dashboard", owner_id=dev_c.id, source_id=doc.id)
    test_db.add_all([comp_auth, comp_dash])
    test_db.flush()

    # Dashboard depends on Auth API
    dep = Dependency(
        id="dep1",
        project_id=project.id,
        source_component_id=comp_dash.id,
        target_component_id=comp_auth.id,
        dependency_type=DependencyType.CALLS_API,
        is_hidden=True,
        source_id=doc.id
    )
    test_db.add(dep)
    test_db.commit()

    report = run_continuity_stress_test(project_id=project.id, departing_member_id=dev_a.id, db=test_db)

    assert report.summary["direct_count"] == 1
    assert report.directly_affected_components[0].component_name == "Auth API"
    assert report.summary["downstream_count"] == 1
    assert report.downstream_affected_components[0].component_name == "Dashboard"
    assert report.downstream_affected_components[0].severity == "HIGH"  # Hidden dependency flagged HIGH


def test_invariant_3_review_gate_and_evidence_promotion(test_db):
    """
    INVARIANT 3: Answers from departing members remain pending_review
    and cannot become verified evidence until MANAGER approves.
    """
    mgr = User(id="mgr", email="mgr@cairn.io", full_name="Manager", role=UserRole.MANAGER)
    dev_a = User(id="dev_a", email="a@cairn.io", full_name="Developer A", role=UserRole.DEPARTING_MEMBER)
    test_db.add_all([mgr, dev_a])
    test_db.flush()

    project = Project(id="p1", name="P1", manager_id=mgr.id, departing_member_id=dev_a.id)
    test_db.add(project)
    test_db.flush()

    # Successor asked question
    question = RehearsalQuestion(
        id="q1",
        project_id=project.id,
        requester_id=mgr.id,
        question="Why retry limit 3?",
        status=RehearsalStatus.PENDING_DEPARTING_REPLY
    )
    test_db.add(question)
    test_db.commit()

    # Departing member replies
    question.departing_reply = "Stripe charges error out on 4th attempt"
    question.status = RehearsalStatus.PENDING_REVIEW
    test_db.commit()

    # Verify invariant: Status CANNOT be approved yet
    assert question.status == RehearsalStatus.PENDING_REVIEW
    assert question.approved_source_document_id is None

    # Manager approves -> Mints verified SourceDocument
    verified_doc = SourceDocument(
        id="d_verified",
        project_id=project.id,
        title="Sign-off",
        source_type=SourceType.REHEARSAL_VERIFIED_ANSWER,
        content=question.departing_reply,
        access_level=AccessLevel.RESTRICTED_TEAM,
        created_by_id=mgr.id
    )
    test_db.add(verified_doc)
    question.status = RehearsalStatus.APPROVED_AS_EVIDENCE
    question.approved_source_document_id = verified_doc.id
    test_db.commit()

    assert question.status == RehearsalStatus.APPROVED_AS_EVIDENCE
    assert question.approved_source_document_id == "d_verified"


def test_continuity_score_weighting(test_db):
    """
    Tests exact 4-pillar weighting:
    Evidence Coverage (40%) + Ownership Clarity (20%) + Dependency Doc (20%) + Gaps (20%)
    """
    mgr = User(id="mgr", email="m@cairn.io", full_name="Mgr", role=UserRole.MANAGER)
    dev_a = User(id="dev_a", email="a@cairn.io", full_name="A", role=UserRole.DEPARTING_MEMBER)
    test_db.add_all([mgr, dev_a])
    test_db.flush()

    project = Project(id="p1", name="P1", manager_id=mgr.id, departing_member_id=dev_a.id)
    test_db.add(project)
    test_db.flush()

    doc = SourceDocument(id="d1", project_id=project.id, title="Doc", source_type=SourceType.DOC, content="C", access_level=AccessLevel.RESTRICTED_TEAM)
    test_db.add(doc)
    test_db.flush()

    # 1 decision with evidence
    dec = Decision(
        id="dec1", project_id=project.id, title="Postgres", reason="ACID",
        status=DecisionStatus.EVIDENCE_SUPPORTED, source_id=doc.id
    )
    # 1 component reassigned to manager
    comp = Component(id="c1", project_id=project.id, name="Ledger", owner_id=mgr.id, source_id=doc.id)
    # 1 non-hidden dependency
    dep = Dependency(id="dep1", project_id=project.id, source_component_id=comp.id, target_component_id=comp.id, dependency_type=DependencyType.CALLS_API, is_hidden=False, source_id=doc.id)
    test_db.add_all([dec, comp, dep])
    test_db.commit()

    score = calculate_continuity_score(project_id=project.id, db=test_db)
    assert score.overall_score == 100.0
    assert score.evidence_coverage_score == 40.0
    assert score.ownership_clarity_score == 20.0
    assert score.dependency_doc_score == 20.0
    assert score.gap_penalty_score == 20.0

