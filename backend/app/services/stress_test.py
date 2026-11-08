from typing import List, Dict, Any, Set, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from collections import deque

from app.models.models import (
    Project,
    Component,
    ComponentStatus,
    Decision,
    DecisionStatus,
    Dependency,
    KnowledgeGap,
    GapStatus,
    User
)


class ComponentImpact(BaseModel):
    component_id: str
    component_name: str
    owner_id: str
    owner_name: str
    impact_type: str = Field(..., description="'DIRECT_OWNERSHIP', 'DOWNSTREAM_DEPENDENCY', or 'CASCADE_BLOCKED'")
    severity: str = Field(..., description="'HIGH', 'MEDIUM', or 'LOW'")
    dependency_depth: int
    direct_dependency_path: List[str]
    missing_reasons_count: int
    open_gaps_count: int
    unresolved_failures_count: int
    suggested_action: str


class StressTestReport(BaseModel):
    project_id: str
    departing_member_id: str
    departing_member_name: str
    total_components_analyzed: int
    directly_affected_components: List[ComponentImpact]
    downstream_affected_components: List[ComponentImpact]
    single_points_of_failure: List[str]
    summary: Dict[str, Any]


class ContinuityScoreBreakdown(BaseModel):
    project_id: str
    overall_score: float = Field(..., ge=0.0, le=100.0, description="0 to 100 continuity index")
    evidence_coverage_score: float = Field(..., description="Evidence Coverage (40% weight)")
    ownership_clarity_score: float = Field(..., description="Ownership Clarity (20% weight)")
    dependency_doc_score: float = Field(..., description="Dependency Documentation (20% weight)")
    gap_penalty_score: float = Field(..., description="Open Critical Gaps (20% weight)")
    metrics: Dict[str, Any]


def run_continuity_stress_test(
    project_id: str,
    departing_member_id: str,
    db: Session
) -> StressTestReport:
    """
    INVARIANT 2: Deterministic Logic.
    Simulates the departure of a specific team member by traversing the relational database.
    Pure rules-based BFS/relational joins. NO multi-agent guessing or graph databases.
    """
    departing_user = db.query(User).filter(User.id == departing_member_id).first()
    departing_name = departing_user.full_name if departing_user else "Unknown Member"

    # 1. Fetch all project components and users in memory for deterministic traversal
    all_components: List[Component] = db.query(Component).filter(
        Component.project_id == project_id
    ).all()
    comp_map = {c.id: c for c in all_components}

    # 2. Identify Directly Owned Components (Root Impact)
    direct_components = [c for c in all_components if c.owner_id == departing_member_id]
    direct_ids = {c.id for c in direct_components}

    # 3. Fetch all relational dependencies for the project
    dependencies: List[Dependency] = db.query(Dependency).filter(
        Dependency.project_id == project_id
    ).all()

    # Adjacency list: target_component -> list of source_components that depend on it
    # If target is owned by departing member, any source component depending on it is at risk!
    dependents_graph: Dict[str, List[Dependency]] = {c.id: [] for c in all_components}
    for dep in dependencies:
        if dep.target_component_id in dependents_graph:
            dependents_graph[dep.target_component_id].append(dep)

    # 4. Fetch knowledge gaps and decisions to score component vulnerability
    all_decisions: List[Decision] = db.query(Decision).filter(
        Decision.project_id == project_id
    ).all()
    all_gaps: List[KnowledgeGap] = db.query(KnowledgeGap).filter(
        KnowledgeGap.project_id == project_id,
        KnowledgeGap.status.in_([GapStatus.OPEN, GapStatus.QUESTION_QUEUED, GapStatus.PENDING_REVIEW])
    ).all()

    # Pre-aggregate gaps & decisions by component
    gaps_by_comp: Dict[str, int] = {c.id: 0 for c in all_components}
    for g in all_gaps:
        if g.component_id and g.component_id in gaps_by_comp:
            gaps_by_comp[g.component_id] += 1

    missing_reasons_by_comp: Dict[str, int] = {c.id: 0 for c in all_components}
    for d in all_decisions:
        if d.component_id and d.component_id in missing_reasons_by_comp:
            if d.status == DecisionStatus.REASON_MISSING:
                missing_reasons_by_comp[d.component_id] += 1

    # 5. Build Direct Impacts
    directly_affected: List[ComponentImpact] = []
    for c in direct_components:
        owner_name = c.owner.full_name if c.owner else departing_name
        gap_count = gaps_by_comp.get(c.id, 0)
        missing_reasons = missing_reasons_by_comp.get(c.id, 0)

        action = (
            f"Assign replacement owner and schedule Handover Rehearsal. "
            f"Resolve {missing_reasons} undocumented decision(s) and {gap_count} open gap(s)."
            if (missing_reasons > 0 or gap_count > 0)
            else "Transfer primary ownership and verify deployment credentials."
        )

        directly_affected.append(ComponentImpact(
            component_id=c.id,
            component_name=c.name,
            owner_id=c.owner_id,
            owner_name=owner_name,
            impact_type="DIRECT_OWNERSHIP",
            severity="HIGH",
            dependency_depth=0,
            direct_dependency_path=[c.name],
            missing_reasons_count=missing_reasons,
            open_gaps_count=gap_count,
            unresolved_failures_count=len([f for f in c.failure_records if not f.is_resolved]),
            suggested_action=action
        ))

    # 6. Deterministic Breadth-First-Search (BFS) for Downstream Impacts
    downstream_affected: List[ComponentImpact] = []
    visited: Set[str] = set(direct_ids)
    
    # Queue stores: (current_component_id, current_depth, path_names)
    queue = deque([(c_id, 0, [comp_map[c_id].name]) for c_id in direct_ids])

    while queue:
        curr_id, depth, path = queue.popleft()

        for dep in dependents_graph.get(curr_id, []):
            downstream_id = dep.source_component_id
            downstream_comp = comp_map.get(downstream_id)

            if not downstream_comp or downstream_id in visited:
                continue

            visited.add(downstream_id)
            new_depth = depth + 1
            new_path = path + [downstream_comp.name]
            
            # Severity degrades deterministically based on depth and hidden flag
            if new_depth == 1 or dep.is_hidden:
                severity = "HIGH" if dep.is_hidden else "MEDIUM"
            else:
                severity = "LOW"

            downstream_owner = downstream_comp.owner.full_name if downstream_comp.owner else "Unknown"
            dep_reason = f"Depends on {comp_map[curr_id].name} ({dep.dependency_type.value})"
            
            if dep.is_hidden:
                action = f"URGENT: Verify hidden connection from {downstream_comp.name} to {comp_map[curr_id].name}. Owner {downstream_owner} needs API contract."
            else:
                action = f"Owner {downstream_owner} requires documentation of interface with {comp_map[curr_id].name}."

            impact = ComponentImpact(
                component_id=downstream_comp.id,
                component_name=downstream_comp.name,
                owner_id=downstream_comp.owner_id,
                owner_name=downstream_owner,
                impact_type="DOWNSTREAM_DEPENDENCY" if new_depth == 1 else "CASCADE_BLOCKED",
                severity=severity,
                dependency_depth=new_depth,
                direct_dependency_path=new_path,
                missing_reasons_count=missing_reasons_by_comp.get(downstream_comp.id, 0),
                open_gaps_count=gaps_by_comp.get(downstream_comp.id, 0),
                unresolved_failures_count=len([f for f in downstream_comp.failure_records if not f.is_resolved]),
                suggested_action=action
            )
            downstream_affected.append(impact)
            queue.append((downstream_id, new_depth, new_path))

    single_points_of_failure = [c.name for c in direct_components if len(c.inbound_dependencies) > 0]

    return StressTestReport(
        project_id=project_id,
        departing_member_id=departing_member_id,
        departing_member_name=departing_name,
        total_components_analyzed=len(all_components),
        directly_affected_components=directly_affected,
        downstream_affected_components=downstream_affected,
        single_points_of_failure=single_points_of_failure,
        summary={
            "direct_count": len(directly_affected),
            "downstream_count": len(downstream_affected),
            "critical_single_points_count": len(single_points_of_failure),
            "max_cascade_depth": max([item.dependency_depth for item in downstream_affected], default=0)
        }
    )


def calculate_continuity_score(
    project_id: str,
    db: Session
) -> ContinuityScoreBreakdown:
    """
    Deterministic Continuity Score calculation.
    Formula (0-100 total):
      - Evidence Coverage (40%): Ratio of evidence-supported decisions and verified components
      - Ownership Clarity (20%): Proportion of components with assigned active non-departing owners
      - Dependency Documentation (20%): Proportion of documented, non-hidden dependencies
      - Open Critical Gaps (20%): Inverse penalty for unresolved knowledge gaps
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project {project_id} not found.")

    components: List[Component] = db.query(Component).filter(Component.project_id == project_id).all()
    decisions: List[Decision] = db.query(Decision).filter(Decision.project_id == project_id).all()
    dependencies: List[Dependency] = db.query(Dependency).filter(Dependency.project_id == project_id).all()
    gaps: List[KnowledgeGap] = db.query(KnowledgeGap).filter(KnowledgeGap.project_id == project_id).all()

    # 1. Evidence Coverage (40%)
    # Every decision must have evidence and status != 'reason_missing'
    total_decisions = len(decisions)
    if total_decisions > 0:
        evidence_supported_decisions = sum(
            1 for d in decisions if d.status == DecisionStatus.EVIDENCE_SUPPORTED
        )
        dec_ratio = evidence_supported_decisions / total_decisions
    else:
        dec_ratio = 1.0  # Default if no decisions yet

    total_comps = len(components)
    if total_comps > 0:
        comps_with_valid_source = sum(1 for c in components if c.source_id is not None)
        comp_ratio = comps_with_valid_source / total_comps
    else:
        comp_ratio = 1.0

    # Combined evidence factor
    evidence_coverage_ratio = (dec_ratio * 0.7) + (comp_ratio * 0.3)
    score_evidence = round(evidence_coverage_ratio * 40.0, 2)

    # 2. Ownership Clarity (20%)
    # Measures whether components have been successfully assigned to an active incoming/manager owner
    # instead of stranded with the departing member.
    if total_comps > 0:
        clarity_count = sum(
            1 for c in components 
            if c.owner_id != project.departing_member_id and c.owner_id is not None
        )
        ownership_ratio = clarity_count / total_comps
    else:
        ownership_ratio = 0.5  # Neutral default

    score_ownership = round(ownership_ratio * 20.0, 2)

    # 3. Dependency Documentation (20%)
    # Dependencies with verified sources and is_hidden == False
    total_deps = len(dependencies)
    if total_deps > 0:
        documented_deps = sum(1 for dep in dependencies if not dep.is_hidden and dep.source_id is not None)
        dep_ratio = documented_deps / total_deps
    else:
        dep_ratio = 1.0

    score_dependency = round(dep_ratio * 20.0, 2)

    # 4. Open Critical Gaps (20%)
    # Penalty deducted for each open or unverified knowledge gap
    open_gaps = [g for g in gaps if g.status in [GapStatus.OPEN, GapStatus.QUESTION_QUEUED, GapStatus.PENDING_REVIEW]]
    open_count = len(open_gaps)

    # Deduct 4 points per open gap up to 20 maximum points
    score_gaps = max(0.0, round(20.0 - (open_count * 4.0), 2))

    # Overall Aggregate Score
    overall_score = round(score_evidence + score_ownership + score_dependency + score_gaps, 2)

    return ContinuityScoreBreakdown(
        project_id=project_id,
        overall_score=overall_score,
        evidence_coverage_score=score_evidence,
        ownership_clarity_score=score_ownership,
        dependency_doc_score=score_dependency,
        gap_penalty_score=score_gaps,
        metrics={
            "total_components": total_comps,
            "total_decisions": total_decisions,
            "evidence_supported_decisions": sum(1 for d in decisions if d.status == DecisionStatus.EVIDENCE_SUPPORTED),
            "reason_missing_decisions": sum(1 for d in decisions if d.status == DecisionStatus.REASON_MISSING),
            "total_dependencies": total_deps,
            "hidden_dependencies_count": sum(1 for dep in dependencies if dep.is_hidden),
            "open_knowledge_gaps": open_count,
            "resolved_knowledge_gaps": sum(1 for g in gaps if g.status == GapStatus.APPROVED_AS_EVIDENCE)
        }
    )

