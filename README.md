# Cairn — Project Continuity Intelligence Platform

> **Don't just transfer the work. Transfer the understanding behind it.**

Cairn is a **deterministic, zero-hallucination** project continuity platform that reconstructs architectural decisions, dependencies, and failure playbooks from approved artifacts, surfaces knowledge gaps before key engineers leave, stress-tests departures with multi-hop BFS cascade analysis, and gates successor answers through Manager-approved evidence and an immutable audit trail.

---

## Core Guarantees & Zero-Hallucination Design

- **100% Deterministic Engine (No LLM Calls):** Extraction ([`extractor.py`](backend/app/services/extractor.py)), BFS blast-radius analysis ([`stress_test.py`](backend/app/services/stress_test.py)), 4-factor continuity scoring (`40` Evidence Coverage + `20` Ownership Clarity + `20` Dependency Documentation + `20` Gap Resolution = `100`), and rehearsal Knowledge Model lookup are rule-based and reproducible.
- **Strict Verbatim Quote Verification:** Every extracted decision quote must appear verbatim (after whitespace normalization) inside its `SourceDocument`; unverified claims are blocked from counting as `evidence_supported`.
- **Clearance Filtering Before Retrieval:** Restricted documents (such as `RESTRICTED_MANAGER` HR/retention plans) and derived entities are filtered out at query time for `INCOMING_MEMBER` and `DEPARTING_MEMBER` across Knowledge Model, Readiness, Handover Packet, Rehearsal, and Audit endpoints ([`security.py`](backend/app/core/security.py)).
- **Human Review Gate & Immutable Audit Log:** Departing member replies stay `pending_review` until an Engineering Manager signs off (`POST /api/rehearsal/review`), minting a permanent `REHEARSAL_VERIFIED_ANSWER` `SourceDocument` and writing an immutable [`ApprovalAuditLog`](backend/app/models/models.py) entry.
- **Seeded FinTrack Benchmark:** Project 1 (**FinTrack Core Banking Ledger**, `proj-cairn-mvp`) starts at Continuity Score **`54.67`** and rises deterministically to **`72.67`** (`+18.0` points) after Manager approval of *"Why is the payment retry limit set to 3?"*. Project 2 (**FinTrack Settlement Mesh — Multi-Hop Demo**, `proj-fintrack-mesh`) ships with a pre-seeded 4-service, **3-hop** cascade graph.

---

## Quick Start (Local Setup)

### Prerequisites
- **Python 3.11+**
- **Node.js 18+ / 20+** and `npm`

### 1. Backend Setup & Run (Port `8000`)

From the repository root (`cairn/`):

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

Run the API server (the database auto-creates tables and auto-seeds FinTrack demo projects on startup if empty; you can also explicitly reset seed data):

```bash
# macOS / Linux:
PYTHONPATH=. python app/seeds/seed_demo_data.py
PYTHONPATH=. uvicorn app.main:app --host 127.0.0.1 --port 8000

# Windows PowerShell (from backend/):
$env:PYTHONPATH = (Get-Location).Path
python app/seeds/seed_demo_data.py
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup & Run

**Option A — Dev mode (recommended locally, Port `3000`):**
```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 3000
```
Open **`http://127.0.0.1:3000`** (it connects automatically to the FastAPI backend on `http://127.0.0.1:8000`).

**Option B — Single-server production build (Port `8000`):**
```bash
cd frontend
npm install
npm run build
cd ../backend
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000
```
When `frontend/dist` exists, FastAPI serves the compiled SPA directly at `http://127.0.0.1:8000`.

---

## Demo Logins (Role-Based Sign-In Screen)

All three accounts and their credentials are also displayed directly on the Cairn Login Screen:

| Role | Username | Email | Password | Clearance | Primary Actions |
|---|---|---|---|---|---|
| **Successor Member** (`INCOMING_MEMBER`) | `successor` | `successor.member@cairn.local` | `cairn-successor` | `RESTRICTED_TEAM` | Query Knowledge Model, rehearse handover Q&A, run readiness drills |
| **Departing Member** (`DEPARTING_MEMBER`) | `departing` | `departing.member@cairn.local` | `cairn-departing` | `RESTRICTED_TEAM` | Answer queued handover questions, ingest source artifacts & commits |
| **Engineering Manager** (`MANAGER`) | `manager` | `manager@cairn.local` | `cairn-manager` | `RESTRICTED_MANAGER` | View restricted docs, approve/reject replies into permanent evidence, reset demo (`POST /api/demo/reset`) |

*(Suggested walkthrough: **Successor** asks `"Why is the payment retry limit set to 3?"` -> Cairn routes to Departing Member -> **Departing** answers -> **Manager** approves -> Continuity Score rises from `54.67` to `72.67` -> asking the same question again auto-fills immediately from the updated Knowledge Model.)*

---

## Key Capabilities

1. **Multi-Channel Source Ingestion ([`ingest.py`](backend/app/api/ingest.py)):**
   - **Text / ADR / Slack Exports (`POST /api/projects/{id}/ingest`):** Deterministic regex extraction for decisions, rationales, components, dependencies, code imports, and failure runbooks.
   - **Binary & Structured File Upload (`POST /api/projects/{id}/ingest/file`):** Extracts clean text from **`.pdf`** (`pypdf`), **`.docx`** (`python-docx` paragraphs & tables), **`.txt`**, **`.md`**, **`.csv`**, **`.json`**, and source code files (`.py`, `.ts`, `.tsx`, `.js`, etc.); rejects empty or corrupted files with `400 Bad Request`.
   - **GitHub Import (`POST /api/projects/{id}/ingest/github`):** Fetches commits & issues from a public `owner/repo` via GitHub REST API or ingests exported commits/issues JSON.
2. **Input & Action Reliability:**
   - Empty whitespace, symbol-only strings, digits-only noise, or repetitive junk inputs are rejected cleanly on both backend (`400 Bad Request` via [`validation.py`](backend/app/core/validation.py)) and frontend inline alerts.
   - Re-asking identical questions and repeating approvals/rejections are handled idempotently without creating duplicate evidence documents, duplicate score inflation, or duplicate audit rows.
   - `GET /api/demo/reset` is disabled (`405 Method Not Allowed`), and `POST /api/demo/reset` is strictly limited to `MANAGER` (`403 Forbidden` for other roles).
   - While syncing or when the API is unreachable, the UI shows **"Connecting to server…"** or an explicit connection error panel with **Retry Connection** rather than silently masking failures as live data.
3. **Immutable Approval Audit Trail:**
   - `GET /api/rehearsal/{project_id}/audit-history` exposes timestamped manager approval/rejection decisions and minted source document IDs (filtered by caller clearance).

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///cairn_demo.db` | SQLAlchemy connection URI (`sqlite:///...` or PostgreSQL `postgresql+psycopg://...`) |
| `CAIRN_SECRET_KEY` | `cairn-dev-hmac-secret-2026` | HMAC-SHA256 signing key for Bearer session tokens (**set a strong secret in production**; auto-generated in [`render.yaml`](render.yaml)) |
| `CAIRN_TOKEN_TTL_SECONDS` | `86400` | Session Bearer token lifetime in seconds |
| `CAIRN_ALLOW_LEGACY_HEADER_AUTH` | `false` | Enables raw `X-User-ID` header auth fallback ONLY when `"true"` (production & [`render.yaml`](render.yaml) set `"false"`; enabled automatically in [`backend/tests/conftest.py`](backend/tests/conftest.py)) |
| `VITE_API_URL` / `VITE_BACKEND_URL` | Auto-detected | Optional frontend override for backend base URL |

---

## Running Tests & Type Checks

Run the full automated pytest suite (invariants, bug-fix regressions, RBAC, token auth, binary PDF/DOCX parsing, multi-hop BFS, repeat idempotency, and junk-input guards):

```bash
# From backend/ with PYTHONPATH pointing to backend/:
PYTHONPATH=. pytest -v
```

Build and type-check the pure TypeScript React frontend:

```bash
cd frontend
npm run build   # runs `tsc && vite build`
```

---

## Architecture Overview

```text
cairn/
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                  # FastAPI app, startup seeding, /api/health, Manager-only POST /api/demo/reset
│   │   ├── api/
│   │   │   ├── auth.py              # Role login with PBKDF2 password verification & signed Bearer tokens
│   │   │   ├── ingest.py            # /ingest, /ingest/file (PDF/DOCX/text/code), /ingest/github
│   │   │   ├── rehearsal.py         # /ask, /reply, /review, /questions, /audit-history, idempotency guards
│   │   │   ├── readiness.py         # /projects, /knowledge-model, /handover-packet, /readiness/scenarios
│   │   │   └── stress_test.py       # /continuity-score, /stress-test, /stress-test/simulate-multihop
│   │   ├── core/
│   │   │   ├── security.py          # HMAC-SHA256 tokens, RBAC require_role, clearance filtering helpers
│   │   │   └── validation.py        # Shared meaningful-text validator blocking empty/junk payloads
│   │   ├── db/database.py           # SQLAlchemy engine & init_db
│   │   ├── models/models.py         # Domain entities & ApprovalAuditLog
│   │   ├── schemas/schemas.py       # Pydantic response schemas
│   │   ├── seeds/seed_demo_data.py  # Seeded FinTrack Core Banking Ledger & 3-hop Settlement Mesh projects
│   │   └── services/
│   │       ├── extractor.py         # Deterministic rules extractor + verbatim quote enforcement
│   │       └── stress_test.py       # Multi-hop BFS cascade traversal & 4-pillar continuity score
│   └── tests/
│       ├── conftest.py
│       ├── test_cairn_invariants.py
│       ├── test_bug_fixes.py
│       └── test_remediation_p0_p1_p2.py
├── frontend/
│   └── src/
│       ├── main.tsx                 # Strict TypeScript React 18 entrypoint
│       ├── CairnWorkspace.tsx       # Workspace shell, collapsible mobile drawer, honest API status gating
│       ├── api/client.ts            # Bearer authFetch client with cold-start retry backoff
│       ├── utils/validation.ts      # Shared frontend empty/junk input validator
│       └── components/
│           ├── LoginScreen.tsx      # Role-based sign-in screen with visible demo usernames & passwords
│           ├── HandoverRehearsalChat.tsx
│           ├── DepartingMemberWorkspace.tsx
│           ├── ContinuityStressTestView.tsx
│           ├── ContinuityScoreWidget.tsx
│           ├── IngestionModal.tsx
│           ├── KnowledgeModelExplorer.tsx
│           └── SuccessorReadinessView.tsx
├── render.yaml                      # Render blueprint (free tier, healthCheckPath: /api/health, production env vars)
└── .github/workflows/keep-alive.yml # Optional 10-minute cron pinger for /api/health during demo windows
```

---

## Known Scope Limits & Production Notes

- **Rule-Based Extraction Only:** Free-form prose that does not use recognized decision/component/dependency/failure markers or code import syntax is stored as searchable evidence text rather than parsed into structured decision nodes. Scanned image-only PDFs require OCR before upload.
- **Seeded Authentication Directory:** Users and roles are seeded for the MVP demo workspace; there is no self-service user registration or password-reset email UI.
- **Schema Management:** Tables are initialized via SQLAlchemy `Base.metadata.create_all` rather than Alembic migrations.
- **Render Free-Tier Cold Starts:** Render free web services sleep after ~15 minutes of inactivity. Set the GitHub repository variable `CAIRN_HEALTHCHECK_URL` (e.g., `https://your-service.onrender.com`) to activate [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) every 10 minutes, use an external monitor (UptimeRobot / Better Stack) against `GET /api/health`, or upgrade to an always-on plan during judging windows.
