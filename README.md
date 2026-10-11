# VerifyHub

VerifyHub is a full-stack identity-verification platform in active development. Its goal is to let an organization define a verification workflow once, reuse it for many applicants, and see each automated check and human decision in one traceable place.

> **Project status:** Phase 2 workflow reliability and the first complete Phase 3 PAN/Aadhaar verification pipeline are implemented in the current codebase. This is a portfolio/research project, not a certified KYC product or production identity service. Use synthetic identity data only.

## Why I am building it

Organizations often coordinate identity checks through disconnected forms, email threads, tools, and manual handoffs. That makes the same process hard to reuse, hard to audit, and easy to apply inconsistently. VerifyHub explores a better boundary: the workflow engine decides **what happens next**, while separate verification services produce evidence and assigned people make review decisions. An applicant should see one clear journey instead of several unrelated checks.

## Final vision

An organization administrator composes and publishes a reusable, versioned workflow through a no-code builder. They invite an applicant, who follows ordered email, identity-document, and selfie steps. OCR and face comparison provide evidence with documented confidence and limitations; an assigned verifier handles inconclusive cases. The applicant and organization see a consistent final result, and an audit trail explains how it was reached. Each request keeps the published workflow definition it started with, even after a newer version is created.

The first showcase will deliberately use **strictly sequential** email, Aadhaar/PAN document, and face-verification steps. Optional phone, police, medical, parallel branching, and advanced enterprise features belong to later work, not to claims about the current release.

## What exists today

- Express API with registration, login/logout, cookie-based JWT authentication, organization membership checks, tenant-scoped authorization, and workflow/request/document routes.
- A strict sequential workflow engine with centralized request/execution transitions, one execution per request/step, idempotent commands, bounded retries, cancellation, immutable published versions, archival, transactional review/advancement, and structured audit events.
- A versioned document-and-face evidence pipeline with file-quality checks, OCR adapters, PAN/Aadhaar type and format validation, masked fields with confidence, face extraction/comparison, explainable three-way decisions, immutable results, and audited human override.
- React/Vite applicant capture and verifier evidence views, including camera capture with file fallback, quality guidance, reason codes, confidence display, document preview, and reason-required final decisions.
- FastAPI versioned image-quality and face-evidence endpoints. Selfie image quality is **not** liveness or anti-spoofing; low face similarity is routed to manual review.
- Node, MongoDB integration/concurrency, Python, and frontend checks. Browser automation and production threshold calibration remain future work.

See [the MVP scope](docs/PHASE_0_MVP.md), [the Phase 2 plan](docs/superpowers/plans/2026-09-17-phase-2-workflow-reliability.md), [the Phase 3 plan](docs/superpowers/plans/2026-09-23-phase-3-verification-pipeline.md), and [the pipeline model card](docs/verification/model-card.md). The original [architecture document](docs/architecture-design.docx) is a broad design reference; implemented scope and limitations take precedence.

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

The example environment file documents the required settings. `MONGO_URI`, `JWT_SECRET`, `VERIFICATION_RESULT_DIGEST_KEY`, and the Google mail variables need local values; the example is not a usable credential set. Use an independent high-entropy digest key because it protects equality digests for masked identity fields. The current frontend API URL is hardcoded to `http://localhost:3000/api`.

### Frontend

```bash
cd Frontend
npm ci
npm run dev
```

Vite serves the UI on `http://localhost:5173` by default. Camera capture requires browser permission and a secure context (localhost qualifies in modern browsers); a file-input fallback is available.

### ML service

```bash
cd ML-Service
python -m venv .venv
# Activate the virtual environment for your shell
python -m pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

The backend uses `ML_SERVICE_URL` (default `http://localhost:8000`). Face models may download on first run and InsightFace/ONNX support is platform-sensitive. Scores use engineering defaults and are not production-calibrated; review the [model card](docs/verification/model-card.md). The optional RAG extension has separate index and Ollama setup in [its notes](ML-Service/RAG/README.md).

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

```bash
cd ML-Service
python -m pytest -q
python -m calibration.evaluate_thresholds calibration/fixtures.example.json
```

The calibration fixture is synthetic and only demonstrates the report format. It is not an accuracy claim.

## Workflow data safety

From `Backend/`, `npm run migrate:workflow` runs a **read-only preflight** by default. The `--apply` and `--install-indexes` modes require `--backup-confirmed`. On a real database, stop workflow writes, take and verify a backup, resolve every reported violation, and run the verification stage before installing indexes. The tooling has only been exercised against temporary test databases; it has not been run on project user data.


