from enum import Enum
from datetime import datetime
from typing import Optional, List
import uuid

from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Enum as SQLEnum,
    Integer,
    JSON,
    Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def generate_uuid() -> str:
    return str(uuid.uuid4())

# ==========================================
# ENUMS & CONSTANTS (Data Boundaries & RBAC)
# ==========================================

class UserRole(str, Enum):
    MANAGER = "MANAGER"
    DEPARTING_MEMBER = "DEPARTING_MEMBER"
    INCOMING_MEMBER = "INCOMING_MEMBER"


class SourceType(str, Enum):
    DOC = "DOC"
    PDF = "PDF"
    GITHUB_COMMIT = "GITHUB_COMMIT"
    GITHUB_ISSUE = "GITHUB_ISSUE"
    TASK_EXPORT = "TASK_EXPORT"
    APPROVED_NOTE = "APPROVED_NOTE"
    REHEARSAL_VERIFIED_ANSWER = "REHEARSAL_VERIFIED_ANSWER"


class AccessLevel(str, Enum):
    PUBLIC = "PUBLIC"
    RESTRICTED_TEAM = "RESTRICTED_TEAM"
    RESTRICTED_MANAGER = "RESTRICTED_MANAGER"


class ComponentStatus(str, Enum):
    ACTIVE = "ACTIVE"
    IN_PROGRESS = "IN_PROGRESS"
    DEPRECATED = "DEPRECATED"


class DecisionStatus(str, Enum):
    EVIDENCE_SUPPORTED = "evidence_supported"
    REASON_MISSING = "reason_missing"
    UNVERIFIED = "unverified"
    CONFLICTING = "conflicting"


class DependencyType(str, Enum):
    CALLS_API = "CALLS_API"
    SHARED_DATABASE = "SHARED_DATABASE"
    CONFIG_DEPENDENCY = "CONFIG_DEPENDENCY"
    DEPLOYMENT_ORDER = "DEPLOYMENT_ORDER"
    CODE_IMPORT = "CODE_IMPORT"


class GapType(str, Enum):
    MISSING_REASON = "MISSING_REASON"
    UNASSIGNED_WORK = "UNASSIGNED_WORK"
    HIDDEN_DEPENDENCY = "HIDDEN_DEPENDENCY"
    TACIT_KNOWLEDGE = "TACIT_KNOWLEDGE"
    UNVERIFIED_ASSUMPTION = "UNVERIFIED_ASSUMPTION"


class GapStatus(str, Enum):
    OPEN = "OPEN"
    QUESTION_QUEUED = "QUESTION_QUEUED"
    PENDING_REVIEW = "pending_review"
    APPROVED_AS_EVIDENCE = "APPROVED_AS_EVIDENCE"
    DISMISSED = "DISMISSED"


class RehearsalStatus(str, Enum):
    ANSWERED_FROM_EVIDENCE = "ANSWERED_FROM_EVIDENCE"
    PENDING_DEPARTING_REPLY = "PENDING_DEPARTING_REPLY"
    PENDING_REVIEW = "pending_review"
    APPROVED_AS_EVIDENCE = "APPROVED_AS_EVIDENCE"
    REJECTED = "REJECTED"


# ==========================================
# SQLALCHEMY RELATIONAL MODELS
# ==========================================

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.INCOMING_MEMBER)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    owned_components = relationship("Component", back_populates="owner", foreign_keys="Component.owner_id")
    reviewed_gaps = relationship("KnowledgeGap", back_populates="reviewer", foreign_keys="KnowledgeGap.reviewer_id")
    rehearsal_queries = relationship("RehearsalQuestion", back_populates="requester", foreign_keys="RehearsalQuestion.requester_id")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    repository_url = Column(String(512), nullable=True)

    # MVP Scope Lock: 1 Manager, 1 Departing Member, 1 Incoming Member
    manager_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    departing_member_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    incoming_member_id = Column(String(36), ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    manager = relationship("User", foreign_keys=[manager_id])
    departing_member = relationship("User", foreign_keys=[departing_member_id])
    incoming_member = relationship("User", foreign_keys=[incoming_member_id])

    documents = relationship("SourceDocument", back_populates="project", cascade="all, delete-orphan")
    components = relationship("Component", back_populates="project", cascade="all, delete-orphan")
    decisions = relationship("Decision", back_populates="project", cascade="all, delete-orphan")
    dependencies = relationship("Dependency", back_populates="project", cascade="all, delete-orphan")
    failure_records = relationship("FailureRecord", back_populates="project", cascade="all, delete-orphan")
    knowledge_gaps = relationship("KnowledgeGap", back_populates="project", cascade="all, delete-orphan")
    rehearsal_questions = relationship("RehearsalQuestion", back_populates="project", cascade="all, delete-orphan")


class SourceDocument(Base):
    """
    Authorized ground-truth document or artifact.
    Every single decision, component, failure record, and dependency MUST point to a valid SourceDocument.
    """
    __tablename__ = "source_documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    source_type = Column(SQLEnum(SourceType), nullable=False)
    content = Column(Text, nullable=False)
    doc_metadata = Column(JSON, nullable=True)  # File hashes, commit SHA, page numbers, line ranges
    access_level = Column(SQLEnum(AccessLevel), nullable=False, default=AccessLevel.RESTRICTED_TEAM)
    created_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="documents")
    creator = relationship("User", foreign_keys=[created_by_id])
    components = relationship("Component", back_populates="source")
    decisions = relationship("Decision", back_populates="source")
    dependencies = relationship("Dependency", back_populates="source")
    failure_records = relationship("FailureRecord", back_populates="source")

    __table_args__ = (
        Index("idx_doc_project_access", "project_id", "access_level"),
    )


class Component(Base):
    """
    A software module, service, API, or architectural building block.
    """
    __tablename__ = "components"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    source_id = Column(String(36), ForeignKey("source_documents.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(SQLEnum(ComponentStatus), nullable=False, default=ComponentStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="components")
    owner = relationship("User", back_populates="owned_components", foreign_keys=[owner_id])
    source = relationship("SourceDocument", back_populates="components")

    decisions = relationship("Decision", back_populates="component", cascade="all, delete-orphan")
    failure_records = relationship("FailureRecord", back_populates="component", cascade="all, delete-orphan")
    knowledge_gaps = relationship("KnowledgeGap", back_populates="component")

    # Downstream / Upstream dependencies
    outbound_dependencies = relationship(
        "Dependency",
        foreign_keys="Dependency.source_component_id",
        back_populates="source_component",
        cascade="all, delete-orphan"
    )
    inbound_dependencies = relationship(
        "Dependency",
        foreign_keys="Dependency.target_component_id",
        back_populates="target_component",
        cascade="all, delete-orphan"
    )


class Decision(Base):
    """
    An architectural or technical decision.
    INVARIANT 1: Zero-Hallucination Mandate.
    If no explanation is explicitly documented, reason MUST be null and status MUST be 'reason_missing'.
    """
    __tablename__ = "decisions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    component_id = Column(String(36), ForeignKey("components.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    reason = Column(Text, nullable=True)  # Strictly null if not found in evidence
    status = Column(SQLEnum(DecisionStatus), nullable=False, default=DecisionStatus.REASON_MISSING)
    source_id = Column(String(36), ForeignKey("source_documents.id", ondelete="RESTRICT"), nullable=False, index=True)
    evidence_quote = Column(Text, nullable=True)  # Exact verbatim text snippet from source
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="decisions")
    component = relationship("Component", back_populates="decisions")
    source = relationship("SourceDocument", back_populates="decisions")
    knowledge_gaps = relationship("KnowledgeGap", back_populates="decision")


class Dependency(Base):
    """
    Deterministic directional connection between two components.
    source_component depends on target_component.
    """
    __tablename__ = "dependencies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_component_id = Column(String(36), ForeignKey("components.id", ondelete="CASCADE"), nullable=False, index=True)
    target_component_id = Column(String(36), ForeignKey("components.id", ondelete="CASCADE"), nullable=False, index=True)
    dependency_type = Column(SQLEnum(DependencyType), nullable=False)
    description = Column(Text, nullable=True)
    is_hidden = Column(Boolean, default=False, nullable=False)  # Hidden dependencies flagged in review/extraction
    source_id = Column(String(36), ForeignKey("source_documents.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="dependencies")
    source_component = relationship("Component", foreign_keys=[source_component_id], back_populates="outbound_dependencies")
    target_component = relationship("Component", foreign_keys=[target_component_id], back_populates="inbound_dependencies")
    source = relationship("SourceDocument", back_populates="dependencies")

    __table_args__ = (
        Index("idx_dependency_pair", "source_component_id", "target_component_id"),
    )


class FailureRecord(Base):
    """
    Explainable Failure Evidence: earlier failed attempts, errors, and fixes with sources.
    """
    __tablename__ = "failure_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    component_id = Column(String(36), ForeignKey("components.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    error_message = Column(Text, nullable=False)
    attempted_fix = Column(Text, nullable=False)
    resolution = Column(Text, nullable=True)
    is_resolved = Column(Boolean, default=True, nullable=False)
    source_id = Column(String(36), ForeignKey("source_documents.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="failure_records")
    component = relationship("Component", back_populates="failure_records")
    source = relationship("SourceDocument", back_populates="failure_records")


class KnowledgeGap(Base):
    """
    Identified absence of critical knowledge (e.g., missing decision reason, undocumented dependency, single point of failure).
    """
    __tablename__ = "knowledge_gaps"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    component_id = Column(String(36), ForeignKey("components.id", ondelete="SET NULL"), nullable=True, index=True)
    decision_id = Column(String(36), ForeignKey("decisions.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    gap_type = Column(SQLEnum(GapType), nullable=False)
    status = Column(SQLEnum(GapStatus), nullable=False, default=GapStatus.OPEN)

    # Invariant 3: Departing replies remain pending_review until Manager sign-off
    question_to_departing = Column(Text, nullable=True)
    departing_member_reply = Column(Text, nullable=True)
    review_notes = Column(Text, nullable=True)
    reviewer_id = Column(String(36), ForeignKey("users.id"), nullable=True)

    # Generated verified document link once approved
    verified_source_id = Column(String(36), ForeignKey("source_documents.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="knowledge_gaps")
    component = relationship("Component", back_populates="knowledge_gaps")
    decision = relationship("Decision", back_populates="knowledge_gaps")
    reviewer = relationship("User", back_populates="reviewed_gaps", foreign_keys=[reviewer_id])
    verified_source = relationship("SourceDocument", foreign_keys=[verified_source_id])


class RehearsalQuestion(Base):
    """
    Tracks questions asked during Handover Rehearsal by successors.
    Must cite sources or route directly to departing member with status 'pending_review' until approved.
    """
    __tablename__ = "rehearsal_questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    requester_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    question = Column(Text, nullable=False)
    status = Column(SQLEnum(RehearsalStatus), nullable=False, default=RehearsalStatus.ANSWERED_FROM_EVIDENCE)
    
    # Evidence citation
    evidence_answer = Column(Text, nullable=True)
    cited_source_ids = Column(JSON, nullable=True)  # List of source document IDs supporting answer
    
    # Escalated response workflow
    departing_reply = Column(Text, nullable=True)
    manager_review_comment = Column(Text, nullable=True)
    approved_source_document_id = Column(String(36), ForeignKey("source_documents.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="rehearsal_questions")
    requester = relationship("User", back_populates="rehearsal_queries", foreign_keys=[requester_id])
    approved_source = relationship("SourceDocument", foreign_keys=[approved_source_document_id])

