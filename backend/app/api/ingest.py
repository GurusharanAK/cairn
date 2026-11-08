from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.security import get_current_user, verify_project_access, require_role
from app.models.models import (
    User,
    UserRole,
    Project,
    SourceDocument,
    SourceType,
    AccessLevel,
    DecisionStatus
)
from app.schemas.schemas import (
    SourceDocumentRead,
    ComponentRead,
    DecisionRead,
    DependencyRead,
    FailureRecordRead,
    KnowledgeGapRead
)
from app.services.extractor import RulesBasedExtractor

router = APIRouter(prefix="/api/projects", tags=["Ingestion"])


class IngestRequest(BaseModel):
    title: str = Field(..., description="Title of the source document or artifact")
    source_type: SourceType = Field(..., description="Document type: DOC, PDF, GITHUB_COMMIT, etc.")
    content: str = Field(..., description="Raw text content or document dump")
    access_level: AccessLevel = Field(default=AccessLevel.RESTRICTED_TEAM)
    doc_metadata: Optional[Dict[str, Any]] = None
    structured_payload: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional structured entities parsed from AST/Git/Tasks to enforce zero-hallucination validation"
    )


class IngestResponse(BaseModel):
    message: str
    source_document: SourceDocumentRead
    components_extracted: List[ComponentRead]
    decisions_extracted: List[DecisionRead]
    dependencies_extracted: List[DependencyRead]
    failure_records_extracted: List[FailureRecordRead]
    knowledge_gaps_flagged: List[KnowledgeGapRead]
    summary: Dict[str, Any]


@router.post(
    "/{id}/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest authorized project source and execute deterministic extraction"
)
def ingest_project_source(
    id: str,
    payload: IngestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.DEPARTING_MEMBER]))
):
    """
    Ingests an authorized document into Cairn, enforcing:
    1. Database-level Project and RBAC boundary checks.
    2. Zero-Hallucination Mandate: Every extracted item is explicitly bound to source_id.
    3. Missing reasons are strictly marked 'reason_missing' with reason=None.
    4. Automatically flags open KnowledgeGaps for unaccounted decisions and tacit knowledge.
    """
    # 1. Enforce query-level project boundary access
    project = verify_project_access(project_id=id, current_user=current_user, db=db)

    # 2. Persist the ground-truth SourceDocument first to establish source_id
    document = SourceDocument(
        project_id=project.id,
        title=payload.title,
        source_type=payload.source_type,
        content=payload.content,
        doc_metadata=payload.doc_metadata,
        access_level=payload.access_level,
        created_by_id=current_user.id
    )
    db.add(document)
    db.flush()  # Generates document.id for strict relational foreign key bindings

    # 3. Execute Deterministic Rules-Based Extraction
    extractor = RulesBasedExtractor(
        db=db,
        project_id=project.id,
        default_owner_id=project.departing_member_id
    )

    extraction_result = extractor.extract_from_document(
        document=document,
        structured_payload=payload.structured_payload
    )

    # 4. Commit atomic transaction
    db.commit()

    # Refresh models for response serialization
    db.refresh(document)
    for c in extraction_result.components:
        db.refresh(c)
    for d in extraction_result.decisions:
        db.refresh(d)
    for dep in extraction_result.dependencies:
        db.refresh(dep)
    for f in extraction_result.failure_records:
        db.refresh(f)
    for g in extraction_result.knowledge_gaps:
        db.refresh(g)

    # Count statistics
    missing_reasons_count = sum(
        1 for d in extraction_result.decisions if d.status == DecisionStatus.REASON_MISSING
    )
    evidence_supported_count = sum(
        1 for d in extraction_result.decisions if d.status == DecisionStatus.EVIDENCE_SUPPORTED
    )

    return IngestResponse(
        message="Source ingested and rules-based extraction completed successfully.",
        source_document=SourceDocumentRead.model_validate(document),
        components_extracted=[ComponentRead.model_validate(c) for c in extraction_result.components],
        decisions_extracted=[DecisionRead.model_validate(d) for d in extraction_result.decisions],
        dependencies_extracted=[DependencyRead.model_validate(dep) for dep in extraction_result.dependencies],
        failure_records_extracted=[FailureRecordRead.model_validate(f) for f in extraction_result.failure_records],
        knowledge_gaps_flagged=[KnowledgeGapRead.model_validate(g) for g in extraction_result.knowledge_gaps],
        summary={
            "source_id": document.id,
            "components_count": len(extraction_result.components),
            "decisions_count": len(extraction_result.decisions),
            "evidence_supported_decisions": evidence_supported_count,
            "reason_missing_decisions": missing_reasons_count,
            "dependencies_count": len(extraction_result.dependencies),
            "failures_count": len(extraction_result.failure_records),
            "knowledge_gaps_count": len(extraction_result.knowledge_gaps)
        }
    )

