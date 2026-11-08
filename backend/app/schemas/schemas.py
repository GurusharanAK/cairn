from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from app.models.models import (
    UserRole,
    SourceType,
    AccessLevel,
    ComponentStatus,
    DecisionStatus,
    DependencyType,
    GapType,
    GapStatus,
    RehearsalStatus
)

# ==========================================
# BASE CONFIG
# ==========================================
class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# ==========================================
# USER SCHEMAS
# ==========================================
class UserBase(OrmBase):
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True

class UserCreate(OrmBase):
    email: EmailStr
    full_name: str
    role: UserRole

class UserRead(UserBase):
    id: str
    created_at: datetime

# ==========================================
# SOURCE DOCUMENT SCHEMAS
# ==========================================
class SourceDocumentBase(OrmBase):
    title: str
    source_type: SourceType
    content: str
    doc_metadata: Optional[Dict[str, Any]] = None
    access_level: AccessLevel = AccessLevel.RESTRICTED_TEAM

class SourceDocumentCreate(SourceDocumentBase):
    project_id: str
    created_by_id: Optional[str] = None

class SourceDocumentRead(SourceDocumentBase):
    id: str
    project_id: str
    created_by_id: Optional[str] = None
    created_at: datetime

# ==========================================
# COMPONENT SCHEMAS
# Invariant: Every Component MUST carry a valid source_id
# ==========================================
class ComponentBase(OrmBase):
    name: str
    description: Optional[str] = None
    status: ComponentStatus = ComponentStatus.ACTIVE

class ComponentCreate(ComponentBase):
    project_id: str
    owner_id: str
    source_id: str = Field(..., description="Mandatory ground-truth document ID")

class ComponentRead(ComponentBase):
    id: str
    project_id: str
    owner_id: str
    source_id: str
    created_at: datetime
    updated_at: datetime

# ==========================================
# DECISION SCHEMAS
# Invariant: Zero-hallucination mandate.
# If reason missing, reason=None, status='reason_missing'
# ==========================================
class DecisionBase(OrmBase):
    title: str
    reason: Optional[str] = None
    status: DecisionStatus = DecisionStatus.REASON_MISSING
    evidence_quote: Optional[str] = None

class DecisionCreate(DecisionBase):
    project_id: str
    component_id: Optional[str] = None
    source_id: str = Field(..., description="Mandatory ground-truth document ID")

class DecisionRead(DecisionBase):
    id: str
    project_id: str
    component_id: Optional[str] = None
    source_id: str
    created_at: datetime
    updated_at: datetime

# ==========================================
# DEPENDENCY SCHEMAS
# Invariant: Deterministic directional relationship with source attribution
# ==========================================
class DependencyBase(OrmBase):
    dependency_type: DependencyType
    description: Optional[str] = None
    is_hidden: bool = False

class DependencyCreate(DependencyBase):
    project_id: str
    source_component_id: str
    target_component_id: str
    source_id: str = Field(..., description="Mandatory ground-truth document ID")

class DependencyRead(DependencyBase):
    id: str
    project_id: str
    source_component_id: str
    target_component_id: str
    source_id: str
    created_at: datetime

# ==========================================
# FAILURE RECORD SCHEMAS
# Explainable failure evidence
# ==========================================
class FailureRecordBase(OrmBase):
    title: str
    error_message: str
    attempted_fix: str
    resolution: Optional[str] = None
    is_resolved: bool = True

class FailureRecordCreate(FailureRecordBase):
    project_id: str
    component_id: str
    source_id: str = Field(..., description="Mandatory ground-truth document ID")

class FailureRecordRead(FailureRecordBase):
    id: str
    project_id: str
    component_id: str
    source_id: str
    created_at: datetime

# ==========================================
# KNOWLEDGE GAP SCHEMAS
# ==========================================
class KnowledgeGapBase(OrmBase):
    title: str
    description: str
    gap_type: GapType
    status: GapStatus = GapStatus.OPEN
    question_to_departing: Optional[str] = None
    departing_member_reply: Optional[str] = None
    review_notes: Optional[str] = None

class KnowledgeGapCreate(KnowledgeGapBase):
    project_id: str
    component_id: Optional[str] = None
    decision_id: Optional[str] = None

class KnowledgeGapRead(KnowledgeGapBase):
    id: str
    project_id: str
    component_id: Optional[str] = None
    decision_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    verified_source_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# ==========================================
# REHEARSAL QUESTION SCHEMAS
# ==========================================
class RehearsalQuestionBase(OrmBase):
    question: str

class RehearsalQuestionCreate(RehearsalQuestionBase):
    project_id: str

class RehearsalQuestionRead(RehearsalQuestionBase):
    id: str
    project_id: str
    requester_id: str
    status: RehearsalStatus
    evidence_answer: Optional[str] = None
    cited_source_ids: Optional[List[str]] = None
    departing_reply: Optional[str] = None
    manager_review_comment: Optional[str] = None
    approved_source_document_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# ==========================================
# PROJECT SCHEMAS (MVP Scope: 1 Project, 1 Leaving)
# ==========================================
class ProjectBase(OrmBase):
    name: str
    description: Optional[str] = None
    repository_url: Optional[str] = None

class ProjectCreate(ProjectBase):
    manager_id: str
    departing_member_id: str
    incoming_member_id: Optional[str] = None

class ProjectRead(ProjectBase):
    id: str
    manager_id: str
    departing_member_id: str
    incoming_member_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class ProjectDetailRead(ProjectRead):
    documents: List[SourceDocumentRead] = []
    components: List[ComponentRead] = []
    decisions: List[DecisionRead] = []
    dependencies: List[DependencyRead] = []
    failure_records: List[FailureRecordRead] = []
    knowledge_gaps: List[KnowledgeGapRead] = []

