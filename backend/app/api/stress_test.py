from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.security import get_current_user, verify_project_access
from app.models.models import User, Project
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

