# Cairn: Project Continuity Intelligence Platform
> *"Don't just transfer the work. Transfer the understanding behind it."*
> **Team BlueWelsh** • Sri Sairam Engineering College, Chennai

---

## 1. System Overview & The Problem
When a key team member departs, teams lose institutional memory:
- **Tacit reasoning** behind architectural trade-offs.
- **Invisible unfinished work** lingering in local branches or mental states.
- **Hidden, undocumented dependencies** between modules and services.
- **Recurring operational failure modes** and the fixes that succeeded.

Cairn turns scattered activity (docs, GitHub commits, task trackers) into a verified, explainable handover with human-in-the-loop review.

---

## 2. The Four Absolute Invariants ("The Gravity")

### Invariant 1: Zero-Hallucination Mandate
- Every extracted decision, component, dependency, and failure record MUST carry an immutable `source_id` foreign key bound to an authorized `SourceDocument`.
- If an architectural choice is recorded without an explicit rationale in the evidence, Cairn strictly sets:
  ```python
  reason = None
  status = DecisionStatus.REASON_MISSING
  ```
- Cairn will **never** guess, infer, or hallucinate missing context. When queried during Rehearsal, Cairn explicitly responds:
  > *"Zero-Hallucination Guard: Decision is documented, but its reasoning is unrecorded in approved project sources. Question queued for departing member."*

### Invariant 2: Pure Deterministic Relational Logic
- The **Continuity Stress Test** (`run_continuity_stress_test`) executes purely rules-based Breadth-First-Search (BFS) over relational foreign keys (`dependencies`).
- Prohibits graph databases (no Neo4j) and LLM-based probabilistic guessing. Downstream cascades, depths, and risk levels are computed deterministically.

### Invariant 3: Data Boundary Restrictions & RBAC Review Gate
- Three strictly defined roles: `MANAGER`, `DEPARTING_MEMBER`, `INCOMING_MEMBER`.
- Queries are filtered at the database query level prior to any retrieval (e.g. `RESTRICTED_MANAGER` documents are inaccessible to incoming members).
- Replies submitted by the departing member remain locked with `status = "pending_review"`. They **cannot** count as evidence or impact the continuity score until an authorized `MANAGER` signs off.
- Upon Manager sign-off, Cairn mints a new, immutable `SourceDocument` of type `REHEARSAL_VERIFIED_ANSWER`.

### Invariant 4: MVP Scope Lock
- Scoped to **one project**, **one departing member**, and **one successor handover**.

---

## 3. Mathematical Formula: Continuity Score Index (0–100)

The Continuity Score is an explainable index computed from 4 weighted pillars:

$$\text{Continuity Score} = S_{\text{evidence}} + S_{\text{ownership}} + S_{\text{dependency}} + S_{\text{gaps}}$$

Where:
1. **Evidence Coverage ($S_{\text{evidence}}$, 40% weight)**:
   $$S_{\text{evidence}} = \left( 0.7 \times \frac{D_{\text{evidence}}}{D_{\text{total}}} + 0.3 \times \frac{C_{\text{verified}}}{C_{\text{total}}} \right) \times 40.0$$
2. **Ownership Clarity ($S_{\text{ownership}}$, 20% weight)**:
   $$S_{\text{ownership}} = \left( \frac{C_{\text{reassigned}}}{C_{\text{total}}} \right) \times 20.0$$
3. **Dependency Documentation ($S_{\text{dependency}}$, 20% weight)**:
   $$S_{\text{dependency}} = \left( \frac{\text{Deps}_{\text{explicit}}}{\text{Deps}_{\text{total}}} \right) \times 20.0$$
4. **Open Critical Gaps ($S_{\text{gaps}}$, 20% weight)**:
   $$S_{\text{gaps}} = \max\left(0.0, \, 20.0 - (G_{\text{open}} \times 4.0)\right)$$

---

## 4. Benchmark Synthetic Scenario & Results

| Step | State | Continuity Score | Key Observation |
| :--- | :--- | :---: | :--- |
| **0. Initial Seed** | Ingested ADR-001 and Commit `42a9fb` | **54.67 / 100** | 1 verified decision (`PostgreSQL`), 1 missing reason (`Retry Limit 3`), 1 hidden dependency (`Dashboard` $\to$ `Auth`). |
| **1. Stress Test** | Simulated departure of Developer A | — | Traces direct SPOFs (`Auth API`, `Payment Retry`) and cascade impact on `Dashboard` (Severity: HIGH). |
| **2. Rehearsal Inquiry** | Successor asks *"Why is retry limit 3?"* | **54.67 / 100** | Zero-Hallucination Guard refuses to guess; routes question to Developer A. |
| **3. Member Reply** | Developer A provides Stripe webhook context | **54.67 / 100** | Status locked at `pending_review`. Not yet verified evidence. |
| **4. Manager Approval** | Manager approves with verification note | **72.67 / 100** | Mints verified `SourceDocument`, closes knowledge gap, promotes decision to `evidence_supported` (**+18.0 pts**). |

---

## 5. Automated Invariant Test Suite
Run the test suite anytime:
```bash
pytest backend/tests/test_cairn_invariants.py -v
```
All four invariant test cases pass deterministically in under 2 seconds:
- `test_invariant_1_zero_hallucination_mandate`
- `test_invariant_2_deterministic_stress_test`
- `test_invariant_3_review_gate_and_evidence_promotion`
- `test_continuity_score_weighting`

---

## 6. Team BlueWelsh
- **Srinath Venkataraman** — Team Lead (Product direction, AI extraction, Stress Test logic, access control)
- **Gurusharan A K** — Backend (FastAPI services, source ingestion, schema, roles)
- **Kaviin S** — Documentation & Frontend (Submission docs, review screens, successor workspace)
- **Dhayalin Santhakumar** — R&D & Frontend (Retrieval, scoring research, test data, Rehearsal chat screen)

