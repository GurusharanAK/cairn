from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.security import get_current_user, verify_project_access, require_role, get_allowed_source_ids
from app.models.models import (
    User,
    UserRole,
    Project,
    SourceDocument,
    Component,
    Decision,
    DecisionStatus,
    Dependency,
    FailureRecord,
    KnowledgeGap,
    GapStatus,
    RehearsalQuestion,
    RehearsalStatus,
    ApprovalAuditLog
)
from app.schemas.schemas import ApprovalAuditLogRead
from app.services.stress_test import calculate_continuity_score

router = APIRouter(prefix="/api/projects", tags=["Successor Readiness & Handover"])


@router.get(
    "",
    summary="List projects accessible to the authenticated user"
)
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    projects = db.query(Project).order_by(Project.created_at.asc()).all()
    if current_user.role == UserRole.MANAGER:
        allowed = projects
    else:
        allowed = [
            p for p in projects
            if current_user.id in {p.manager_id, p.departing_member_id, p.incoming_member_id}
        ]
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
        }
        for p in allowed
    ]


class ReadinessScenario(BaseModel):
    scenario_id: str
    component_name: str
    scenario_prompt: str
    expected_action_checklist: List[str]
    critical_evidence_cited: List[str]


class ReadinessSubmission(BaseModel):
    scenario_id: str
    completed_steps: List[str]
    successor_notes: str


class ReadinessEvaluation(BaseModel):
    project_id: str
    successor_id: str
    readiness_score: float = Field(..., ge=0.0, le=100.0)
    scenarios_tested: int
    scenarios_passed: int
    unresolved_topics: List[str]
    handover_certification: str


class HandoverPacket(BaseModel):
    project_id: str
    project_name: str
    generated_at: datetime
    departing_member: str
    successor_member: str
    continuity_score: float
    components: List[Dict[str, Any]]
    verified_decisions: List[Dict[str, Any]]
    resolved_failure_playbooks: List[Dict[str, Any]]
    open_attention_items: List[Dict[str, Any]]


class DecisionModelRead(BaseModel):
    id: str
    title: str
    reason: Optional[str] = None
    status: str
    source_id: str
    evidence_quote: Optional[str] = None
    is_approved_query: bool = False


class ComponentModelRead(BaseModel):
    id: str
    name: str
    owner_name: str
    status: str
    source_id: str


class DependencyModelRead(BaseModel):
    id: str
    source_name: str
    target_name: str
    type: str
    is_hidden: bool
    source_id: str


class FailureModelRead(BaseModel):
    id: str
    title: str
    error: str
    fix: str
    source_id: str


class ApprovedQueryRead(BaseModel):
    id: str
    question: str
    reply: Optional[str] = None
    approved_source_id: Optional[str] = None
    manager_comment: Optional[str] = None


class KnowledgeModelResponse(BaseModel):
    project_id: str
    decisions: List[DecisionModelRead]
    components: List[ComponentModelRead]
    dependencies: List[DependencyModelRead]
    failures: List[FailureModelRead]
    approved_queries: List[ApprovedQueryRead]
    audit_history: List[ApprovalAuditLogRead] = []
    documents: List[Dict[str, Any]] = []


@router.get(
    "/{id}/readiness/scenarios",
    response_model=List[ReadinessScenario],
    summary="Generate deterministic scenario verification drills for incoming successor"
)
def get_readiness_scenarios(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Round 3 Finish Deliverable:
    Generates operational scenario walkthroughs based on verified components and earlier failure records.
    """
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    allowed_source_ids = get_allowed_source_ids(db, project.id, current_user)

    components = (
        db.query(Component)
        .filter(Component.project_id == project.id, Component.source_id.in_(allowed_source_ids))
        .all()
    )
    failures = (
        db.query(FailureRecord)
        .filter(FailureRecord.project_id == project.id, FailureRecord.source_id.in_(allowed_source_ids))
        .all()
    )

    scenarios: List[ReadinessScenario] = []

    for comp in components:
        # Match component failure playbooks
        comp_failures = [f for f in failures if f.component_id == comp.id]
        
        if comp_failures:
            f = comp_failures[0]
            scenarios.append(ReadinessScenario(
                scenario_id=f"scen-{comp.id}",
                component_name=comp.name,
                scenario_prompt=(
                    f"Incident Simulation: {comp.name} encounters error: '{f.error_message}'. "
                    f"Demonstrate how you apply the verified fix without escalating to the departing member."
                ),
                expected_action_checklist=[
                    "Check existing failure evidence record",
                    f"Apply documented fix: {f.attempted_fix}",
                    "Verify resolution criteria: " + (f.resolution or "Service returns 200 OK")
                ],
                critical_evidence_cited=[f.source_id]
            ))
        else:
            scenarios.append(ReadinessScenario(
                scenario_id=f"scen-{comp.id}",
                component_name=comp.name,
                scenario_prompt=f"Routine Maintenance: Perform release check and ownership transfer verification for {comp.name}.",
                expected_action_checklist=[
                    "Verify API contract and dependencies",
                    "Confirm environment variables and credentials",
                    "Execute integration health checks"
                ],
                critical_evidence_cited=[comp.source_id]
            ))

    return scenarios


@router.post(
    "/{id}/readiness/evaluate",
    response_model=ReadinessEvaluation,
    summary="Evaluate successor readiness check answers"
)
def evaluate_readiness(
    id: str,
    submissions: List[ReadinessSubmission],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.INCOMING_MEMBER, UserRole.MANAGER]))
):
    project = verify_project_access(project_id=id, current_user=current_user, db=db)

    total_scenarios = len(submissions)
    if total_scenarios == 0:
        return ReadinessEvaluation(
            project_id=project.id,
            successor_id=current_user.id,
            readiness_score=0.0,
            scenarios_tested=0,
            scenarios_passed=0,
            unresolved_topics=["No scenario drills completed."],
            handover_certification="INCOMPLETE"
        )

    passed = 0
    unresolved: List[str] = []

    for sub in submissions:
        # Evaluated deterministically based on checklist coverage and notes completeness
        if len(sub.completed_steps) >= 2 and len(sub.successor_notes.strip()) > 15:
            passed += 1
        else:
            unresolved.append(f"Scenario {sub.scenario_id}: Insufficient steps completed or documentation lacking.")

    readiness_percentage = round((passed / total_scenarios) * 100.0, 2)
    certification = "CERTIFIED_READY" if readiness_percentage >= 75.0 else "PROVISIONAL_SUPPORT_REQUIRED"

    return ReadinessEvaluation(
        project_id=project.id,
        successor_id=current_user.id,
        readiness_score=readiness_percentage,
        scenarios_tested=total_scenarios,
        scenarios_passed=passed,
        unresolved_topics=unresolved,
        handover_certification=certification
    )


@router.get(
    "/{id}/handover-packet",
    response_model=HandoverPacket,
    summary="Generate exportable, role-appropriate handover packet"
)
def get_handover_packet(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Step 8: Handover Workspace Output.
    Generates an official verified handover brief containing all approved evidence,
    reassigned ownerships, failure runbooks, and remaining known attention items.
    """
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    allowed_source_ids = get_allowed_source_ids(db, project.id, current_user)

    components = (
        db.query(Component)
        .filter(Component.project_id == project.id, Component.source_id.in_(allowed_source_ids))
        .all()
    )
    decisions = (
        db.query(Decision)
        .filter(
            Decision.project_id == project.id,
            Decision.source_id.in_(allowed_source_ids),
            Decision.status == DecisionStatus.EVIDENCE_SUPPORTED
        )
        .all()
    )
    failures = (
        db.query(FailureRecord)
        .filter(FailureRecord.project_id == project.id, FailureRecord.source_id.in_(allowed_source_ids))
        .all()
    )

    hidden_comp_ids = {
        c.id
        for c in db.query(Component)
        .filter(Component.project_id == project.id, ~Component.source_id.in_(allowed_source_ids))
        .all()
    }
    hidden_dec_ids = {
        d.id
        for d in db.query(Decision)
        .filter(Decision.project_id == project.id, ~Decision.source_id.in_(allowed_source_ids))
        .all()
    }
    all_gaps = db.query(KnowledgeGap).filter(
        KnowledgeGap.project_id == project.id,
        KnowledgeGap.status.in_([GapStatus.OPEN, GapStatus.QUESTION_QUEUED, GapStatus.PENDING_REVIEW])
    ).all()
    gaps = [
        g for g in all_gaps
        if (g.component_id not in hidden_comp_ids) and (g.decision_id not in hidden_dec_ids)
    ]

    score_breakdown = calculate_continuity_score(project_id=project.id, db=db)

    return HandoverPacket(
        project_id=project.id,
        project_name=project.name,
        generated_at=datetime.utcnow(),
        departing_member=project.departing_member.full_name if project.departing_member else "Unknown",
        successor_member=project.incoming_member.full_name if project.incoming_member else "Unassigned",
        continuity_score=score_breakdown.overall_score,
        components=[{
            "name": c.name,
            "owner": c.owner.full_name if c.owner else "Unassigned",
            "source_id": c.source_id,
            "status": c.status.value
        } for c in components],
        verified_decisions=[{
            "title": d.title,
            "reason": d.reason,
            "source_id": d.source_id,
            "evidence_quote": d.evidence_quote
        } for d in decisions],
        resolved_failure_playbooks=[{
            "title": f.title,
            "error": f.error_message,
            "fix": f.attempted_fix,
            "resolution": f.resolution,
            "source_id": f.source_id
        } for f in failures],
        open_attention_items=[{
            "title": g.title,
            "type": g.gap_type.value,
            "description": g.description
        } for g in gaps]
    )


@router.get(
    "/{id}/knowledge-model",
    response_model=KnowledgeModelResponse,
    summary="Get reconstructed knowledge model with live decisions and approved queries"
)
def get_knowledge_model(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the live reconstructed knowledge model for the project:
    Decisions (including approved queries appended from rehearsal),
    Components, Dependencies, Failures, and Approved Queries.
    """
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    allowed_source_ids = get_allowed_source_ids(db, project.id, current_user)

    allowed_docs = (
        db.query(SourceDocument)
        .filter(SourceDocument.project_id == project.id, SourceDocument.id.in_(allowed_source_ids))
        .all()
    )
    components = (
        db.query(Component)
        .filter(Component.project_id == project.id, Component.source_id.in_(allowed_source_ids))
        .all()
    )
    comp_map = {c.id: c.name for c in components}

    decisions = (
        db.query(Decision)
        .filter(Decision.project_id == project.id, Decision.source_id.in_(allowed_source_ids))
        .all()
    )
    dependencies = (
        db.query(Dependency)
        .filter(Dependency.project_id == project.id, Dependency.source_id.in_(allowed_source_ids))
        .all()
    )
    failures = (
        db.query(FailureRecord)
        .filter(FailureRecord.project_id == project.id, FailureRecord.source_id.in_(allowed_source_ids))
        .all()
    )

    all_approved_questions = db.query(RehearsalQuestion).filter(
        RehearsalQuestion.project_id == project.id,
        RehearsalQuestion.status == RehearsalStatus.APPROVED_AS_EVIDENCE
    ).all()
    approved_questions = [
        q for q in all_approved_questions
        if not q.approved_source_document_id or q.approved_source_document_id in allowed_source_ids
    ]

    audit_rows = (
        db.query(ApprovalAuditLog)
        .filter(ApprovalAuditLog.project_id == project.id)
        .order_by(ApprovalAuditLog.created_at.desc())
        .all()
    )
    audit_history: List[ApprovalAuditLogRead] = []
    for log in audit_rows:
        entry = ApprovalAuditLogRead.model_validate(log)
        if entry.minted_source_id and entry.minted_source_id not in allowed_source_ids:
            entry.minted_source_id = None
        audit_history.append(entry)

    decisions_list = []
    seen_ids = set()

    for d in decisions:
        seen_ids.add(d.id)
        is_query = (
            (d.evidence_quote is not None and "Approved Rehearsal" in d.evidence_quote) or 
            d.id.startswith("dec-ex-") or 
            d.id.startswith("dec-rehearsal") or
            d.title.startswith("Verified Query:")
        )
        decisions_list.append(DecisionModelRead(
            id=d.id,
            title=d.title,
            reason=d.reason,
            status=d.status.value if hasattr(d.status, "value") else str(d.status),
            source_id=d.source_id,
            evidence_quote=d.evidence_quote,
            is_approved_query=is_query
        ))

    # Also make sure any approved questions that were approved are included in decisions
    for q in approved_questions:
        q_dec_id = f"dec-rehearsal-{q.id[:8]}"
        if q_dec_id not in seen_ids and not any(d.title == q.question or d.title == f"Verified Query: {q.question}" or (d.evidence_quote and q.departing_reply and q.departing_reply in d.evidence_quote) for d in decisions_list):
            decisions_list.append(DecisionModelRead(
                id=q_dec_id,
                title=f"Verified Query: {q.question}",
                reason=q.departing_reply,
                status=DecisionStatus.EVIDENCE_SUPPORTED.value,
                source_id=q.approved_source_document_id or "verified-rehearsal",
                evidence_quote=f"Approved Rehearsal Answer: {q.departing_reply}",
                is_approved_query=True
            ))

    components_list = [ComponentModelRead(
        id=c.id,
        name=c.name,
        owner_name=c.owner.full_name if c.owner else "Unassigned",
        status=c.status.value if hasattr(c.status, "value") else str(c.status),
        source_id=c.source_id
    ) for c in components]

    dependencies_list = [DependencyModelRead(
        id=dep.id,
        source_name=comp_map.get(dep.source_component_id, "Unknown"),
        target_name=comp_map.get(dep.target_component_id, "Unknown"),
        type=dep.dependency_type.value if hasattr(dep.dependency_type, "value") else str(dep.dependency_type),
        is_hidden=dep.is_hidden,
        source_id=dep.source_id
    ) for dep in dependencies]

    failures_list = [FailureModelRead(
        id=f.id,
        title=f.title,
        error=f.error_message,
        fix=f.attempted_fix,
        source_id=f.source_id
    ) for f in failures]

    approved_queries_list = [ApprovedQueryRead(
        id=q.id,
        question=q.question,
        reply=q.departing_reply,
        approved_source_id=q.approved_source_document_id,
        manager_comment=q.manager_review_comment
    ) for q in approved_questions]

    documents_list = [{
        "id": doc.id,
        "title": doc.title,
        "source_type": doc.source_type.value if hasattr(doc.source_type, "value") else str(doc.source_type),
        "access_level": doc.access_level.value if hasattr(doc.access_level, "value") else str(doc.access_level),
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    } for doc in allowed_docs]

    return KnowledgeModelResponse(
        project_id=project.id,
        decisions=decisions_list,
        components=components_list,
        dependencies=dependencies_list,
        failures=failures_list,
        approved_queries=approved_queries_list,
        audit_history=audit_history,
        documents=documents_list
    )

