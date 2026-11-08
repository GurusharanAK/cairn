"""
Cairn Synthetic Demonstration Seed Script
Implements the exact benchmark scenario from the system brief:
- 1 documented decision with evidence: "Use PostgreSQL" (Reason: "Relational transactions needed")
- 1 decision with no recorded reason: "Set Payment Retry Limit to 3" (reason=None, status="reason_missing")
- 1 hidden dependency: "Analytics Dashboard" -> "Authentication API" (is_hidden=True)
- 1 explainable failure record: "Stripe Webhook Concurrency Race Condition"
- 1 restricted source: "Q4 Engineering Compensation & Transition Budget" (access_level=RESTRICTED_MANAGER)
- 1 project, 1 manager, 1 departing member (Developer A), 1 successor (Developer B)
"""

from datetime import datetime
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, init_db
from app.models.models import (
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
    RehearsalStatus
)


def seed_synthetic_project(db: Session):
    print("Engaging Gravity Lock: Seeding Cairn Synthetic Project...")

    # 1. Seed Users (1 Manager, 1 Departing Member, 1 Incoming Successor)
    manager = User(
        id="usr-mgr-01",
        email="manager@cairn.local",
        full_name="Engineering Manager",
        role=UserRole.MANAGER
    )
    departing_member = User(
        id="usr-dev-a",
        email="departing.member@cairn.local",
        full_name="Departing Member",
        role=UserRole.DEPARTING_MEMBER
    )
    incoming_member = User(
        id="usr-dev-b",
        email="successor.member@cairn.local",
        full_name="Successor Member",
        role=UserRole.INCOMING_MEMBER
    )
    colleague_c = User(
        id="usr-dev-c",
        email="frontend.lead@cairn.local",
        full_name="Frontend Lead",
        role=UserRole.INCOMING_MEMBER
    )

    db.add_all([manager, departing_member, incoming_member, colleague_c])
    db.flush()

    # 2. Seed Single MVP Project
    project = Project(
        id="proj-cairn-mvp",
        name="FinTrack Core Banking Ledger",
        description="Core transaction processing, authentication, and analytics micro-monolith.",
        repository_url="https://github.com/cairn-continuity/fintrack-core",
        manager_id=manager.id,
        departing_member_id=departing_member.id,
        incoming_member_id=incoming_member.id
    )
    db.add(project)
    db.flush()

    # 3. Seed Authorized Source Documents
    doc_arch = SourceDocument(
        id="src-doc-arch-01",
        project_id=project.id,
        title="Architecture Decision Record 001 - Database Selection",
        source_type=SourceType.DOC,
        content=(
            "We decided to use PostgreSQL for our ledger because relational transactions "
            "and strict ACID compliance are non-negotiable for financial auditing. "
            "MongoDB was evaluated and rejected due to lack of multi-document distributed transaction guarantees."
        ),
        access_level=AccessLevel.RESTRICTED_TEAM,
        created_by_id=departing_member.id,
        doc_metadata={"file_hash": "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"}
    )

    doc_git = SourceDocument(
        id="src-git-commit-42",
        project_id=project.id,
        title="git commit 42a9fb: Add payment retry loop",
        source_type=SourceType.GITHUB_COMMIT,
        content=(
            "commit 42a9fb7c211\n"
            "Author: Departing Member <departing.member@cairn.local>\n"
            "Date: 2026-10-01\n\n"
            "Decided to set payment retry limit to 3. Wrapped process_payment() inside retry handler."
        ),
        access_level=AccessLevel.RESTRICTED_TEAM,
        created_by_id=departing_member.id,
        doc_metadata={"commit_sha": "42a9fb7c211", "branch": "main"}
    )

    doc_restricted = SourceDocument(
        id="src-doc-budget-restricted",
        project_id=project.id,
        title="Q4 Engineering Compensation & Handover Retention Plan",
        source_type=SourceType.DOC,
        content="Confidential manager retention bonus allocations and handover severance schedule.",
        access_level=AccessLevel.RESTRICTED_MANAGER,
        created_by_id=manager.id,
        doc_metadata={"classification": "CONFIDENTIAL_HR"}
    )

    db.add_all([doc_arch, doc_git, doc_restricted])
    db.flush()

    # 4. Seed Components (Strict source_id attribution)
    comp_auth = Component(
        id="comp-auth-api",
        project_id=project.id,
        name="Authentication Service",
        description="JWT token issuer, OAuth validation, and API session router.",
        owner_id=departing_member.id,
        source_id=doc_arch.id,
        status=ComponentStatus.ACTIVE
    )

    comp_payment = Component(
        id="comp-payment-retry",
        project_id=project.id,
        name="Payment Retry Worker",
        description="Background task queue retrying idempotent gateway requests.",
        owner_id=departing_member.id,
        source_id=doc_git.id,
        status=ComponentStatus.ACTIVE
    )

    comp_dash = Component(
        id="comp-dashboard",
        project_id=project.id,
        name="Analytics Dashboard",
        description="Frontend executive reporting widget displaying cash flow metrics.",
        owner_id=colleague_c.id,
        source_id=doc_arch.id,
        status=ComponentStatus.ACTIVE
    )

    db.add_all([comp_auth, comp_payment, comp_dash])
    db.flush()

    # 5. Seed Decisions (INVARIANT 1: Zero-Hallucination Mandate)
    # Decision 1: Evidence Supported (Reason explicitly documented)
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

    # Decision 2: Reason Missing (Documented choice, but NO rationale recorded in source)
    dec_retry = Decision(
        id="dec-retry-limit",
        project_id=project.id,
        component_id=comp_payment.id,
        title="Set Payment Retry Limit to 3",
        reason=None,  # STRICT INVARIANT: null reason
        status=DecisionStatus.REASON_MISSING,
        source_id=doc_git.id,
        evidence_quote="Decided to set payment retry limit to 3"
    )

    db.add_all([dec_postgres, dec_retry])
    db.flush()

    # 6. Seed Dependencies (1 Documented, 1 Hidden Tacit Link)
    dep_visible = Dependency(
        id="dep-payment-auth",
        project_id=project.id,
        source_component_id=comp_payment.id,
        target_component_id=comp_auth.id,
        dependency_type=DependencyType.CALLS_API,
        description="Payment worker queries Auth service to validate merchant credentials.",
        is_hidden=False,
        source_id=doc_arch.id
    )

    # Hidden dependency: Dashboard quietly relies on undocumented internal Auth API session endpoint
    dep_hidden = Dependency(
        id="dep-dash-auth-hidden",
        project_id=project.id,
        source_component_id=comp_dash.id,
        target_component_id=comp_auth.id,
        dependency_type=DependencyType.CALLS_API,
        description="Dashboard calls private /internal/auth/session endpoint without public API contract.",
        is_hidden=True,
        source_id=doc_git.id
    )

    db.add_all([dep_visible, dep_hidden])
    db.flush()

    # 7. Seed Explainable Failure Record
    failure_stripe = FailureRecord(
        id="fail-rec-01",
        project_id=project.id,
        component_id=comp_payment.id,
        title="Stripe Webhook Concurrency Race Condition",
        error_message="HTTP 409 Conflict: Concurrent charge updates caused double capture.",
        attempted_fix="Added redis distributed lock on charge.id key before processing webhook event.",
        resolution="Resolved: Lock TTL set to 5000ms with retry backoff.",
        is_resolved=True,
        source_id=doc_git.id
    )
    db.add(failure_stripe)
    db.flush()

    # 8. Seed Automatically Detected Knowledge Gaps
    gap_reason = KnowledgeGap(
        id="gap-missing-retry-reason",
        project_id=project.id,
        component_id=comp_payment.id,
        decision_id=dec_retry.id,
        title="Missing Reason: Set Payment Retry Limit to 3",
        description="Payment Retry Worker limits retries to 3, but neither commit 42a9fb nor ADRs explain why 3 was chosen.",
        gap_type=GapType.MISSING_REASON,
        status=GapStatus.OPEN,
        question_to_departing="Why is the payment retry limit set to 3? What upstream timeout or rate limit influenced this?"
    )

    gap_hidden_dep = KnowledgeGap(
        id="gap-hidden-dashboard-auth",
        project_id=project.id,
        component_id=comp_dash.id,
        title="Hidden Dependency: Analytics Dashboard -> Authentication API",
        description="The Analytics Dashboard calls undocumented internal Auth session endpoint.",
        gap_type=GapType.HIDDEN_DEPENDENCY,
        status=GapStatus.OPEN,
        question_to_departing="What is the internal Auth session payload schema required by the Dashboard?"
    )

    db.add_all([gap_reason, gap_hidden_dep])
    db.commit()

    print("Synthetic Demonstration Seed Loaded Successfully:")
    print(f"- Project: {project.name} ({project.id})")
    print(f"- Manager: {manager.full_name}")
    print(f"- Departing Member: {departing_member.full_name}")
    print(f"- Successor: {incoming_member.full_name}")
    print(f"- Components: 3, Decisions: 2 (1 with evidence, 1 reason_missing)")
    print(f"- Dependencies: 2 (1 explicit, 1 hidden)")
    print(f"- Knowledge Gaps: 2 open critical gaps")


if __name__ == "__main__":
    from app.db.database import engine, Base
    Base.metadata.drop_all(bind=engine)
    init_db()
    db = SessionLocal()
    try:
        seed_synthetic_project(db)
    finally:
        db.close()

