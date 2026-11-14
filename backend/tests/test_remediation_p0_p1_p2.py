import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import get_db
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
    FailureRecord,
    KnowledgeGap,
    GapType,
    GapStatus,
    RehearsalQuestion,
    RehearsalStatus,
    ApprovalAuditLog,
)
from app.seeds.seed_demo_data import seed_synthetic_project
from app.services.extractor import RulesBasedExtractor
from app.services.stress_test import run_continuity_stress_test, calculate_continuity_score
from app.api.rehearsal import (
    ask_rehearsal_question,
    reply_to_rehearsal_question,
    review_rehearsal_reply,
    RehearsalAskRequest,
    RehearsalReplyRequest,
    RehearsalReviewRequest,
)


@pytest.fixture
def client_and_db():
    """Shared in-memory SQLite engine for full FastAPI TestClient integration testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    seed_synthetic_project(db)

    # Seed an extra component, failure, and gap exclusively backed by RESTRICTED_MANAGER doc
    mgr_restricted_comp = Component(
        id="comp-hr-payroll-secret",
        project_id="proj-cairn-mvp",
        name="Executive Comp Engine",
        owner_id="usr-dev-a",
        source_id="src-doc-budget-restricted",
        status=ComponentStatus.ACTIVE,
    )
    mgr_restricted_fail = FailureRecord(
        id="fail-hr-secret",
        project_id="proj-cairn-mvp",
        component_id="comp-hr-payroll-secret",
        title="Executive Payroll Lockout",
        error_message="Restricted KMS key rotation mismatch",
        attempted_fix="Rotate executive HSM key manually",
        resolution="Resolved via manager KMS vault",
        source_id="src-doc-budget-restricted",
    )
    mgr_restricted_dec = Decision(
        id="dec-hr-restricted",
        project_id="proj-cairn-mvp",
        component_id="comp-hr-payroll-secret",
        title="Keep Vendor Negotiation Thresholds Manager-Only",
        reason="Q3 infrastructure scaling budget cap of $45k/month.",
        status=DecisionStatus.EVIDENCE_SUPPORTED,
        source_id="src-doc-budget-restricted",
        evidence_quote="Q3 infrastructure scaling budget cap of $45k/month.",
    )
    mgr_restricted_gap = KnowledgeGap(
        id="gap-hr-restricted",
        project_id="proj-cairn-mvp",
        component_id="comp-hr-payroll-secret",
        decision_id="dec-hr-restricted",
        title="Restricted Vendor SLA Signoff",
        description="Restricted manager-only vendor SLA review.",
        gap_type=GapType.TACIT_KNOWLEDGE,
        status=GapStatus.OPEN,
    )
    db.add_all([mgr_restricted_comp, mgr_restricted_fail, mgr_restricted_dec, mgr_restricted_gap])
    db.commit()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, db
    app.dependency_overrides.clear()
    db.close()


@pytest.fixture
def isolated_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    seed_synthetic_project(db)
    yield db
    db.close()


# ==============================================================================
# P0 1.2: RESTRICTED DOCUMENT FILTERING ACROSS ALL READ ENDPOINTS
# ==============================================================================
def test_restricted_document_filtering_across_read_endpoints(client_and_db):
    client, _ = client_and_db

    # Authenticate as Incoming Member and Manager using signed tokens
    inc_login = client.post("/api/auth/login", json={"user_id": "usr-dev-b"})
    assert inc_login.status_code == 200
    inc_headers = {"Authorization": f"Bearer {inc_login.json()['access_token']}"}

    mgr_login = client.post("/api/auth/login", json={"user_id": "usr-mgr-01"})
    assert mgr_login.status_code == 200
    mgr_headers = {"Authorization": f"Bearer {mgr_login.json()['access_token']}"}

    # 1. GET /knowledge-model
    inc_km = client.get("/api/projects/proj-cairn-mvp/knowledge-model", headers=inc_headers)
    mgr_km = client.get("/api/projects/proj-cairn-mvp/knowledge-model", headers=mgr_headers)
    assert inc_km.status_code == 200
    assert mgr_km.status_code == 200

    inc_km_data = inc_km.json()
    mgr_km_data = mgr_km.json()

    assert all(d["source_id"] != "src-doc-budget-restricted" for d in inc_km_data["decisions"])
    assert all(c["source_id"] != "src-doc-budget-restricted" for c in inc_km_data["components"])
    assert all(f["source_id"] != "src-doc-budget-restricted" for f in inc_km_data["failures"])
    assert all(doc["id"] != "src-doc-budget-restricted" for doc in inc_km_data["documents"])

    assert any(d["source_id"] == "src-doc-budget-restricted" for d in mgr_km_data["decisions"])
    assert any(c["source_id"] == "src-doc-budget-restricted" for c in mgr_km_data["components"])

    # 2. GET /handover-packet
    inc_pkt = client.get("/api/projects/proj-cairn-mvp/handover-packet", headers=inc_headers).json()
    mgr_pkt = client.get("/api/projects/proj-cairn-mvp/handover-packet", headers=mgr_headers).json()

    assert all(c["source_id"] != "src-doc-budget-restricted" for c in inc_pkt["components"])
    assert all(d["source_id"] != "src-doc-budget-restricted" for d in inc_pkt["verified_decisions"])
    assert all(f["source_id"] != "src-doc-budget-restricted" for f in inc_pkt["resolved_failure_playbooks"])
    assert all(item["title"] != "Restricted Vendor SLA Signoff" for item in inc_pkt["open_attention_items"])

    assert any(c["source_id"] == "src-doc-budget-restricted" for c in mgr_pkt["components"])
    assert any(item["title"] == "Restricted Vendor SLA Signoff" for item in mgr_pkt["open_attention_items"])

    # 3. GET /readiness/scenarios
    inc_scen = client.get("/api/projects/proj-cairn-mvp/readiness/scenarios", headers=inc_headers).json()
    mgr_scen = client.get("/api/projects/proj-cairn-mvp/readiness/scenarios", headers=mgr_headers).json()

    assert all("src-doc-budget-restricted" not in s["critical_evidence_cited"] for s in inc_scen)
    assert any("src-doc-budget-restricted" in s["critical_evidence_cited"] for s in mgr_scen)


# ==============================================================================
# P1 2.1: HMAC-SHA256 TOKEN AUTH & FORGED CREDENTIAL REJECTION
# ==============================================================================
def test_signed_token_auth_and_forged_credential_rejection(client_and_db):
    client, _ = client_and_db

    # 1. Missing credentials rejected with 401
    assert client.get("/api/projects/proj-cairn-mvp/knowledge-model").status_code == 401

    # 2. Forged X-User-ID rejected with 401
    assert client.get(
        "/api/projects/proj-cairn-mvp/knowledge-model",
        headers={"X-User-ID": "usr-hacker-forged"},
    ).status_code == 401

    # 3. Login for forged user rejected with 401; role escalation rejected with 403
    assert client.post("/api/auth/login", json={"user_id": "usr-nonexistent"}).status_code == 401
    assert client.post("/api/auth/login", json={"user_id": "usr-dev-b", "role": "MANAGER"}).status_code == 403

    # 4. Valid login issues HMAC-SHA256 Bearer token; tampered signature rejected with 401
    login_res = client.post("/api/auth/token", json={"user_id": "usr-dev-b"})
    assert login_res.status_code == 200
    valid_token = login_res.json()["access_token"]
    payload_part, sig_part = valid_token.split(".")
    tampered_sig = ("A" if sig_part[0] != "A" else "B") + sig_part[1:]
    tampered_token = f"{payload_part}.{tampered_sig}"

    assert client.get(
        "/api/projects/proj-cairn-mvp/knowledge-model",
        headers={"Authorization": f"Bearer {tampered_token}"},
    ).status_code == 401

    assert client.get(
        "/api/projects/proj-cairn-mvp/knowledge-model",
        headers={"Authorization": f"Bearer {valid_token}"},
    ).status_code == 200


# ==============================================================================
# P1 2.2: VERBATIM QUOTE VERIFICATION, CODE IMPORTS, FILE & GITHUB INGESTION
# ==============================================================================
def test_verbatim_quote_verification_rejects_fabricated_quote(isolated_db):
    db = isolated_db
    doc = SourceDocument(
        id="src-verbatim-check",
        project_id="proj-cairn-mvp",
        title="Cache Architecture Spec",
        source_type=SourceType.DOC,
        content="We use Redis cluster in sentinel mode for high availability across AZs.",
        access_level=AccessLevel.RESTRICTED_TEAM,
    )
    db.add(doc)
    db.flush()

    extractor = RulesBasedExtractor(db=db, project_id="proj-cairn-mvp", default_owner_id="usr-dev-a")
    res = extractor.extract_from_document(
        document=doc,
        structured_payload={
            "decisions": [
                {
                    "title": "Use Redis Sentinel",
                    "reason": "Fabricated SLA claim of 99.99999%",
                    "evidence_quote": "This exact sentence does NOT appear anywhere in raw document content",
                },
                {
                    "title": "Sentinel HA Mode",
                    "reason": "High availability across AZs",
                    "evidence_quote": "We use   Redis cluster in sentinel mode\nfor high availability across AZs.",
                },
            ]
        },
    )
    db.commit()

    fabricated = next(d for d in res.decisions if d.title == "Use Redis Sentinel")
    verified = next(d for d in res.decisions if d.title == "Sentinel HA Mode")

    assert fabricated.status == DecisionStatus.UNVERIFIED
    assert fabricated.reason is None
    assert fabricated.evidence_quote is None
    assert any(g.gap_type == GapType.UNVERIFIED_ASSUMPTION and g.decision_id == fabricated.id for g in res.knowledge_gaps)

    # Whitespace-normalized verbatim match succeeds
    assert verified.status == DecisionStatus.EVIDENCE_SUPPORTED
    assert verified.evidence_quote is not None


def test_code_imports_and_file_github_ingest_endpoints(client_and_db):
    client, _ = client_and_db
    mgr_token = client.post("/api/auth/login", json={"user_id": "usr-mgr-01"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {mgr_token}"}

    # 1. File upload ingestion with Python imports + SERVICE_URL config dependency
    py_content = (
        b"from billing_core.ledger import post_entry\n"
        b"import fraud_detector\n"
        b"SETTLEMENT_SERVICE_URL = https://settlement.internal:8443\n"
        b"Decided to batch ledger settlement because throughput improved by 4x.\n"
    )
    file_res = client.post(
        "/api/projects/proj-cairn-mvp/ingest/file",
        headers=headers,
        files={"file": ("worker.py", py_content, "text/plain")},
        data={"access_level": "RESTRICTED_TEAM"},
    )
    assert file_res.status_code == 201
    file_body = file_res.json()
    assert file_body["summary"]["dependencies_count"] >= 3
    assert any(d["dependency_type"] == "CODE_IMPORT" for d in file_body["dependencies_extracted"])
    assert any(d["dependency_type"] == "CONFIG_DEPENDENCY" for d in file_body["dependencies_extracted"])
    assert file_body["summary"]["evidence_supported_decisions"] == 1

    # 2. GitHub exported commits ingestion
    gh_res = client.post(
        "/api/projects/proj-cairn-mvp/ingest/github",
        headers=headers,
        json={
            "title": "GitHub Export Batch",
            "commits": [
                {
                    "sha": "99aa11b",
                    "author": "dev-a",
                    "message": "Decided to compress audit archive payloads because S3 egress fees dropped 60%.",
                }
            ],
        },
    )
    assert gh_res.status_code == 201
    assert gh_res.json()["summary"]["evidence_supported_decisions"] == 1


# ==============================================================================
# P1 2.3 & P2 3.1: QUESTION DEDUPLICATION, DIRECT GAP LINKING & AUDIT LOG
# ==============================================================================
def test_rehearsal_deduplication_and_immutable_audit_log(isolated_db):
    db = isolated_db
    successor = db.query(User).filter(User.id == "usr-dev-b").first()
    departing = db.query(User).filter(User.id == "usr-dev-a").first()
    manager = db.query(User).filter(User.id == "usr-mgr-01").first()

    # Baseline exact FinTrack score
    initial_score = calculate_continuity_score("proj-cairn-mvp", db)
    assert initial_score.overall_score == 54.67

    # 1. Ask open question directly linked to gap-retry-limit -> ask duplicate phrasing -> returns same ID
    q1 = ask_rehearsal_question(
        RehearsalAskRequest(
            project_id="proj-cairn-mvp",
            question="Can you explain why the retry threshold is 3?",
            knowledge_gap_id="gap-retry-limit",
        ),
        db=db,
        current_user=successor,
    )
    q1_dup = ask_rehearsal_question(
        RehearsalAskRequest(
            project_id="proj-cairn-mvp",
            question="Can you explain   why the retry threshold is 3?",
        ),
        db=db,
        current_user=successor,
    )
    assert q1.rehearsal_question_id == q1_dup.rehearsal_question_id
    open_count = db.query(RehearsalQuestion).filter(
        RehearsalQuestion.project_id == "proj-cairn-mvp",
        RehearsalQuestion.question.ilike("%retry threshold is 3%"),
    ).count()
    assert open_count == 1

    # 2. Departing member replies; Manager rejects first -> Audit log records rejection
    reply_to_rehearsal_question(
        RehearsalReplyRequest(question_id=q1.rehearsal_question_id, reply_text="Guessing 3."),
        db=db,
        current_user=departing,
    )
    review_rehearsal_reply(
        RehearsalReviewRequest(
            question_id=q1.rehearsal_question_id,
            approved=False,
            manager_comment="Needs exact Stripe error code.",
        ),
        db=db,
        current_user=manager,
    )

    # 3. Departing member updates reply; Manager approves -> Audit log appends immutable approval + resolves gap deterministically -> score rises to 72.67
    reply_to_rehearsal_question(
        RehearsalReplyRequest(
            question_id=q1.rehearsal_question_id,
            reply_text="Stripe raises HTTP 409 idempotent charge conflict on attempt 4 within 60 seconds.",
        ),
        db=db,
        current_user=departing,
    )
    rev_ok = review_rehearsal_reply(
        RehearsalReviewRequest(
            question_id=q1.rehearsal_question_id,
            approved=True,
            manager_comment="Verified against Stripe production logs.",
        ),
        db=db,
        current_user=manager,
    )
    assert rev_ok.status == RehearsalStatus.APPROVED_AS_EVIDENCE
    assert rev_ok.new_verified_source_id is not None

    audit_entries = (
        db.query(ApprovalAuditLog)
        .filter(ApprovalAuditLog.question_id == q1.rehearsal_question_id)
        .order_by(ApprovalAuditLog.created_at.asc())
        .all()
    )
    assert len(audit_entries) == 2
    assert audit_entries[0].action == "rejected"
    assert audit_entries[0].minted_source_id is None
    assert audit_entries[1].action == "approved"
    assert audit_entries[1].minted_source_id == rev_ok.new_verified_source_id
    assert audit_entries[1].reviewer_id == manager.id

    post_score = calculate_continuity_score("proj-cairn-mvp", db)
    assert post_score.overall_score == 72.67


# ==============================================================================
# P2 3.2: 3+ HOP BFS DEPENDENCY CASCADE TRACE
# ==============================================================================
def test_multihop_three_hop_bfs_cascade(client_and_db):
    client, db = client_and_db
    pre_score = calculate_continuity_score("proj-cairn-mvp", db).overall_score

    # 1. Verify simulated non-destructive 3-hop endpoint preserves baseline and returns 3 hops
    mgr_token = client.post("/api/auth/login", json={"user_id": "usr-mgr-01"}).json()["access_token"]
    sim_res = client.post(
        "/api/projects/proj-cairn-mvp/stress-test/simulate-multihop",
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert sim_res.status_code == 200
    report = sim_res.json()

    assert report["summary"]["max_cascade_depth"] >= 3
    downstream = {item["component_name"]: item for item in report["downstream_affected_components"]}

    hop1 = downstream["Payment Gateway"]
    hop2 = downstream["Settlement Ledger"]
    hop3 = downstream["Compliance Audit Exporter"]

    assert hop1["dependency_depth"] == 1
    assert hop1["direct_dependency_path"] == ["Auth Token Core", "Payment Gateway"]
    assert hop1["severity"] == "MEDIUM"

    assert hop2["dependency_depth"] == 2
    assert hop2["direct_dependency_path"] == ["Auth Token Core", "Payment Gateway", "Settlement Ledger"]
    assert hop2["severity"] == "LOW"

    assert hop3["dependency_depth"] == 3
    assert hop3["impact_type"] == "CASCADE_BLOCKED"
    assert hop3["direct_dependency_path"] == [
        "Auth Token Core",
        "Payment Gateway",
        "Settlement Ledger",
        "Compliance Audit Exporter",
    ]
    assert hop3["severity"] == "HIGH"  # hidden config dependency at depth 3

    # Ensure project continuity score wasn't mutated by simulation
    assert calculate_continuity_score("proj-cairn-mvp", db).overall_score == pre_score
