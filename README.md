# Cairn - Project Continuity Intelligence Platform (MVP)

> Don't just transfer the work. Transfer the understanding behind it.

Cairn rebuilds the reasoning behind a project from its approved sources, finds what nobody wrote down,
asks the departing person only the questions that matter, and gives the successor an evidence-labelled handover.
This MVP follows the Round 1 concept document: **Reconstruct -> Detect -> Rehearse -> Review -> Handover.**

## Run it (2 minutes)

Requirements: Python 3.11+, Node 20+.

```bash
# 1. backend
cd backend
pip install -r requirements.txt
python seed.py --reset            # creates the synthetic "Orbit Pay" demo project + 4 demo users
# 2. frontend (build once; the API serves it)
cd ../frontend && npm install && npm run build && cd ../backend
uvicorn app.main:app --port 8000  # open http://localhost:8000
```

Dev mode with hot reload: run `uvicorn app.main:app --reload` and, in `frontend/`, `npm run dev` (http://localhost:5173, proxies `/api`).

Demo logins (password `cairn-demo`): `manager@`, `departing@`, `incoming@`, `admin@` + `cairn.demo`.

Tests: `cd backend && python -m pytest` (33 tests).

## Demo script (5 minutes)

1. **Incoming** (Sana): Rehearsal tab -> ask *"Why did we choose PostgreSQL?"* -> answered with sources. Ask *"Why is the payment retry limit 3?"* -> Cairn refuses to guess and escalates (the real reason sits in a restricted HR file the successor cannot see).
2. **Departing** (Arjun): sees the question with related context plus the gaps Cairn flagged. Replies; it is only *proposed*.
3. **Manager** (Nikhil): Gaps and Stress Test tabs (if Arjun leaves: Authentication HIGH, Payment retry HIGH, Dashboard MEDIUM knock-on). Review tab -> approve the reply (it becomes evidence, the gap closes, scores rise) -> build and approve the handover.
4. **Incoming**: My handover (every claim labelled and clickable back to its source), then the Readiness check.
5. **Manager**: Validation tab shows Cairn's output against the answer key; Audit tab shows who did what.

## What is built

| Concept-doc module | Where |
|---|---|
| Knowledge Collector (docs, PDF, DOCX, task CSV/JSON, GitHub) | `app/ingest.py` |
| Permission-aware access (admin / manager / departing / incoming) | `app/auth.py`, `service.successor_sources` |
| Project Intelligence Engine (evidence-linked extraction) | `app/extract.py` (+ optional `app/llm.py`) |
| Knowledge Gap Detector | `analysis.detect_gaps` |
| Continuity Stress Test | `analysis.stress_test` |
| Continuity Score (explainable, 40/20/20/20) | `analysis.compute_scores` |
| Handover Rehearsal + escalation to the departing member | `app/rehearsal.py` |
| Review and approval workflow, audit trail | `app/main.py` |
| Successor workspace + readiness check | `frontend/src/pages/Successor.jsx` |
| Synthetic project + answer key + validation | `backend/demo_data/`, `analysis.validate` |

## Rules the system enforces (all covered by tests)

- **Permissions before retrieval.** Restricted sources never enter the successor's model, answers, handover or context. A hidden source returns 404, not 403.
- **No guessing.** If evidence cannot answer, the question is logged as a gap and sent to the departing member with context.
- **Humans approve.** A departing member's reply is only *proposed*; it becomes evidence after a manager/admin approves. Nothing reaches the successor until the handover is approved. A stale draft cannot be approved.
- **Honest labels.** Every handover item is Evidence-supported, Missing evidence, Conflicting or Unverified, with clickable source and location.
- **Score is a breakdown, not a prediction.** The Stress Test reports risk indicators and says so.
- GitHub tokens are used for one request and never stored or logged. Uploads are capped at 5 MB.

## How extraction works (and its limits)

The default extractor is **deterministic and rule-based**, so results are reproducible and auditable. It reads lightly structured documents
(`Component:`, `Decision: ... Reason: ... Decided by:`, `Task: ... - status:`, `Contact:`, `Issue:` / `Attempt n (failed|worked):`)
plus a few natural-language patterns ("we decided to ... because ...", "only X knows ...", "A depends on B", "owned by X"), and commit/branch data.
Free-form prose outside those patterns is **not** understood by default. Set `CAIRN_USE_LLM=1` and `ANTHROPIC_API_KEY` to add an LLM pass for decisions in free prose;
every item it returns is rejected unless its quote appears verbatim in the source, and an unverifiable reason is dropped (never invented).
Scanned PDFs need OCR first. Task statuses are matched across sources by title similarity.

## Configuration

`CAIRN_SECRET` (JWT signing key - **set in production**), `CAIRN_DATABASE_URL` (default SQLite; PostgreSQL URL works with `psycopg`), `CAIRN_TOKEN_HOURS`, `CAIRN_USE_LLM`, `ANTHROPIC_API_KEY`, `CAIRN_LLM_MODEL`.

## Known scope limits (MVP)

Single organisation; no email/Slack/Jira connectors (upload exports instead); no password reset or user admin UI (users are seeded);
no automated database migrations (`create_all`); SQLite by default; the GitHub fetch was tested against a mocked API, not a live repo.
