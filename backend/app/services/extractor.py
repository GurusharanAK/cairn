import re
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.models.models import (
    Component,
    ComponentStatus,
    Decision,
    DecisionStatus,
    Dependency,
    DependencyType,
    FailureRecord,
    KnowledgeGap,
    GapType,
    GapStatus,
    SourceDocument,
    User
)


class ExtractionResult:
    def __init__(self):
        self.components: List[Component] = []
        self.decisions: List[Decision] = []
        self.dependencies: List[Dependency] = []
        self.failure_records: List[FailureRecord] = []
        self.knowledge_gaps: List[KnowledgeGap] = []


class RulesBasedExtractor:
    """
    Deterministic Ingestion & Extraction Engine.
    STRICT INVARIANT: ZERO-HALLUCINATION MANDATE.
    - Every extracted item MUST have source_id populated with the actual SourceDocument ID.
    - If a decision does not contain an explicit documented reason, reason is set to None
      and status is set to 'reason_missing'. It will NEVER infer or make up context.
    - Automatically surfaces KnowledgeGaps for any reason_missing decision or tacit dependency.
    """

    REASON_MARKERS = [
        r"because\s+([^.\n;]+)",
        r"reason:\s*([^.\n;]+)",
        r"due to\s+([^.\n;]+)",
        r"in order to\s+([^.\n;]+)",
        r"since\s+([^.\n;]+)",
        r"rationale:\s*([^.\n;]+)"
    ]

    DEPENDENCY_MARKERS = [
        r"(\w[\w\s-]{1,30}?)\s+(?:depends on|calls|requires|needs|relies on)\s+(\w[\w\s-]{1,30})",
        r"(\w[\w\s-]{1,30}?)\s+API used by\s+(\w[\w\s-]{1,30})"
    ]

    FAILURE_MARKERS = [
        r"(?:failed|failure|error|bug|crashed):\s*([^.\n;]+)(?:.*?attempted fix:\s*([^.\n;]+))?(?:.*?resolved by:\s*([^.\n;]+))?"
    ]

    def __init__(self, db: Session, project_id: str, default_owner_id: str):
        self.db = db
        self.project_id = project_id
        self.default_owner_id = default_owner_id

    def extract_from_document(
        self,
        document: SourceDocument,
        structured_payload: Optional[Dict[str, Any]] = None
    ) -> ExtractionResult:
        result = ExtractionResult()

        # 1. If structured payload is supplied (e.g., from validated tool / AST / task tracker),
        # enforce zero-hallucination validation before database mapping.
        if structured_payload:
            self._process_structured_payload(document, structured_payload, result)
        else:
            # 2. Parse unstructured text chunks using deterministic rule-based boundary checks
            self._process_unstructured_text(document, result)

        return result

    def _process_structured_payload(
        self,
        document: SourceDocument,
        payload: Dict[str, Any],
        result: ExtractionResult
    ):
        component_cache: Dict[str, Component] = {}

        # A. Process Components
        for comp_data in payload.get("components", []):
            owner_id = comp_data.get("owner_id") or self.default_owner_id
            
            comp = Component(
                project_id=self.project_id,
                name=comp_data["name"].strip(),
                description=comp_data.get("description"),
                owner_id=owner_id,
                source_id=document.id,  # Strict source attribution
                status=ComponentStatus(comp_data.get("status", ComponentStatus.ACTIVE.value))
            )
            self.db.add(comp)
            self.db.flush()
            component_cache[comp.name.lower()] = comp
            result.components.append(comp)

        # B. Process Decisions (ZERO-HALLUCINATION ENFORCEMENT)
        for dec_data in payload.get("decisions", []):
            title = dec_data.get("title", "").strip()
            raw_reason = dec_data.get("reason")
            evidence_quote = dec_data.get("evidence_quote")

            # Check if reason is actually provided in the evidence
            if raw_reason and str(raw_reason).strip():
                clean_reason = str(raw_reason).strip()
                status = DecisionStatus.EVIDENCE_SUPPORTED
            else:
                # INVARIANT 1: Zero-Hallucination Mandate
                clean_reason = None
                status = DecisionStatus.REASON_MISSING

            # Match component if possible
            comp_name = dec_data.get("component_name")
            matched_comp_id = None
            if comp_name and comp_name.lower() in component_cache:
                matched_comp_id = component_cache[comp_name.lower()].id

            decision = Decision(
                project_id=self.project_id,
                component_id=matched_comp_id,
                title=title,
                reason=clean_reason,
                status=status,
                source_id=document.id,  # Mandatory source_id
                evidence_quote=evidence_quote
            )
            self.db.add(decision)
            self.db.flush()
            result.decisions.append(decision)

            # If reason is missing, automatically instantiate a KnowledgeGap
            if status == DecisionStatus.REASON_MISSING:
                gap = KnowledgeGap(
                    project_id=self.project_id,
                    component_id=matched_comp_id,
                    decision_id=decision.id,
                    title=f"Missing Reason: {decision.title}",
                    description=f"Decision '{decision.title}' is documented in source '{document.title}', but no explanation was recorded.",
                    gap_type=GapType.MISSING_REASON,
                    status=GapStatus.OPEN,
                    question_to_departing=f"Why was the decision '{decision.title}' made, and what alternatives were rejected?"
                )
                self.db.add(gap)
                result.knowledge_gaps.append(gap)

        # C. Process Dependencies
        for dep_data in payload.get("dependencies", []):
            src_name = dep_data.get("source_component_name", "").strip().lower()
            tgt_name = dep_data.get("target_component_name", "").strip().lower()

            src_comp = component_cache.get(src_name)
            tgt_comp = component_cache.get(tgt_name)

            if src_comp and tgt_comp:
                dep = Dependency(
                    project_id=self.project_id,
                    source_component_id=src_comp.id,
                    target_component_id=tgt_comp.id,
                    dependency_type=DependencyType(dep_data.get("dependency_type", DependencyType.CALLS_API.value)),
                    description=dep_data.get("description"),
                    is_hidden=bool(dep_data.get("is_hidden", False)),
                    source_id=document.id
                )
                self.db.add(dep)
                result.dependencies.append(dep)

                if dep.is_hidden:
                    gap = KnowledgeGap(
                        project_id=self.project_id,
                        component_id=src_comp.id,
                        title=f"Hidden Dependency: {src_comp.name} -> {tgt_comp.name}",
                        description=f"Unpublished dependency detected between {src_comp.name} and {tgt_comp.name}.",
                        gap_type=GapType.HIDDEN_DEPENDENCY,
                        status=GapStatus.OPEN,
                        question_to_departing=f"How does {src_comp.name} interface with {tgt_comp.name}, and what breaks if one changes?"
                    )
                    self.db.add(gap)
                    result.knowledge_gaps.append(gap)

        # D. Process Failures
        for fail_data in payload.get("failures", []):
            comp_name = fail_data.get("component_name", "").strip().lower()
            comp = component_cache.get(comp_name)
            if comp:
                failure = FailureRecord(
                    project_id=self.project_id,
                    component_id=comp.id,
                    title=fail_data.get("title", "Error Incident"),
                    error_message=fail_data.get("error_message", "Unknown error"),
                    attempted_fix=fail_data.get("attempted_fix", "None documented"),
                    resolution=fail_data.get("resolution"),
                    is_resolved=bool(fail_data.get("is_resolved", True)),
                    source_id=document.id
                )
                self.db.add(failure)
                result.failure_records.append(failure)

    def _process_unstructured_text(
        self,
        document: SourceDocument,
        result: ExtractionResult
    ):
        """
        Parses raw text blocks strictly verifying claims and flags unknowns.
        """
        lines = [line.strip() for line in document.content.splitlines() if line.strip()]

        # Scan for explicit decisions
        for line in lines:
            # Pattern: "Decided to <X>", "Decision: <X>"
            decision_match = re.search(r"(?:decided to|decision:\s*|we will use)\s+([^.]+)", line, re.IGNORECASE)
            if decision_match:
                raw_decision_title = decision_match.group(1).strip()
                
                # Check for explicit reason markers in the same sentence or surrounding chunk
                reason_found = None
                for marker in self.REASON_MARKERS:
                    m = re.search(marker, line, re.IGNORECASE)
                    if m:
                        reason_found = m.group(1).strip()
                        break

                if reason_found:
                    status = DecisionStatus.EVIDENCE_SUPPORTED
                    clean_reason = reason_found
                else:
                    # Invariant 1: Mandatory null reason and reason_missing status
                    clean_reason = None
                    status = DecisionStatus.REASON_MISSING

                decision = Decision(
                    project_id=self.project_id,
                    title=f"Decided: {raw_decision_title}",
                    reason=clean_reason,
                    status=status,
                    source_id=document.id,
                    evidence_quote=line
                )
                self.db.add(decision)
                self.db.flush()
                result.decisions.append(decision)

                if status == DecisionStatus.REASON_MISSING:
                    gap = KnowledgeGap(
                        project_id=self.project_id,
                        decision_id=decision.id,
                        title=f"Missing Reason: {decision.title}",
                        description=f"Decision extracted from line '{line}' in source '{document.title}' without documented rationale.",
                        gap_type=GapType.MISSING_REASON,
                        status=GapStatus.OPEN,
                        question_to_departing=f"What was the reasoning and context behind: {decision.title}?"
                    )
                    self.db.add(gap)
                    result.knowledge_gaps.append(gap)

