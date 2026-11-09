import re
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.database import get_db
from app.core.security import get_current_user, verify_project_access, require_role
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
    FailureRecord,
    KnowledgeGap,
    GapType,
    GapStatus,
    RehearsalQuestion,
    RehearsalStatus
)
from app.schemas.schemas import RehearsalQuestionRead

router = APIRouter(prefix="/api/rehearsal", tags=["Handover Rehearsal Q&A"])


# ==========================================
# REQUEST / RESPONSE SCHEMAS
# ==========================================

class RehearsalAskRequest(BaseModel):
    project_id: str
    question: str = Field(..., min_length=3, description="Natural language question about project components or decisions")


class RehearsalAskResponse(BaseModel):
    rehearsal_question_id: str
    status: RehearsalStatus
    found_in_evidence: bool
    evidence_answer: Optional[str] = None
    cited_source_ids: List[str] = []
    message: str


class RehearsalReplyRequest(BaseModel):
    question_id: str
    reply_text: str = Field(..., min_length=3, description="Departing member's explanation of missing context")


class RehearsalReplyResponse(BaseModel):
    question_id: str
    status: RehearsalStatus
    departing_reply: str
    message: str


class RehearsalReviewRequest(BaseModel):
    question_id: str
    approved: bool
    manager_comment: Optional[str] = None


class RehearsalReviewResponse(BaseModel):
    question_id: str
    status: RehearsalStatus
    new_verified_source_id: Optional[str] = None
    message: str


# ==========================================
# ENDPOINTS
# ==========================================

@router.post(
    "/ask",
    response_model=RehearsalAskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Manager or Successor asks question during Handover Rehearsal"
)
def ask_rehearsal_question(
    payload: RehearsalAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Step 6: Handover Rehearsal Q&A.
    The Manager or the Successor asks a question on 'Handover Rehearsal Q&A'
    and it is routed to the Departing Member to answer.
    """
    project = verify_project_access(project_id=payload.project_id, current_user=current_user, db=db)

    # 1. Create RehearsalQuestion for Departing Member
    question_rec = RehearsalQuestion(
        project_id=project.id,
        requester_id=current_user.id,
        question=payload.question,
        status=RehearsalStatus.PENDING_DEPARTING_REPLY,
        evidence_answer=None
    )
    db.add(question_rec)

    # 2. Link or create KnowledgeGap for tracking
    clean_q = re.sub(r"[^\w\s]", " ", payload.question.lower())
    q_words = [w for w in clean_q.split() if len(w) > 3]

    matching_dec = db.query(Decision).filter(
        Decision.project_id == project.id,
        Decision.status == DecisionStatus.REASON_MISSING
    ).first()

    target_dec_id = None
    target_comp_id = None
    if matching_dec and any(w in matching_dec.title.lower() for w in q_words if w in ["payment", "retry", "limit"]):
        target_dec_id = matching_dec.id
        target_comp_id = matching_dec.component_id

    existing_gap = None
    if target_dec_id:
        existing_gap = db.query(KnowledgeGap).filter(KnowledgeGap.decision_id == target_dec_id).first()

    if existing_gap:
        existing_gap.question_to_departing = payload.question
        existing_gap.status = GapStatus.QUESTION_QUEUED
    else:
        gap = KnowledgeGap(
            project_id=project.id,
            decision_id=target_dec_id,
            component_id=target_comp_id,
            title=f"Rehearsal Question: {payload.question[:80]}",
            description=f"Inquiry: '{payload.question}'. Queued for departing member explanation.",
            gap_type=GapType.MISSING_REASON if target_dec_id else GapType.TACIT_KNOWLEDGE,
            status=GapStatus.QUESTION_QUEUED,
            question_to_departing=payload.question
        )
        db.add(gap)

    db.commit()
    db.refresh(question_rec)

    requester_label = "Engineering Manager" if current_user.role == UserRole.MANAGER else "Successor Member"

    return RehearsalAskResponse(
        rehearsal_question_id=question_rec.id,
        status=RehearsalStatus.PENDING_DEPARTING_REPLY,
        found_in_evidence=False,
        evidence_answer=None,
        cited_source_ids=[],
        message=f"Question asked by {requester_label}. Routed to Departing Member to answer."
    )


@router.post(
    "/reply",
    response_model=RehearsalReplyResponse,
    summary="Departing member provides context to an unresolved rehearsal question"
)
def reply_to_rehearsal_question(
    payload: RehearsalReplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DEPARTING_MEMBER]))
):
    """
    Step 6b: Departing member answers unresolved question.
    INVARIANT 3: Reply MUST be marked 'pending_review'. It CANNOT become evidence until Manager approves.
    """
    question = db.query(RehearsalQuestion).filter(RehearsalQuestion.id == payload.question_id).first()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rehearsal question {payload.question_id} not found."
        )

    verify_project_access(project_id=question.project_id, current_user=current_user, db=db)

    # Invariant: Status stays 'pending_review'
    question.departing_reply = payload.reply_text
    question.status = RehearsalStatus.PENDING_REVIEW

    # Also update associated KnowledgeGap if any
    gap = db.query(KnowledgeGap).filter(
        KnowledgeGap.project_id == question.project_id,
        KnowledgeGap.question_to_departing == question.question
    ).first()
    if gap:
        gap.departing_member_reply = payload.reply_text
        gap.status = GapStatus.PENDING_REVIEW

    db.commit()
    db.refresh(question)

    return RehearsalReplyResponse(
        question_id=question.id,
        status=RehearsalStatus.PENDING_REVIEW,
        departing_reply=question.departing_reply,
        message="Reply recorded as proposed item with status 'pending_review'. Awaiting Manager approval."
    )


@router.post(
    "/review",
    response_model=RehearsalReviewResponse,
    summary="Manager signs off on departing member reply, converting it into permanent evidence"
)
def review_rehearsal_reply(
    payload: RehearsalReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MANAGER]))
):
    """
    Step 7: Human Review & Sign-off.
    INVARIANT 3: Only MANAGER can approve.
    Upon approval, generates an official SourceDocument and updates status to APPROVED_AS_EVIDENCE.
    """
    question = db.query(RehearsalQuestion).filter(RehearsalQuestion.id == payload.question_id).first()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rehearsal question {payload.question_id} not found."
        )

    verify_project_access(project_id=question.project_id, current_user=current_user, db=db)

    if not question.departing_reply:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot review question without a departing member reply."
        )

    new_source_id = None

    if payload.approved:
        # 1. Create a permanent, verifiable SourceDocument for the approved reply
        verified_doc = SourceDocument(
            project_id=question.project_id,
            title=f"Handover Rehearsal Sign-off: {question.question[:60]}",
            source_type=SourceType.REHEARSAL_VERIFIED_ANSWER,
            content=(
                f"Question: {question.question}\n"
                f"Approved Reply by Departing Member: {question.departing_reply}\n"
                f"Manager Review Note: {payload.manager_comment or 'Approved without modification'}\n"
                f"Approval Date: {datetime.utcnow().isoformat()}"
            ),
            access_level=AccessLevel.RESTRICTED_TEAM,
            created_by_id=current_user.id,
            doc_metadata={
                "rehearsal_question_id": question.id,
                "quote": question.departing_reply,
                "approved_by": current_user.full_name,
                "approved_by_id": current_user.id,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "approved"
            }
        )
        db.add(verified_doc)
        db.flush()

        new_source_id = verified_doc.id
        question.status = RehearsalStatus.APPROVED_AS_EVIDENCE
        question.approved_source_document_id = verified_doc.id
        question.manager_review_comment = payload.manager_comment

        # 2. Add approved message directly into Knowledge Model (Decision records)
        clean_q = re.sub(r"[^\w\s]", " ", question.question.lower())
        q_words = [w for w in clean_q.split() if len(w) > 3]
        matched_decision = None
        all_candidate_decisions = db.query(Decision).filter(
            Decision.project_id == question.project_id
        ).all()
        for d in all_candidate_decisions:
            d_title = d.title.lower()
            if any(w in d_title for w in q_words if w in ["payment", "retry", "limit"]):
                matched_decision = d
                break
            if d_title in clean_q:
                matched_decision = d
                break

        if matched_decision:
            matched_decision.reason = question.departing_reply
            matched_decision.status = DecisionStatus.EVIDENCE_SUPPORTED
            matched_decision.source_id = verified_doc.id
            matched_decision.evidence_quote = question.departing_reply
            matched_decision.updated_at = datetime.utcnow()
        else:
            # Create brand new verified Decision record in the Knowledge Model
            comp = db.query(Component).filter(Component.project_id == question.project_id).first()
            new_dec = Decision(
                project_id=question.project_id,
                component_id=comp.id if comp else None,
                title=question.question,
                reason=question.departing_reply,
                status=DecisionStatus.EVIDENCE_SUPPORTED,
                source_id=verified_doc.id,
                evidence_quote=question.departing_reply,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(new_dec)

        # 3. Update KnowledgeGap to resolved
        gaps = db.query(KnowledgeGap).filter(
            KnowledgeGap.project_id == question.project_id,
            (KnowledgeGap.question_to_departing == question.question) |
            (KnowledgeGap.title.ilike(f"%{question.question[:30]}%"))
        ).all()
        for gap in gaps:
            gap.status = GapStatus.APPROVED_AS_EVIDENCE
            gap.reviewer_id = current_user.id
            gap.review_notes = payload.manager_comment or "Approved by Manager"
            gap.verified_source_id = verified_doc.id

            # If this gap resolved a missing decision reason, update the Decision model
            if gap.decision_id:
                decision = db.query(Decision).filter(Decision.id == gap.decision_id).first()
                if decision:
                    decision.reason = question.departing_reply
                    decision.status = DecisionStatus.EVIDENCE_SUPPORTED
                    decision.source_id = verified_doc.id
                    decision.evidence_quote = question.departing_reply

        msg = "Reply approved by Manager. Converted into permanent verified SourceDocument evidence."
    else:
        question.status = RehearsalStatus.REJECTED
        question.manager_review_comment = payload.manager_comment or "Rejected by manager."
        msg = "Reply rejected by Manager. Remaining unresolved."

    db.commit()
    db.refresh(question)

    return RehearsalReviewResponse(
        question_id=question.id,
        status=question.status,
        new_verified_source_id=new_source_id,
        message=msg
    )


@router.post(
    "/{project_id}/reset-demo",
    summary="Reset demo state back to pristine baseline with open gaps"
)
def reset_demo_state(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Resets the demo state back to pristine unrecorded gap condition:
    1. Removes all RehearsalQuestion records for the project.
    2. Removes all non-default SourceDocument records (rehearsal verified answers & manual ingests).
    3. Removes all non-default Decision records (questions approved into decisions).
    4. Removes all non-default KnowledgeGaps, Components, Dependencies, FailureRecords.
    5. Resets dec-retry-limit back to REASON_MISSING (reason=None).
    6. Resets gap-missing-retry-reason back to QUESTION_QUEUED with no reply.
    """
    verify_project_access(project_id=project_id, current_user=current_user, db=db)

    # 1. Delete all rehearsal questions for project
    db.query(RehearsalQuestion).filter(RehearsalQuestion.project_id == project_id).delete()

    # 2. Delete non-default Decisions (any decision created dynamically from Q&A or ingestion)
    db.query(Decision).filter(
        Decision.project_id == project_id,
        ~Decision.id.in_(["dec-db-choice", "dec-retry-limit"])
    ).delete(synchronize_session=False)

    # 3. Delete non-default SourceDocuments
    db.query(SourceDocument).filter(
        SourceDocument.project_id == project_id,
        ~SourceDocument.id.in_(["src-doc-arch-01", "src-git-commit-42", "src-doc-budget-restricted"])
    ).delete(synchronize_session=False)

    # 4. Clean up non-default knowledge gaps
    db.query(KnowledgeGap).filter(
        KnowledgeGap.project_id == project_id,
        ~KnowledgeGap.id.in_(["gap-missing-retry-reason", "gap-hidden-dashboard-auth"])
    ).delete(synchronize_session=False)

    # 5. Clean up non-default dependencies, failure records, and components
    db.query(Dependency).filter(
        Dependency.project_id == project_id,
        ~Dependency.id.in_(["dep-payment-auth", "dep-dash-auth-hidden"])
    ).delete(synchronize_session=False)

    db.query(FailureRecord).filter(
        FailureRecord.project_id == project_id,
        ~FailureRecord.id.in_(["fail-rec-01"])
    ).delete(synchronize_session=False)

    db.query(Component).filter(
        Component.project_id == project_id,
        ~Component.id.in_(["comp-auth", "comp-payment", "comp-dashboard"])
    ).delete(synchronize_session=False)

    # 6. Reset default gaps
    gap_retry = db.query(KnowledgeGap).filter(KnowledgeGap.id == "gap-missing-retry-reason").first()
    if gap_retry:
        gap_retry.status = GapStatus.QUESTION_QUEUED
        gap_retry.departing_member_reply = None
        gap_retry.reviewer_id = None
        gap_retry.review_notes = None
        gap_retry.verified_source_id = None
        gap_retry.question_to_departing = "Why is the payment retry limit set to 3? What upstream timeout or rate limit influenced this?"

    gap_dash = db.query(KnowledgeGap).filter(KnowledgeGap.id == "gap-hidden-dashboard-auth").first()
    if gap_dash:
        gap_dash.status = GapStatus.OPEN
        gap_dash.departing_member_reply = None
        gap_dash.reviewer_id = None
        gap_dash.review_notes = None
        gap_dash.verified_source_id = None

    # 7. Reset Decision: Set Payment Retry Limit to 3 -> REASON_MISSING
    dec_retry = db.query(Decision).filter(Decision.id == "dec-retry-limit").first()
    if dec_retry:
        dec_retry.status = DecisionStatus.REASON_MISSING
        dec_retry.reason = None
        dec_retry.evidence_quote = "Decided to set payment retry limit to 3"
        dec_retry.source_id = "src-git-commit-42"
        dec_retry.updated_at = datetime.utcnow()

    # Reset Decision: Use PostgreSQL -> EVIDENCE_SUPPORTED
    dec_pg = db.query(Decision).filter(Decision.id == "dec-db-choice").first()
    if dec_pg:
        dec_pg.status = DecisionStatus.EVIDENCE_SUPPORTED
        dec_pg.reason = "Relational transactions and strict ACID compliance needed for ledger auditing"
        dec_pg.evidence_quote = "because relational transactions and strict ACID compliance are non-negotiable for financial auditing"
        dec_pg.source_id = "src-doc-arch-01"
        dec_pg.updated_at = datetime.utcnow()

    # Reset Component ownership
    comp_auth = db.query(Component).filter(Component.id == "comp-auth").first()
    if comp_auth:
        comp_auth.owner_id = "usr-dev-a"
        comp_auth.status = ComponentStatus.ACTIVE

    db.commit()

    return {
        "status": "success",
        "message": "Demo state reset to pristine baseline. All manually entered decisions, questions, and records deleted."
    }


@router.get(
    "/{project_id}/questions",
    response_model=List[RehearsalQuestionRead],
    summary="List all Rehearsal Q&A exchanges for a project"
)
def list_rehearsal_questions(
    project_id: str,
    status_filter: Optional[RehearsalStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verify_project_access(project_id=project_id, current_user=current_user, db=db)
    
    query = db.query(RehearsalQuestion).filter(RehearsalQuestion.project_id == project_id)
    if status_filter:
        query = query.filter(RehearsalQuestion.status == status_filter)
        
    questions = query.order_by(RehearsalQuestion.created_at.desc()).all()
    return [RehearsalQuestionRead.model_validate(q) for q in questions]

