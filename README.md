# VerifyHub

VerifyHub is a full-stack identity-verification platform in active development. Its goal is to let an organization define a verification workflow once, reuse it for many applicants, and see each automated check and human decision in one traceable place.

> **Project status:** This is a portfolio project, not a certified KYC product or a production-ready identity service. The security foundation and the first five workflow-reliability tasks are merged; the complete end-to-end journey and polished UI are still in progress. Use synthetic identity data only.

## Why I am building it

Organizations often coordinate identity checks through disconnected forms, email threads, tools, and manual handoffs. That makes the same process hard to reuse, hard to audit, and easy to apply inconsistently. VerifyHub explores a better boundary: the workflow engine decides **what happens next**, while separate verification services produce evidence and assigned people make review decisions. An applicant should see one clear journey instead of several unrelated checks.

## Final vision

An organization administrator composes and publishes a reusable, versioned workflow through a no-code builder. They invite an applicant, who follows ordered email, identity-document, and selfie steps. OCR and face comparison provide evidence with documented confidence and limitations; an assigned verifier handles inconclusive cases. The applicant and organization see a consistent final result, and an audit trail explains how it was reached. Each request keeps the published workflow definition it started with, even after a newer version is created.

The first showcase will deliberately use **strictly sequential** email, Aadhaar/PAN document, and face-verification steps. Optional phone, police, medical, parallel branching, and advanced enterprise features belong to later work, not to claims about the current release.

## What exists today

- Express API with registration, login/logout, cookie-based JWT authentication, organization membership checks, tenant-scoped authorization, and workflow/request/document routes.
- Applicant email and document flows, OCR parsing, verifier review endpoints, and a face-verification integration path. These paths exist but are not yet a fully reliable end-to-end workflow.
- React/Vite frontend with authentication, basic applicant and verifier views. The organization-admin builder and the final UI design are not implemented yet.
- FastAPI face-service prototype and an optional policy-question RAG extension. The quality-based “liveness” score is **not** a validated anti-spoof or certified liveness test.
- Backend tests using Node's test runner and temporary MongoDB replica sets. Phase 2 currently includes central state-machine definitions, lifecycle schema fields, and a dry-run-capable migration tool. The new coordinator, retries, cancellation, immutable publication API, transactional review, archival, and complete audit wiring remain to be integrated.

See [the MVP scope](docs/PHASE_0_MVP.md) for the exact showcase journey and acceptance criteria, [the Phase 2 plan](docs/superpowers/plans/2026-09-17-phase-2-workflow-reliability.md) for workflow-reliability work, and [the original architecture document](docs/architecture-design.docx) for the broader product vision. The architecture document is a design reference; the MVP scope takes precedence when they differ.

## Repository layout

```text
Backend/       Express API, MongoDB models, workflow services, OCR, tests
Frontend/      React/Vite applicant and verifier UI
ML-Service/    FastAPI face prototype and optional RAG policy assistant
docs/          MVP scope, architecture reference, implementation plan
```

The application code remains in its existing directories to avoid import-path churn during the workflow-reliability work.

## Local development

### Prerequisites

- Node.js 22 and npm.
- MongoDB for the API. The workflow migration and future transactional coordinator require a **replica set**; the backend integration tests create a temporary one automatically.
- Google OAuth mail credentials for the current email sender. The backend checks for these variables at startup, and email delivery requires valid values.
- Python and the ML-service dependencies only if you want to run face verification or the optional RAG extension. Model downloads and platform-specific native packages may be required.

### API

```bash
cd Backend
npm ci
cp .env.example .env
# Set your own values in .env
mkdir -p uploads/documents
node server.js
```

The API listens on `http://localhost:3000` by default; `GET /api/health` is the basic health check. Do not commit `.env`, uploaded identity files, or real applicant data.

The example environment file documents the required settings. `MONGO_URI`, `JWT_SECRET`, and the Google mail variables need local values; the example is not a usable credential set. The current frontend API URL is hardcoded to `http://localhost:3000/api`.

### Frontend

```bash
cd Frontend
npm ci
npm run dev
```

Vite serves the UI on `http://localhost:5173` by default. The frontend is a partial implementation of the intended interface, not a complete demo journey.

### ML service (experimental)

```bash
cd ML-Service
python -m venv .venv
# Activate the virtual environment for your shell
python -m pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

The backend uses `ML_SERVICE_URL` (default `http://localhost:8000`). Face models may download on first run. The Python dependency set and model behavior have **not** yet been validated as a clean-install release; see [the RAG notes](ML-Service/RAG/README.md) for its additional index and Ollama setup.

## Checks

```bash
cd Backend
npm test
```

```bash
cd Frontend
npm run lint
npm run build
node --test src/pages/dashboard/requestStatus.test.js
```

Backend integration tests use `mongodb-memory-server`, so their first run may download a MongoDB binary. The frontend has a small status-unit test but no browser-level end-to-end suite yet.

## Workflow data safety

From `Backend/`, `npm run migrate:workflow` runs a **read-only preflight** by default. The `--apply` and `--install-indexes` modes require `--backup-confirmed`. On a real database, stop workflow writes, take and verify a backup, resolve every reported violation, and run the verification stage before installing indexes. The tooling has only been exercised against temporary test databases; it has not been run on project user data.


