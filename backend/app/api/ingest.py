import csv
import io
import json
import os
import urllib.error
import urllib.request
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
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


class GitHubIngestRequest(BaseModel):
    repo_slug: Optional[str] = Field(default=None, description="Public GitHub repository in 'owner/repo' format")
    title: Optional[str] = None
    access_level: AccessLevel = Field(default=AccessLevel.RESTRICTED_TEAM)
    commits: Optional[List[Dict[str, Any]]] = None
    issues: Optional[List[Dict[str, Any]]] = None


class IngestResponse(BaseModel):
    message: str
    source_document: SourceDocumentRead
    components_extracted: List[ComponentRead]
    decisions_extracted: List[DecisionRead]
    dependencies_extracted: List[DependencyRead]
    failure_records_extracted: List[FailureRecordRead]
    knowledge_gaps_flagged: List[KnowledgeGapRead]
    summary: Dict[str, Any]


def _execute_ingest(
    project: Project,
    current_user: User,
    db: Session,
    title: str,
    source_type: SourceType,
    content: str,
    access_level: AccessLevel,
    doc_metadata: Optional[Dict[str, Any]] = None,
    structured_payload: Optional[Dict[str, Any]] = None,
) -> IngestResponse:
    """Persist SourceDocument, run deterministic extraction + verbatim verification, and commit."""
    document = SourceDocument(
        project_id=project.id,
        title=title,
        source_type=source_type,
        content=content,
        doc_metadata=doc_metadata,
        access_level=access_level,
        created_by_id=current_user.id
    )
    db.add(document)
    db.flush()

    extractor = RulesBasedExtractor(
        db=db,
        project_id=project.id,
        default_owner_id=project.departing_member_id
    )
    extraction_result = extractor.extract_from_document(
        document=document,
        structured_payload=structured_payload
    )

    db.commit()

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


def _parse_uploaded_file_bytes(filename: str, raw_bytes: bytes) -> tuple[str, SourceType, Optional[Dict[str, Any]]]:
    ext = os.path.splitext(filename.lower())[1]
    if ext in {".txt", ".md", ".py", ".ts", ".tsx", ".js", ".yaml", ".yml", ".env"}:
        return raw_bytes.decode("utf-8", errors="replace"), SourceType.DOC, None

    if ext == ".json":
        text = raw_bytes.decode("utf-8", errors="replace")
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and any(k in parsed for k in ("components", "decisions", "dependencies", "failures")):
                return text, SourceType.TASK_EXPORT, parsed
            return json.dumps(parsed, indent=2), SourceType.TASK_EXPORT, None
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid JSON file: {exc}")

    if ext == ".csv":
        text = raw_bytes.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = [" | ".join(f"{k}: {v}" for k, v in row.items() if v) for row in reader]
        normalized = "\n".join(rows) if rows else text
        return normalized, SourceType.TASK_EXPORT, None

    if ext == ".pdf":
        try:
            from pypdf import PdfReader  # type: ignore
            pdf_reader = PdfReader(io.BytesIO(raw_bytes))
            extracted = "\n".join((page.extract_text() or "") for page in pdf_reader.pages).strip()
            if not extracted:
                raise HTTPException(status_code=400, detail="PDF contained no extractable text.")
            return extracted, SourceType.PDF, None
        except ImportError:
            raise HTTPException(
                status_code=400,
                detail="PDF parser ('pypdf') is not installed in this environment. Upload .txt, .md, .json, or .csv instead."
            )

    if ext == ".docx":
        try:
            import docx  # type: ignore
            doc = docx.Document(io.BytesIO(raw_bytes))
            extracted = "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()
            return extracted, SourceType.DOC, None
        except ImportError:
            raise HTTPException(
                status_code=400,
                detail="DOCX parser ('python-docx') is not installed in this environment. Upload .txt, .md, .json, or .csv instead."
            )

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file extension '{ext}'. Supported: .txt, .md, .json, .csv, .py, .ts, .js, .pdf, .docx"
    )


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
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    return _execute_ingest(
        project=project,
        current_user=current_user,
        db=db,
        title=payload.title,
        source_type=payload.source_type,
        content=payload.content,
        access_level=payload.access_level,
        doc_metadata=payload.doc_metadata,
        structured_payload=payload.structured_payload,
    )


@router.post(
    "/{id}/ingest/file",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and parse a source artifact (.txt, .md, .json, .csv, code) for deterministic extraction"
)
async def ingest_project_file(
    id: str,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    access_level: AccessLevel = Form(AccessLevel.RESTRICTED_TEAM),
    source_type: Optional[SourceType] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.DEPARTING_MEMBER]))
):
    project = verify_project_access(project_id=id, current_user=current_user, db=db)
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    filename = file.filename or "uploaded_artifact.txt"
    parsed_content, inferred_type, structured_payload = _parse_uploaded_file_bytes(filename, raw_bytes)
    doc_title = title.strip() if title and title.strip() else filename

    return _execute_ingest(
        project=project,
        current_user=current_user,
        db=db,
        title=doc_title,
        source_type=source_type or inferred_type,
        content=parsed_content,
        access_level=access_level,
        doc_metadata={"uploaded_filename": filename, "byte_size": len(raw_bytes)},
        structured_payload=structured_payload,
    )


@router.post(
    "/{id}/ingest/github",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest commits/issues from exported GitHub JSON or public GitHub repository API"
)
def ingest_github_source(
    id: str,
    payload: GitHubIngestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.DEPARTING_MEMBER]))
):
    project = verify_project_access(project_id=id, current_user=current_user, db=db)

    lines: List[str] = []
    commits = payload.commits or []
    issues = payload.issues or []

    if payload.repo_slug and not commits and not issues:
        slug = payload.repo_slug.strip().strip("/")
        if "/" not in slug or len(slug.split("/")) != 2:
            raise HTTPException(status_code=400, detail="repo_slug must be in 'owner/repo' format.")
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "Cairn-Continuity-Platform"}
        try:
            req_c = urllib.request.Request(f"https://api.github.com/repos/{slug}/commits?per_page=10", headers=headers)
            with urllib.request.urlopen(req_c, timeout=8) as resp:
                raw_commits = json.loads(resp.read().decode("utf-8"))
                for item in raw_commits if isinstance(raw_commits, list) else []:
                    commit_obj = item.get("commit", {})
                    commits.append({
                        "sha": str(item.get("sha", ""))[:7],
                        "author": (commit_obj.get("author") or {}).get("name", "unknown"),
                        "message": commit_obj.get("message", ""),
                    })
            req_i = urllib.request.Request(f"https://api.github.com/repos/{slug}/issues?state=all&per_page=10", headers=headers)
            with urllib.request.urlopen(req_i, timeout=8) as resp:
                raw_issues = json.loads(resp.read().decode("utf-8"))
                for item in raw_issues if isinstance(raw_issues, list) else []:
                    issues.append({
                        "number": item.get("number"),
                        "title": item.get("title", ""),
                        "body": item.get("body", "") or "",
                    })
        except urllib.error.HTTPError as exc:
            raise HTTPException(status_code=400, detail=f"GitHub API returned HTTP {exc.code} for '{slug}'.")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch public GitHub repository '{slug}': {exc}")

    for c in commits:
        sha = c.get("sha", "commit")
        author = c.get("author", "unknown")
        msg = str(c.get("message", "")).strip()
        if msg:
            lines.append(f"commit {sha} by {author}: {msg}")

    for iss in issues:
        num = iss.get("number", "?")
        ititle = str(iss.get("title", "")).strip()
        ibody = str(iss.get("body", "")).strip()
        if ititle or ibody:
            lines.append(f"Issue #{num}: {ititle}. {ibody}".strip())

    if not lines:
        raise HTTPException(status_code=400, detail="No GitHub commits or issues supplied or returned from repository.")

    content = "\n".join(lines)
    doc_title = payload.title or f"GitHub Import: {payload.repo_slug or 'Commits & Issues Export'}"

    return _execute_ingest(
        project=project,
        current_user=current_user,
        db=db,
        title=doc_title,
        source_type=SourceType.GITHUB_COMMIT,
        content=content,
        access_level=payload.access_level,
        doc_metadata={"repo_slug": payload.repo_slug, "commits_count": len(commits), "issues_count": len(issues)},
    )
