from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.database import get_db
from app.core.security import (
    get_current_user,
    verify_project_access,
    require_role,
    get_accessible_access_levels,
    get_allowed_source_ids,
)
from app.models.models import (
    User,
    UserRole,
    Project,
    SourceDocument,
    SourceType,
    AccessLevel,
    Decision,
    DecisionStatus,
    KnowledgeGap,
    GapType,
    GapStatus,
    RehearsalQuestion,
    RehearsalStatus,
    ApprovalAuditLog,
)
from app.schemas.schemas import RehearsalQuestionRead, ApprovalAuditLogRead

router = APIRouter(prefix="/api/rehearsal", tags=["Handover Rehearsal Q&A"])


# ==========================================
# REQUEST / RESPONSE SCHEMAS
# ==========================================

class RehearsalAskRequest(BaseModel):
    project_id: str
    question: str = Field(..., min_length=3, description="Natural language question about project components or decisions")
    knowledge_gap_id: Optional[str] = None
    decision_id: Optional[str] = None


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
    summary="Successor queries project evidence during Handover Rehearsal"
)
def ask_rehearsal_question(
    payload: RehearsalAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Step 6: Handover Rehearsal Q&A.
    INVARIANTS:
    - Filters approved evidence at database query level based on user role/permissions.
    - If approved evidence exists, replies with citations.
    - If evidence is absent, Cairn refuses to hallucinate/guess. It records a gap and
      routes the question to the departing member.
    """
    project = verify_project_access(project_id=payload.project_id, current_user=current_user, db=db)

    # 1. Query-level permission boundary filter on SourceDocuments (via shared security helper)
    accessible_levels = get_accessible_access_levels(current_user)
    allowed_sources: List[SourceDocument] = db.query(SourceDocument).filter(
        SourceDocument.project_id == project.id,
        SourceDocument.access_level.in_(accessible_levels)
    ).all()
    allowed_source_ids = {s.id for s in allowed_sources}

    # 1b. Deduplicate open/pending questions on the same project
    def _norm_q(text: str) -> str:
        return " ".join(text.strip().lower().split())

    normalized_input_q = _norm_q(payload.question)
    open_statuses = [RehearsalStatus.PENDING_DEPARTING_REPLY, RehearsalStatus.PENDING_REVIEW]
    existing_open_questions = (
        db.query(RehearsalQuestion)
        .filter(
            RehearsalQuestion.project_id == project.id,
            RehearsalQuestion.status.in_(open_statuses),
        )
        .order_by(RehearsalQuestion.created_at.desc())
        .all()
    )
    for existing_q in existing_open_questions:
        same_text = _norm_q(existing_q.question) == normalized_input_q
        same_gap = bool(payload.knowledge_gap_id and existing_q.knowledge_gap_id == payload.knowledge_gap_id)
        same_dec = bool(payload.decision_id and existing_q.decision_id == payload.decision_id)
        if same_text or same_gap or same_dec:
            return RehearsalAskResponse(
                rehearsal_question_id=existing_q.id,
                status=existing_q.status,
                found_in_evidence=False,
                evidence_answer=None,
                cited_source_ids=[],
                message="Existing open rehearsal question already queued for this topic; linked existing thread instead of duplicating."
            )

    # 2. Search verified Decisions and Source content (respecting RBAC clearance)
    query_terms = [w.lower() for w in payload.question.replace("?", "").replace(",", "").split() if len(w) > 3]

    # Resolve directly linked gap or decision if IDs were provided
    direct_gap = None
    if payload.knowledge_gap_id:
        direct_gap = db.query(KnowledgeGap).filter(
            KnowledgeGap.id == payload.knowledge_gap_id,
            KnowledgeGap.project_id == project.id
        ).first()

    # Check if this query targets a cleared decision whose reason is known to be MISSING
    missing_reason_decisions = db.query(Decision).filter(
        Decision.project_id == project.id,
        Decision.source_id.in_(allowed_source_ids),
        Decision.status == DecisionStatus.REASON_MISSING
    ).all()

    matched_missing_decision = None
    if payload.decision_id:
        matched_missing_decision = next((d for d in missing_reason_decisions if d.id == payload.decision_id), None)
    if not matched_missing_decision and direct_gap and direct_gap.decision_id:
        matched_missing_decision = next((d for d in missing_reason_decisions if d.id == direct_gap.decision_id), None)
    if not matched_missing_decision:
        for d in missing_reason_decisions:
            d_text = d.title.lower()
            if any(term in d_text for term in query_terms):
                matched_missing_decision = d
                break

    if matched_missing_decision:
        existing_gap = direct_gap or db.query(KnowledgeGap).filter(
            KnowledgeGap.decision_id == matched_missing_decision.id
        ).first()
        if existing_gap:
            existing_gap.question_to_departing = payload.question
            existing_gap.status = GapStatus.QUESTION_QUEUED
            db.flush()
        else:
            existing_gap = KnowledgeGap(
                project_id=project.id,
                decision_id=matched_missing_decision.id,
                component_id=matched_missing_decision.component_id,
                title=f"Missing Reason: {matched_missing_decision.title}",
                description=f"Successor asked: '{payload.question}'. No approved evidence found.",
                gap_type=GapType.MISSING_REASON,
                status=GapStatus.QUESTION_QUEUED,
                question_to_departing=payload.question
            )
            db.add(existing_gap)
            db.flush()

        question_rec = RehearsalQuestion(
            project_id=project.id,
            requester_id=current_user.id,
            question=payload.question,
            knowledge_gap_id=existing_gap.id,
            decision_id=matched_missing_decision.id,
            status=RehearsalStatus.PENDING_DEPARTING_REPLY,
            evidence_answer="Unverified: Decision rationale is undocumented in approved project records."
        )
        db.add(question_rec)
        db.commit()
        db.refresh(question_rec)

        return RehearsalAskResponse(
            rehearsal_question_id=question_rec.id,
            status=RehearsalStatus.PENDING_DEPARTING_REPLY,
            found_in_evidence=False,
            evidence_answer=None,
            cited_source_ids=[],
            message=f"Zero-Hallucination Guard: Decision '{matched_missing_decision.title}' is documented, but its reasoning is explicitly unrecorded. Question queued for departing member."
        )

    matched_decisions = db.query(Decision).filter(
        Decision.project_id == project.id,
        Decision.source_id.in_(allowed_source_ids),
        Decision.status == DecisionStatus.EVIDENCE_SUPPORTED
    ).all()

    evidence_found = None
    cited_ids = []

    for d in matched_decisions:
        # Match decision title or reason
        d_text = f"{d.title} {d.reason or ''}".lower()
        if any(term in d_text for term in query_terms):
            evidence_found = f"Verified Record: {d.title}. Reason: {d.reason} (Excerpt: '{d.evidence_quote or 'N/A'}')"
            cited_ids.append(d.source_id)
            break

    # If no decision matched, check direct document contents
    if not evidence_found:
        for s in allowed_sources:
            s_content_lower = s.content.lower()
            if any(term in s_content_lower for term in query_terms):
                # Search for contextual snippets
                for line in s.content.splitlines():
                    if any(term in line.lower() for term in query_terms):
                        evidence_found = f"Verified Source: {s.title} states: '{line.strip()}'"
                        cited_ids.append(s.id)
                        break
            if evidence_found:
                break

    # 3. Handle Zero-Hallucination Fork
    if evidence_found:
        # Answer directly from verified ground-truth
        question_rec = RehearsalQuestion(
            project_id=project.id,
            requester_id=current_user.id,
            question=payload.question,
            status=RehearsalStatus.ANSWERED_FROM_EVIDENCE,
            evidence_answer=evidence_found,
            cited_source_ids=list(set(cited_ids))
        )
        db.add(question_rec)
        db.commit()
        db.refresh(question_rec)

        return RehearsalAskResponse(
            rehearsal_question_id=question_rec.id,
            status=RehearsalStatus.ANSWERED_FROM_EVIDENCE,
            found_in_evidence=True,
            evidence_answer=evidence_found,
            cited_source_ids=question_rec.cited_source_ids,
            message="Evidence verified. Answer extracted directly from approved project documents."
        )

    else:
        # INVARIANT 1 & 2: NO GUESSING.
        # Link directly to gap/decision if provided or matched, otherwise create KnowledgeGap
        gap = direct_gap
        if not gap:
            gap = KnowledgeGap(
                project_id=project.id,
                decision_id=payload.decision_id,
                title=f"Rehearsal Question: {payload.question[:80]}",
                description=f"Successor asked: '{payload.question}'. No approved evidence found.",
                gap_type=GapType.TACIT_KNOWLEDGE,
                status=GapStatus.QUESTION_QUEUED,
                question_to_departing=payload.question
            )
            db.add(gap)
            db.flush()
        else:
            gap.question_to_departing = payload.question
            gap.status = GapStatus.QUESTION_QUEUED
            db.flush()

        question_rec = RehearsalQuestion(
            project_id=project.id,
            requester_id=current_user.id,
            question=payload.question,
            knowledge_gap_id=gap.id,
            decision_id=payload.decision_id or gap.decision_id,
            status=RehearsalStatus.PENDING_DEPARTING_REPLY,
            evidence_answer="Unverified: No approved evidence found in project records."
        )
        db.add(question_rec)
        db.commit()
        db.refresh(question_rec)

        return RehearsalAskResponse(
            rehearsal_question_id=question_rec.id,
            status=RehearsalStatus.PENDING_DEPARTING_REPLY,
            found_in_evidence=False,
            evidence_answer=None,
            cited_source_ids=[],
            message="No approved source explains this. Question queued for departing member. Cairn will not guess."
        )


@router.post(
    "/reply",
    response_model=RehearsalReplyResponse,
    summary="Departing member provides context to an unresolved rehearsal question"
)
def reply_to_rehearsal_question(
    payload: RehearsalReplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DEPARTING_MEMBER, UserRole.MANAGER]))
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

    # Also update associated KnowledgeGap (direct FK link first, question text fallback)
    gap = None
    if question.knowledge_gap_id:
        gap = db.query(KnowledgeGap).filter(KnowledgeGap.id == question.knowledge_gap_id).first()
    if not gap:
        gap = db.query(KnowledgeGap).filter(
            KnowledgeGap.project_id == question.project_id,
            KnowledgeGap.question_to_departing == question.question
        ).first()
    if gap:
        gap.departing_member_reply = payload.reply_text
        gap.status = GapStatus.PENDING_REVIEW
        if not question.knowledge_gap_id:
            question.knowledge_gap_id = gap.id

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
    previous_status = question.status.value
    resolved_decision_id: Optional[str] = question.decision_id

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
                "status": "approved",
                "quote": question.departing_reply,
                "rehearsal_question_id": question.id,
                "approved_by_id": current_user.id,
                "approved_at": datetime.utcnow().isoformat()
            }
        )
        db.add(verified_doc)
        db.flush()

        new_source_id = verified_doc.id
        question.status = RehearsalStatus.APPROVED_AS_EVIDENCE
        question.approved_source_document_id = verified_doc.id
        question.manager_review_comment = payload.manager_comment

        # 2. Deterministically resolve linked KnowledgeGap / Decision (direct FK first, keyword fallback)
        from sqlalchemy import or_
        gaps: List[KnowledgeGap] = []
        if question.knowledge_gap_id:
            linked_gap = db.query(KnowledgeGap).filter(KnowledgeGap.id == question.knowledge_gap_id).first()
            if linked_gap:
                gaps.append(linked_gap)
        if question.decision_id:
            dec_gaps = db.query(KnowledgeGap).filter(KnowledgeGap.decision_id == question.decision_id).all()
            for g in dec_gaps:
                if g.id not in {x.id for x in gaps}:
                    gaps.append(g)

        if not gaps:
            is_retry_q = "retry" in question.question.lower()
            gap_filters = [
                (KnowledgeGap.question_to_departing == question.question),
                (KnowledgeGap.title.ilike(f"%{question.question[:30]}%"))
            ]
            if is_retry_q:
                gap_filters.append(KnowledgeGap.title.ilike("%Retry%"))
            gaps = db.query(KnowledgeGap).filter(
                KnowledgeGap.project_id == question.project_id,
                or_(*gap_filters)
            ).all()

        decision_updated = False
        if question.decision_id:
            direct_dec = db.query(Decision).filter(Decision.id == question.decision_id).first()
            if direct_dec:
                direct_dec.reason = question.departing_reply
                direct_dec.status = DecisionStatus.EVIDENCE_SUPPORTED
                direct_dec.evidence_quote = f"Approved Rehearsal Answer: {question.departing_reply}"
                direct_dec.source_id = verified_doc.id
                resolved_decision_id = direct_dec.id
                decision_updated = True

        for gap in gaps:
            gap.status = GapStatus.APPROVED_AS_EVIDENCE
            gap.reviewer_id = current_user.id
            gap.review_notes = payload.manager_comment
            gap.verified_source_id = verified_doc.id

            if gap.decision_id:
                decision = db.query(Decision).filter(Decision.id == gap.decision_id).first()
                if decision:
                    decision.reason = question.departing_reply
                    decision.status = DecisionStatus.EVIDENCE_SUPPORTED
                    decision.evidence_quote = f"Approved Rehearsal Answer: {question.departing_reply}"
                    decision.source_id = verified_doc.id
                    resolved_decision_id = decision.id
                    decision_updated = True

        # Append to the knowledge model as a new verified Decision if not already updating an existing decision
        if not decision_updated:
            existing_dec = db.query(Decision).filter(
                Decision.project_id == question.project_id,
                (Decision.title == question.question) |
                (Decision.title == f"Verified Query: {question.question}")
            ).first()
            if existing_dec:
                existing_dec.reason = question.departing_reply
                existing_dec.status = DecisionStatus.EVIDENCE_SUPPORTED
                existing_dec.evidence_quote = f"Approved Rehearsal Answer: {question.departing_reply}"
                existing_dec.source_id = verified_doc.id
                resolved_decision_id = existing_dec.id
            else:
                new_dec = Decision(
                    id=f"dec-rehearsal-{question.id[:8]}",
                    project_id=question.project_id,
                    component_id=gaps[0].component_id if gaps else None,
                    title=f"Verified Query: {question.question}",
                    reason=question.departing_reply,
                    status=DecisionStatus.EVIDENCE_SUPPORTED,
                    source_id=verified_doc.id,
                    evidence_quote=f"Approved Rehearsal Answer: {question.departing_reply}"
                )
                db.add(new_dec)
                db.flush()
                resolved_decision_id = new_dec.id
                for gap in gaps:
                    if not gap.decision_id:
                        gap.decision_id = new_dec.id

        if resolved_decision_id and not question.decision_id:
            question.decision_id = resolved_decision_id

        msg = "Reply approved by Manager. Converted into permanent verified SourceDocument evidence and appended to Knowledge Model."
    else:
        question.status = RehearsalStatus.REJECTED
        question.manager_review_comment = payload.manager_comment or "Rejected by manager."
        msg = "Reply rejected by Manager. Remaining unresolved."

    # Record immutable audit trail entry for every approval or rejection
    audit_entry = ApprovalAuditLog(
        project_id=question.project_id,
        question_id=question.id,
        decision_id=resolved_decision_id,
        reviewer_id=current_user.id,
        action="approved" if payload.approved else "rejected",
        review_note=payload.manager_comment or question.manager_review_comment,
        previous_status=previous_status,
        minted_source_id=new_source_id,
    )
    db.add(audit_entry)

    db.commit()
    db.refresh(question)

    return RehearsalReviewResponse(
        question_id=question.id,
        status=question.status,
        new_verified_source_id=new_source_id,
        message=msg
    )


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

    allowed_source_ids = get_allowed_source_ids(db, project_id, current_user)
    questions = query.order_by(RehearsalQuestion.created_at.desc()).all()
    results: List[RehearsalQuestionRead] = []
    for q in questions:
        item = RehearsalQuestionRead.model_validate(q)
        if item.cited_source_ids:
            item.cited_source_ids = [sid for sid in item.cited_source_ids if sid in allowed_source_ids]
        if item.approved_source_document_id and item.approved_source_document_id not in allowed_source_ids:
            item.approved_source_document_id = None
        results.append(item)
    return results


@router.get(
    "/{project_id}/audit-history",
    response_model=List[ApprovalAuditLogRead],
    summary="Fetch immutable approval/rejection audit log for a project"
)
def get_rehearsal_audit_history(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verify_project_access(project_id=project_id, current_user=current_user, db=db)
    allowed_source_ids = get_allowed_source_ids(db, project_id, current_user)
    logs = (
        db.query(ApprovalAuditLog)
        .filter(ApprovalAuditLog.project_id == project_id)
        .order_by(ApprovalAuditLog.created_at.desc())
        .all()
    )
    output: List[ApprovalAuditLogRead] = []
    for log in logs:
        entry = ApprovalAuditLogRead.model_validate(log)
        if entry.minted_source_id and entry.minted_source_id not in allowed_source_ids:
            entry.minted_source_id = None
        output.append(entry)
    return output


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
    Resets the demo state back to pristine baseline benchmark state.
    """
    verify_project_access(project_id=project_id, current_user=current_user, db=db)
    from app.seeds.seed_demo_data import reset_database
    reset_database()
    return {
        "status": "success",
        "message": "Demo state reset to pristine baseline. All manually entered decisions, questions, and records deleted."
    }


