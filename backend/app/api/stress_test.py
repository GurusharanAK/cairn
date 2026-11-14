from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.security import get_current_user, verify_project_access
from app.models.models import (
    User,
    UserRole,
    Project,
    SourceDocument,
    SourceType,
    AccessLevel,
    Component,
    ComponentStatus,
    Dependency,
    DependencyType,
)
from app.services.stress_test import (
    run_continuity_stress_test,
    calculate_continuity_score,
    StressTestReport,
    ContinuityScoreBreakdown
)

router = APIRouter(prefix="/api/projects", tags=["Stress Test & Scoring"])


@router.get(
    "/{id}/stress-test",
    response_model=StressTestReport,
    summary="Execute deterministic Continuity Stress Test simulating departing member's absence"
)
def get_project_stress_test(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    INVARIANT 2: Deterministic Logic.
    Simulates the departure of the assigned departing member by recursively traversing
    relational component dependencies. No graph databases or LLM guessing.
    """
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    
    if not project.departing_member_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project does not have an assigned departing member."
        )

    report = run_continuity_stress_test(
        project_id=project.id,
        departing_member_id=project.departing_member_id,
        db=db
    )
    return report


@router.get(
    "/{id}/continuity-score",
    response_model=ContinuityScoreBreakdown,
    summary="Calculate explainable 0-100 Continuity Score"
)
def get_project_continuity_score(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Computes explainable 0-100 score weighted by:
    - Evidence Coverage (40%)
    - Ownership Clarity (20%)
    - Dependency Documentation (20%)
    - Open Critical Gaps (20%)
    """
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    score_breakdown = calculate_continuity_score(project_id=project.id, db=db)
    return score_breakdown


@router.post(
    "/{id}/stress-test/simulate-multihop",
    response_model=StressTestReport,
    summary="Run a deterministic 3+ hop dependency cascade stress-test template without mutating baseline metrics"
)
def simulate_multihop_stress_test(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Non-destructive 3+ hop BFS dependency cascade template:
    Creates a 4-node banking microservice chain (Depth 0 -> 1 -> 2 -> 3) in an ephemeral
    savepoint/nested transaction, executes the production deterministic BFS stress-test
    engine (`run_continuity_stress_test`), and rolls back the savepoint so the seeded
    FinTrack baseline (54.67 -> 72.67) remains untouched.
    """
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    departing_id = project.departing_member_id or current_user.id
    incoming_id = project.incoming_member_id or current_user.id

    nested = db.begin_nested()
    try:
        sim_project = Project(
            id=f"{project.id}-multihop-sim",
            name=f"{project.name} (3-Hop Cascade Simulation)",
            manager_id=project.manager_id,
            departing_member_id=departing_id,
            incoming_member_id=incoming_id,
        )
        db.add(sim_project)
        db.flush()

        sim_doc = SourceDocument(
            id=f"src-multihop-{project.id}",
            project_id=sim_project.id,
            title="Multi-Hop Architecture Topology Spec",
            source_type=SourceType.DOC,
            content="Auth Token Core -> Payment Gateway -> Settlement Ledger -> Compliance Audit Exporter",
            access_level=AccessLevel.RESTRICTED_TEAM,
            created_by_id=current_user.id,
        )
        db.add(sim_doc)
        db.flush()

        c0 = Component(
            id="sim-comp-0",
            project_id=sim_project.id,
            name="Auth Token Core",
            owner_id=departing_id,
            source_id=sim_doc.id,
            status=ComponentStatus.ACTIVE,
        )
        c1 = Component(
            id="sim-comp-1",
            project_id=sim_project.id,
            name="Payment Gateway",
            owner_id=incoming_id,
            source_id=sim_doc.id,
            status=ComponentStatus.ACTIVE,
        )
        c2 = Component(
            id="sim-comp-2",
            project_id=sim_project.id,
            name="Settlement Ledger",
            owner_id=incoming_id,
            source_id=sim_doc.id,
            status=ComponentStatus.ACTIVE,
        )
        c3 = Component(
            id="sim-comp-3",
            project_id=sim_project.id,
            name="Compliance Audit Exporter",
            owner_id=incoming_id,
            source_id=sim_doc.id,
            status=ComponentStatus.ACTIVE,
        )
        db.add_all([c0, c1, c2, c3])
        db.flush()

        deps = [
            Dependency(
                id="sim-dep-1",
                project_id=sim_project.id,
                source_component_id=c1.id,
                target_component_id=c0.id,
                dependency_type=DependencyType.CALLS_API,
                is_hidden=False,
                source_id=sim_doc.id,
            ),
            Dependency(
                id="sim-dep-2",
                project_id=sim_project.id,
                source_component_id=c2.id,
                target_component_id=c1.id,
                dependency_type=DependencyType.CALLS_API,
                is_hidden=False,
                source_id=sim_doc.id,
            ),
            Dependency(
                id="sim-dep-3",
                project_id=sim_project.id,
                source_component_id=c3.id,
                target_component_id=c2.id,
                dependency_type=DependencyType.CONFIG_DEPENDENCY,
                is_hidden=True,
                source_id=sim_doc.id,
            ),
        ]
        db.add_all(deps)
        db.flush()

        report = run_continuity_stress_test(
            project_id=sim_project.id,
            departing_member_id=departing_id,
            db=db,
        )
        nested.rollback()
        return report
    except Exception:
        nested.rollback()
        raise

