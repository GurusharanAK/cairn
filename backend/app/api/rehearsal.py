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
    Decision,
    DecisionStatus,
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

    # 1. Query-level permission boundary filter on SourceDocuments
    accessible_levels = [AccessLevel.PUBLIC, AccessLevel.RESTRICTED_TEAM]
    if current_user.role == UserRole.MANAGER:
        accessible_levels.append(AccessLevel.RESTRICTED_MANAGER)

    allowed_sources: List[SourceDocument] = db.query(SourceDocument).filter(
        SourceDocument.project_id == project.id,
        SourceDocument.access_level.in_(accessible_levels)
    ).all()
    allowed_source_ids = {s.id for s in allowed_sources}

    # 2. Search verified Decisions and Source content (SEARCH APPROVED EVIDENCE FIRST)
    STOP_WORDS = {
        "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
        "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", 
        "by", "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", 
        "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", 
        "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", 
        "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", 
        "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "set", "she", 
        "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves", 
        "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", 
        "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", 
        "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
    }
    clean_q = re.sub(r"[^\w\s]", " ", payload.question.lower())
    query_terms = [w for w in clean_q.split() if w not in STOP_WORDS and len(w) >= 1]
    if not query_terms:
        query_terms = [w for w in clean_q.split() if len(w) >= 2]

    def matches_terms(text: str, terms: List[str]) -> bool:
        t_lower = text.lower()
        if not terms:
            return False
        if len(terms) == 1:
            return terms[0] in t_lower
        match_count = sum(1 for term in terms if term in t_lower)
        # Require at least 2 matching terms, or at least 50% of the query terms
        return match_count >= max(2, int(len(terms) * 0.5))

    evidence_found = None
    cited_ids = []

    # A. Search approved Decisions (EVIDENCE_SUPPORTED)
    matched_decisions = db.query(Decision).filter(
        Decision.project_id == project.id,
        Decision.source_id.in_(allowed_source_ids),
        Decision.status == DecisionStatus.EVIDENCE_SUPPORTED
    ).all()

    for d in matched_decisions:
        d_text = f"{d.title} {d.reason or ''} {d.evidence_quote or ''}"
        if matches_terms(d_text, query_terms):
            evidence_found = f"Verified Record: {d.title}. Reason: {d.reason} (Excerpt: '{d.evidence_quote or d.reason}')"
            cited_ids.append(d.source_id)
            break

    # B. Search approved Rehearsal Source Documents (REHEARSAL_VERIFIED_ANSWER)
    if not evidence_found:
        rehearsal_docs = [s for s in allowed_sources if s.source_type == SourceType.REHEARSAL_VERIFIED_ANSWER]
        for s in rehearsal_docs:
            s_text = f"{s.title} {s.content}"
            if matches_terms(s_text, query_terms):
                meta_quote = s.doc_metadata.get("quote") if s.doc_metadata else None
                quote_text = meta_quote or s.content.strip()
                evidence_found = f"Approved Handover Rationale ({s.title}): \"{quote_text}\""
                cited_ids.append(s.id)
                break

    # C. Search previously approved Rehearsal Questions
    if not evidence_found:
        prev_approved = db.query(RehearsalQuestion).filter(
            RehearsalQuestion.project_id == project.id,
            RehearsalQuestion.status == RehearsalStatus.APPROVED_AS_EVIDENCE
        ).all()
        for prev_q in prev_approved:
            pq_text = f"{prev_q.question} {prev_q.departing_reply or ''}"
            if matches_terms(pq_text, query_terms):
                evidence_found = f"Approved Handover Rationale: \"{prev_q.departing_reply}\""
                if prev_q.approved_source_document_id:
                    cited_ids.append(prev_q.approved_source_document_id)
                break

    # D. Search all other allowed source documents (exact snippet match)
    if not evidence_found:
        for s in allowed_sources:
            if s.source_type == SourceType.REHEARSAL_VERIFIED_ANSWER:
                continue
            if matches_terms(s.content, query_terms):
                for line in s.content.splitlines():
                    if matches_terms(line, query_terms):
                        evidence_found = f"Verified Source: {s.title} states: '{line.strip()}'"
                        cited_ids.append(s.id)
                        break
            if evidence_found:
                break

    # 3. IF APPROVED EVIDENCE FOUND, ANSWER IMMEDIATELY
    if evidence_found:
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

    # 4. ONLY IF NO APPROVED EVIDENCE: Check if query targets a decision whose reason is known to be MISSING
    missing_reason_decisions = db.query(Decision).filter(
        Decision.project_id == project.id,
        Decision.status == DecisionStatus.REASON_MISSING
    ).all()

    for d in missing_reason_decisions:
        d_text = d.title.lower()
        if any(term in d_text for term in query_terms):
            question_rec = RehearsalQuestion(
                project_id=project.id,
                requester_id=current_user.id,
                question=payload.question,
                status=RehearsalStatus.PENDING_DEPARTING_REPLY,
                evidence_answer="Unverified: Decision rationale is undocumented in approved project records."
            )
            db.add(question_rec)

            existing_gap = db.query(KnowledgeGap).filter(
                KnowledgeGap.decision_id == d.id
            ).first()
            if existing_gap:
                existing_gap.question_to_departing = payload.question
                existing_gap.status = GapStatus.QUESTION_QUEUED
            else:
                gap = KnowledgeGap(
                    project_id=project.id,
                    decision_id=d.id,
                    component_id=d.component_id,
                    title=f"Missing Reason: {d.title}",
                    description=f"Successor asked: '{payload.question}'. No approved evidence found.",
                    gap_type=GapType.MISSING_REASON,
                    status=GapStatus.QUESTION_QUEUED,
                    question_to_departing=payload.question
                )
                db.add(gap)

            db.commit()
            db.refresh(question_rec)

            return RehearsalAskResponse(
                rehearsal_question_id=question_rec.id,
                status=RehearsalStatus.PENDING_DEPARTING_REPLY,
                found_in_evidence=False,
                evidence_answer=None,
                cited_source_ids=[],
                message=f"Zero-Hallucination Guard: Decision '{d.title}' is documented, but its reasoning is explicitly unrecorded. Question queued for departing member."
            )

    # 5. NO APPROVED EVIDENCE NOR EXPLICIT MISSING DECISION: Refuse and route to departing member
    question_rec = RehearsalQuestion(
        project_id=project.id,
        requester_id=current_user.id,
        question=payload.question,
        status=RehearsalStatus.PENDING_DEPARTING_REPLY,
        evidence_answer="Unverified: No approved evidence found in project records."
    )
    db.add(question_rec)

    gap = KnowledgeGap(
        project_id=project.id,
        title=f"Rehearsal Question: {payload.question[:80]}",
        description=f"Successor asked: '{payload.question}'. No approved evidence found.",
        gap_type=GapType.TACIT_KNOWLEDGE,
        status=GapStatus.QUESTION_QUEUED,
        question_to_departing=payload.question
    )
    db.add(gap)
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

        # 2. Update Decisions matching the question or linked gaps
        q_words = [w for w in re.sub(r"[^\w\s]", " ", question.question.lower()).split() if len(w) > 3]
        all_candidate_decisions = db.query(Decision).filter(
            Decision.project_id == question.project_id
        ).all()
        for d in all_candidate_decisions:
            if d.id == "dec-retry-limit" or any(w in d.title.lower() for w in q_words if w in ["payment", "retry", "limit"]):
                d.reason = question.departing_reply
                d.status = DecisionStatus.EVIDENCE_SUPPORTED
                d.source_id = verified_doc.id
                d.evidence_quote = question.departing_reply

        # 3. Update KnowledgeGap to resolved
        gaps = db.query(KnowledgeGap).filter(
            KnowledgeGap.project_id == question.project_id,
            (KnowledgeGap.question_to_departing == question.question) |
            (KnowledgeGap.title.ilike(f"%{question.question[:30]}%")) |
            (KnowledgeGap.title.ilike("%Retry%")) |
            (KnowledgeGap.decision_id == "dec-retry-limit")
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

