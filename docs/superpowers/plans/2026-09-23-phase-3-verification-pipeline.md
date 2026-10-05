# Phase 3 High-Quality Verification Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one trustworthy, explainable Aadhaar/PAN document-and-face verification pipeline that produces a versioned decision of `approved`, `manual_review`, or `rejected`, supports controlled re-upload/retry and human override, and integrates safely with the Phase 2 workflow coordinator.

**Architecture:** Keep the Node backend as the system of record and decision orchestrator. Put image decoding, measurable image-quality analysis, face detection, and face similarity behind versioned FastAPI endpoints; keep OCR behind a replaceable backend adapter initially so the existing Tesseract integration can be hardened without coupling workflow state to one OCR engine. Persist immutable result records per execution attempt, with sanitized evidence and explicit thresholds, while raw files remain in the existing protected storage boundary.

**Tech Stack:** Node.js 22, Express 5, Mongoose 9, MongoDB transactions, Node's built-in test runner, Supertest, mongodb-memory-server, Python 3, FastAPI, Pydantic, OpenCV, InsightFace, ONNX Runtime, NumPy, pytest, React 19, and Vite 8.

**Spec:** This self-contained plan records the proposed Phase 3 design and implementation sequence. It must be reviewed before execution because the decisions in the final section are recommendations, not yet approved product policy.

## Global Constraints

- Complete and review one numbered task at a time; do not continue automatically.
- Use test-first development for every behavior change.
- Preserve all Phase 2 sequencing, idempotency, transaction, retry, cancellation, snapshot, archival, and audit invariants.
- Do not let ML/OCR adapters advance workflow state directly; they return typed outcomes to the workflow coordinator.
- Do not run OCR, filesystem, image processing, or ML inference inside MongoDB transactions.
- Do not describe blur, brightness, contrast, landmarks, face presence, or pose heuristics as liveness or anti-spoofing.
- Do not claim that Aadhaar/PAN format validation proves document authenticity or government-database validity.
- Do not persist face embeddings, full OCR text, selfie pixels, document images, or unmasked identity numbers in audit events.
- Preserve previous uploads and results as immutable history; re-upload creates a new attempt rather than overwriting evidence.
- Use explicit schema and pipeline versions in every persisted and API result.
- Keep thresholds in versioned server configuration, never under client control.
- Default ambiguous or low-confidence evidence to `manual_review`, not automatic approval or rejection.
- Maintain tenant and assigned-verifier authorization at every upload, result, override, and file-view boundary.
- Do not add a queue, GPU requirement, cloud OCR provider, or anti-spoofing vendor unless a measured need and deployment plan justify it.

## Review Focus

1. **Malformed or adversarial uploads:** Task 3 tests signature spoofing, corrupt bytes, decompression/pixel bombs, unsupported formats, and decode limits before OCR or inference.
2. **Ambiguous identity text:** Task 6 tests OCR substitutions, multiple identifier candidates, missing fields, multilingual noise, and declared/detected document-type conflicts without inventing confidence.
3. **Threshold-edge evidence:** Tasks 3, 4, and 8 test exact quality, field-confidence, and similarity boundaries so floating-point or equality behavior cannot silently flip decisions.
4. **Concurrent or stale commands:** Tasks 7, 9, and 10 test duplicate uploads/results, superseded evidence, expired leases, cancellation, and competing overrides against database invariants.
5. **Sensitive-data exposure:** Tasks 2, 7, 10, and 13 test that errors, logs, API projections, result persistence, and audit events omit raw images, embeddings, full OCR text, and unmasked identifiers.

---

## Phase 3 Scope

The first production-quality vertical slice covers:

1. Aadhaar front-side image or PAN card image.
2. File validation and measurable document image-quality checks.
3. OCR through a clean adapter.
4. Declared-versus-detected document-type validation.
5. Aadhaar/PAN field extraction, normalization, format checks, and per-field confidence.
6. One-face extraction from the identity document.
7. Applicant selfie capture or upload with explicit selfie image-quality feedback.
8. Face similarity between document and selfie.
9. A versioned result containing evidence, scores, thresholds, reason codes, and the automatic decision.
10. Verifier approval, rejection, or override to manual outcome with a mandatory reason and audit event.
11. A bounded re-upload and retry policy that reuses the Phase 2 execution lifecycle.

Out of scope for this phase:

- Government database, DigiLocker, UIDAI, NSDL, or PAN registry validation.
- Real liveness/anti-spoofing unless a trained presentation-attack-detection model or trusted vendor is separately approved and evaluated.
- Passport, driving licence, degree, marksheet, and arbitrary `Other` document automation.
- Video capture, challenge-response gestures, NFC, barcode, QR signature verification, or forensic forgery detection.
- Training a custom OCR, document classifier, face model, or anti-spoofing model.
- Fully asynchronous job infrastructure unless synchronous performance measurements show it is necessary.

## Current Architecture and Verified Gaps

### Current flow

1. The applicant uploads a document to `POST /verification-requests/:requestId/documents` or submits a document image plus a `live` image to the face-verification endpoint.
2. The backend stores local file paths and invokes the Phase 2 workflow coordinator.
3. The document outcome adapter runs Tesseract.js, selects a JavaScript parser from the user-supplied `documentType`, stores raw OCR and parser output under `VerificationDocument.metadata`, and moves the execution to `waiting_for_review`.
4. The face outcome adapter sends the document and selfie files to FastAPI.
5. FastAPI uses InsightFace embeddings and cosine similarity. It also calculates a blur/brightness/eye-landmark heuristic named `liveness`.
6. The ML service returns an unversioned payload and only `approved` or `rejected`; the backend completes or fails the execution from the `verified` boolean.
7. The verifier UI displays a fixed subset of Aadhaar-shaped extracted fields and provides document approval/rejection.

### Verified gaps

- There is no upload content-signature validation, decoded-image validation, minimum resolution, blur, brightness, contrast, glare, crop, or orientation policy.
- Document type is trusted from the client and only compared with workflow configuration; OCR evidence is not used to confirm Aadhaar versus PAN.
- Aadhaar validation is unfinished and contains a `length()` bug; PAN only has a regex parser.
- Parsers return nullable values without field confidence, source evidence, normalization details, or reason codes.
- Raw OCR text is stored in unstructured metadata without an explicit retention/redaction policy.
- OCR is tightly coupled to the document executor rather than exposed through a typed adapter contract.
- Face detection and similarity exist, but document-face quality, selfie quality, model version, normalization, and thresholds are not represented consistently.
- `estimate_liveness()` is not liveness detection; it measures image quality and eye landmark separation.
- The ML API leaks internal exception text in HTTP 500 responses and has no result schema version.
- The ML service has no automated test suite, health/readiness distinction, startup model validation, or fixture-based accuracy checks.
- Selfie input is a normal file picker; the frontend has no camera capture, preview, retake, or quality guidance.
- Verification decisions do not support `manual_review` and are not traceable to a versioned decision policy.
- There is no immutable result document per execution attempt and no database invariant protecting it.
- Human review stores approve/reject state but not an explicit override from an automatic decision with a required reason.
- Re-upload history and limits are not modeled; current paths may be replaced in execution metadata.
- The verifier UI assumes Aadhaar fields and does not present score explanations, failed checks, field confidence, or automatic-versus-final decision.

## Required Invariants

1. Each processing attempt has at most one immutable verification result, enforced by a unique database index on execution plus attempt.
2. Every result declares `schemaVersion`, `pipelineVersion`, component versions, thresholds, and creation time.
3. The client cannot choose model versions, decision thresholds, confidence values, or the automatic decision.
4. File bytes must pass signature, size, decode, and supported-format checks before OCR or face inference.
5. The detected document type must be derived from evidence independently of the declared type.
6. Aadhaar/PAN checks validate structure only and never claim authoritative identity or document authenticity.
7. Every extracted field has a normalized value, bounded confidence in `[0,1]`, evidence source, and validation status.
8. Missing, conflicting, or low-confidence required fields cannot produce automatic approval.
9. Face similarity is evaluated only when exactly one usable face exists in both the document and selfie.
10. Selfie image-quality validation is not labeled liveness or anti-spoofing in code, APIs, UI, logs, documentation, or result payloads.
11. Automatic rejection is reserved for deterministic invalid evidence or a high-confidence mismatch policy; ambiguous evidence routes to manual review.
12. Human override requires an authorized assigned verifier, a non-empty bounded reason, the previous decision, the new decision, and one audit event.
13. Re-upload creates a new immutable evidence attempt and supersedes the prior active evidence without deleting it.
14. Retry reprocesses the current evidence through a newer attempt; re-upload replaces input and consumes a separately bounded upload allowance.
15. Late ML/OCR results cannot attach to a cancelled, superseded, non-current, or differently claimed execution attempt.
16. Raw identity evidence and biometrics never appear in audit events or ordinary application logs.
17. Result reads and evidence downloads remain tenant-scoped and role-scoped.

## Proposed Pipeline

```text
Applicant upload/capture
        |
        v
File envelope validation
  signature, size, decode, dimensions
        |
        v
Document quality analysis ---------> re-upload required when unusable
        |
        +--> OCR adapter --> normalized fields + confidence
        |                     |
        |                     +--> declared/detected type match
        |                     +--> Aadhaar/PAN structural checks
        |
        +--> document face detection
        |
Selfie capture --> selfie quality --> single-face embedding
        |                               |
        +-------------------------------+--> face similarity
                                                |
                                                v
                                      versioned decision policy
                                   approved / manual_review / rejected
                                                |
                                                v
                                    immutable result + workflow outcome
                                                |
                                                v
                                      optional human override + audit
```

The backend owns orchestration, policy evaluation, persistence, authorization, and workflow outcomes. The ML service owns deterministic image analysis and face inference. OCR is accessed through an adapter interface so Tesseract.js can remain the first implementation and later be replaced without changing the result contract.

## Versioned Result Contract

Create a dedicated `VerificationResult` document rather than continuing to grow unstructured execution metadata.

```json
{
  "schemaVersion": "1.0",
  "pipelineVersion": "document-face-v1",
  "verificationRequest": "ObjectId",
  "execution": "ObjectId",
  "attempt": 1,
  "document": {
    "documentId": "ObjectId",
    "declaredType": "PAN",
    "detectedType": "PAN",
    "typeConfidence": 0.96,
    "typeMatches": true,
    "quality": {
      "score": 0.88,
      "checks": [{ "code": "BLUR", "passed": true, "score": 0.91 }]
    },
    "fields": {
      "panNumber": {
        "valueMasked": "ABCDE****F",
        "valueHash": "server-keyed digest",
        "confidence": 0.97,
        "source": "ocr",
        "formatValid": true
      }
    },
    "face": { "detected": true, "count": 1, "confidence": 0.98 }
  },
  "selfie": {
    "quality": {
      "score": 0.86,
      "checks": [{ "code": "FACE_COUNT", "passed": true, "score": 1.0 }]
    },
    "face": { "detected": true, "count": 1, "confidence": 0.99 }
  },
  "faceComparison": {
    "similarity": 0.72,
    "threshold": 0.6,
    "matched": true,
    "model": "insightface-buffalo-s",
    "modelVersion": "pinned-runtime-version"
  },
  "automaticDecision": "approved",
  "finalDecision": "approved",
  "reasonCodes": [],
  "humanOverride": null,
  "createdAt": "ISO-8601"
}
```

Contract rules:

- API responses may return unmasked values only to explicitly authorized users and only where the product requires them; audit logs always receive masked/sanitized summaries.
- Database storage should encrypt or hash high-risk identifiers according to the approved storage decision. A keyed digest supports equality checks without storing the plain number in the result.
- Check codes, reason codes, and decision enum values are stable API constants.
- New fields may be added compatibly within schema `1.x`; breaking changes require schema `2.0` and a new parser/serializer.
- The immutable automatic result is never edited. Human override fields are appended transactionally or stored as a separate decision record referencing the result.

## Decision Policy v1

The policy consumes normalized adapter outputs and returns one of three decisions plus reason codes. Exact numerical thresholds must be calibrated on documented fixtures before approval.

### Approved

All required conditions pass:

- supported and decodable file;
- document quality meets the approval threshold;
- detected type matches the required workflow document type with sufficient confidence;
- required fields were extracted with sufficient confidence;
- Aadhaar/PAN structural checks pass;
- exactly one usable document face and one usable selfie face are present;
- selfie quality meets its threshold;
- face similarity meets its configured threshold;
- no contradictory evidence exists.

### Manual review

Use manual review for uncertainty rather than pretending the system knows:

- readable document but one required field has borderline confidence;
- document type evidence is incomplete or near its threshold;
- document or selfie quality is usable but borderline;
- face similarity falls inside a configurable gray zone;
- a supported parser cannot reconcile two plausible OCR candidates;
- the model or adapter returns a recoverable, evidence-preserving uncertainty.

### Rejected

Automatic rejection is limited to explicit policy failures:

- unsupported, corrupt, malicious, or non-image input;
- declared type clearly conflicts with high-confidence detected type;
- Aadhaar/PAN structure remains invalid after normalization and high-confidence extraction;
- no face or multiple faces where a single face is required after a permitted re-upload;
- face similarity is below the calibrated rejection threshold;
- retry/re-upload allowance is exhausted with the same deterministic failure.

Infrastructure errors are not identity rejection. They create a retryable execution failure under Phase 2.

## Image-Quality Semantics

Expose separate, explainable checks rather than one opaque score:

- decode success;
- MIME signature and extension agreement;
- width, height, and pixel-count bounds;
- blur/sharpness;
- brightness/exposure;
- contrast;
- glare/overexposure coverage;
- crop completeness or edge margin where reliable;
- orientation/skew where reliable;
- face count, face area, face detection confidence, and pose bounds;
- selfie face centering and minimum face size.

The explicit quality score is a versioned weighted aggregate for UX and policy. Individual failed checks remain authoritative and visible; a high aggregate score cannot hide a critical failure.

Rename the current ML service concepts as follows:

- `estimate_liveness` -> `analyze_selfie_quality`
- `/face-verification/liveness` -> `/v1/image-quality/selfie` with temporary deprecation compatibility if needed
- `liveness`, `liveness_threshold` -> `selfieQuality`, `selfieQualityThreshold`
- UI text such as “live selfie” -> “selfie” or “camera-captured selfie” unless real anti-spoofing is later implemented

## Document-Type and Format Rules

### Aadhaar

- Normalize whitespace and separators before checking.
- Require exactly 12 digits and reject known impossible prefixes according to the approved rule set.
- Implement and test the Verhoeff checksum as a structural check.
- Extract name, date/year of birth, gender when present, and masked Aadhaar number.
- Detect Aadhaar from multiple textual signals rather than the number pattern alone.
- Clearly label the result as structural validation, not UIDAI verification.

### PAN

- Normalize to uppercase and strip OCR-introduced spaces only when the correction is unambiguous.
- Require `[A-Z]{5}[0-9]{4}[A-Z]`.
- Extract name, parent name when present, date of birth, and masked PAN number.
- Detect PAN from multiple textual signals such as `INCOME TAX DEPARTMENT`, `PERMANENT ACCOUNT NUMBER`, and a valid PAN candidate.
- Clearly label the result as structural validation, not NSDL or tax-record verification.

## Retry and Re-Upload Policy

- **Processing retry:** Reuse the same Phase 2 execution after a retryable service/infrastructure failure. Increment `attempt`; produce a new result only when processing finalizes successfully.
- **Applicant re-upload:** Allowed only while the current document/face execution is `waiting_for_input`, `waiting_for_review` with a re-upload request, or `failed` with a re-uploadable evidence error.
- **Limits:** Recommended default is three processing retries and two applicant re-uploads per execution, with immutable published-step overrides.
- **History:** Each new upload gets a monotonic `uploadAttempt`, references the superseded evidence, and never deletes the previous record or file during the active retention period.
- **Idempotency:** Require an idempotency key for submission/re-upload. Repeating the same key returns the same evidence/result; a new key represents intentional new evidence.
- **Late results:** Finalization checks execution ID, attempt, processing token, evidence version, current request state, and lease before persistence.
- **User feedback:** Return stable reason codes and actionable instructions such as `DOCUMENT_TOO_BLURRY`, `SELFIE_TOO_DARK`, or `MULTIPLE_FACES`, without exposing internals.
- **Exhaustion:** Exhausted technical retries remain a retryable-support failure; exhausted evidence re-uploads route to manual review or rejection according to the explicit policy reason, never a generic face mismatch.

## Human Override Design

- Allowed transitions: automatic `approved`, `manual_review`, or `rejected` to final `approved` or `rejected`.
- Only the assigned verifier, or an explicitly authorized organization administrator if approved, may override.
- Reason is mandatory, trimmed, length-bounded, and stored with actor, timestamp, previous decision, new decision, and optional structured reason code.
- The immutable automatic decision and supporting scores remain visible after override.
- Override, workflow advancement/rejection, result update/decision record, and audit event occur in one MongoDB transaction.
- Repeating the same override is idempotent; an opposite second decision conflicts unless a separate correction policy is explicitly approved.
- Audit details contain IDs, decisions, and reason codes, not OCR text, full identifiers, embeddings, or images.

## Persistence Changes

### New `VerificationResult`

- References organization, request, execution, document, and evidence attempt.
- Stores versioned sanitized result sections and immutable automatic decision.
- Stores final decision and optional override metadata or references a separate override record.
- Adds unique `{ execution: 1, attempt: 1 }` index.
- Adds tenant/request and decision queue indexes required by applicant and verifier reads.

### `VerificationDocument`

- Add `execution`, `uploadAttempt`, `supersedes`, `supersededAt`, `idempotencyKey`, `contentDigest`, and processing status.
- Add sanitized file-validation and quality summaries.
- Replace raw free-form extraction writes with a versioned reference to `VerificationResult`; retain legacy metadata for compatibility during migration.
- Add a partial unique index that prevents two active document uploads for the same execution and role.

### `VerificationStepExecution`

- Add `currentEvidenceAttempt`, `maxReuploads`, `reuploadCount`, and `currentResult`.
- Store only orchestration metadata and references; do not duplicate the full ML/OCR payload.

### `AuditLog`

- Add result-created, re-upload-requested, evidence-superseded, and decision-overridden actions.
- Store sanitized reason codes and version identifiers only.

### Migration

- Run read-only preflight for existing face/document executions, duplicate active uploads, missing files, and unversioned metadata.
- Backfill legacy document results as `schemaVersion: "legacy-0"` without inventing confidence or decisions.
- Do not reinterpret old `liveness` scores as real anti-spoofing evidence; label them legacy image-quality heuristics.
- Install unique indexes only after conflicts are reported and resolved.

## API Boundaries

### ML service

- `GET /health/live`: process is running; must not load models.
- `GET /health/ready`: required models loaded and a lightweight inference precondition passes.
- `POST /v1/image-quality/document`: decoded document quality and face-detection summary.
- `POST /v1/image-quality/selfie`: selfie quality and face-detection summary; never labeled liveness.
- `POST /v1/face/compare`: document/selfie quality plus similarity result under a versioned Pydantic response model.
- Internal failures return a correlation ID and stable code; stack traces and filesystem paths stay in sanitized server logs.

### Backend

- Preserve the existing upload/face routes as compatibility facades where practical.
- Add idempotency headers or validated body keys for upload, re-upload, and override commands.
- Add an authorized result read endpoint for applicant-safe output and a richer verifier result endpoint.
- Add a re-upload request/submit command with explicit reason codes and attempt limits.
- Replace bare approve/reject behavior with an override-aware decision command while retaining compatible route aliases during migration.

## Testing Strategy

### ML unit and API tests

- Valid/invalid image bytes, signature mismatch, oversized dimensions, and unsupported formats.
- Blur, dark, bright, low-contrast, glare, undersized-face, no-face, and multiple-face fixtures.
- Deterministic score bounds and reason codes.
- Face similarity response shape, threshold boundaries, and zero-norm protection.
- Stable Pydantic schema and sanitized 4xx/5xx errors.
- Tests proving no endpoint or payload calls the heuristic liveness/anti-spoofing.

### OCR/parser tests

- Clean and noisy Aadhaar/PAN fixtures.
- Ambiguous OCR characters, spacing, case normalization, missing fields, and multiple candidates.
- Aadhaar digit/prefix/checksum cases and PAN pattern cases.
- Per-field confidence bounds and type-detection confidence.
- No test fixture may contain a real identity number or real person's document.

### Backend integration/concurrency tests

- One immutable result per execution attempt and database rejection of duplicates.
- Upload idempotency, simultaneous uploads, re-upload supersession, and attempt limits.
- Claim/execute/finalize with mocked OCR/ML boundaries.
- Late response after cancellation, retry, supersession, or lease expiry.
- Infrastructure failure versus evidence failure mapping.
- Automatic decision to workflow outcome mapping.
- Same/opposite human override races and rollback on audit/advancement failure.
- Tenant, applicant, and assigned-verifier result/evidence access.
- Legacy result migration and index installation.

### Frontend tests

- Camera unsupported/denied fallback to file upload.
- Preview, retake, submission, quality feedback, and re-upload flows.
- Applicant-safe result explanations for all three decisions.
- Verifier display of quality checks, field confidence, face score, reason codes, and override reason validation.
- Loading, duplicate-submit, service-failure, expired-attempt, and terminal-request states.
- Accessibility for camera controls, error summaries, keyboard navigation, and status announcements.

### Accuracy and calibration gate

- Create a synthetic/consented, non-production fixture manifest with expected type, fields, quality labels, and same/different-person labels.
- Report document-type accuracy, required-field extraction accuracy, false accept rate, false reject rate, and manual-review rate.
- Record dataset limitations and threshold provenance in `ML-Service/MODEL_CARD.md`.
- Do not advertise accuracy percentages or “AI-powered fraud detection” without reproducible measurements.

---

## Task 1: Establish the Phase 3 Contract and Test Foundation

**Goal:** Freeze names, result schema, reason codes, adapter interfaces, fixtures, and test commands before changing behavior.

**Files:**
- Create: `docs/verification/result-schema-v1.md`
- Create: `Backend/src/domain/verification-result.js`
- Create: `Backend/test/verification-result-schema.test.js`
- Create: `ML-Service/tests/conftest.py`
- Create: `ML-Service/tests/test_health.py`
- Create: `ML-Service/pytest.ini`
- Modify: `ML-Service/requirements.txt`

**Prerequisites:** Updated `main` containing completed Phase 2; clean isolated Phase 3 worktree.

**Database changes:** None.

- [ ] Confirm worktree, feature branch, clean status, merge base, and baseline test results.
- [ ] Write the result JSON Schema/Pydantic examples, stable decisions, and stable reason-code catalog.
- [ ] Write failing backend contract tests for decisions, score bounds, required versions, sanitized evidence, and unknown fields.
- [ ] Write failing FastAPI health tests that do not require downloading/loading the full face model.
- [ ] Implement only the constants/validators and test scaffolding required by those tests.
- [ ] Run backend unit tests and ML tests.
- [ ] Review terminology to prove no new heuristic is called liveness or anti-spoofing.

**Acceptance criteria:**

- One reviewed contract defines all cross-service fields before implementation begins.
- Automatic decisions are exactly `approved`, `manual_review`, or `rejected`.
- Scores reject NaN, infinity, and values outside `[0,1]`.
- Tests can run without network access or model downloads.
- No production pipeline behavior changes in this task.

**Risks:** A loose contract will cause backend/ML drift; overfitting it to current metadata will preserve existing design debt.

**Suggested commit:** `test(verification): define versioned result contract`

## Task 2: Add ML Service Testability and Versioned Error Handling

Refactor model initialization behind dependency injection/lifespan startup, add liveness/readiness endpoints, Pydantic request/response models, request limits, stable errors, and sanitized logging.

**Acceptance:** API tests inject fake analyzers, production models load once, readiness reflects model state, and internal errors never expose stack traces or paths.

**Suggested commit:** `refactor(ml): add testable versioned service boundaries`

## Task 3: Implement File and Image-Quality Analysis

Add signature/decode/dimension validation and explainable document/selfie quality checks with versioned weights, critical failures, bounded scores, and fixture tests.

**Acceptance:** Corrupt/unsupported files fail before inference; every response contains an overall score plus individual checks; borderline versus unusable evidence is distinguishable.

**Suggested commit:** `feat(ml): add explainable image quality analysis`

## Task 4: Correct Face Analysis Terminology and Harden Similarity

Rename liveness heuristic code and routes to selfie quality, validate exactly one face, add face area/pose/detection evidence, guard similarity math, expose pinned model/threshold metadata, and keep a documented deprecation path for old routes.

**Acceptance:** No current API/UI/result claims liveness; same/different fixture pairs produce deterministic schema-valid outputs; malformed embeddings cannot yield approval.

**Suggested commit:** `feat(ml): harden face quality and similarity results`

## Task 5: Introduce a Clean OCR Adapter and Confidence Contract

Extract Tesseract.js calls behind an adapter with typed input/output, timeouts, normalized OCR blocks, confidence mapping, language policy, and deterministic fake adapter tests. Keep OCR outside transactions.

**Acceptance:** The document executor depends only on the OCR interface; adapter failure maps to retryable infrastructure failure; low OCR confidence maps to evidence uncertainty.

**Suggested commit:** `refactor(verification): isolate OCR processing adapter`

## Task 6: Implement Aadhaar/PAN Detection, Parsing, and Structural Validation

Replace ad hoc parsers and unfinished checkers with pure, tested normalization, multi-signal type detection, field candidates/confidence, Aadhaar structural/checksum rules, and PAN format rules.

**Acceptance:** Noisy synthetic fixtures are deterministic; declared/detected mismatches carry stable reason codes; validation never claims authoritative authenticity.

**Suggested commit:** `feat(verification): validate Aadhaar and PAN evidence`

## Task 7: Add Immutable Verification Result Persistence

Create the result model, execution-attempt uniqueness index, evidence/result references, sanitized storage serializer, legacy migration preflight/backfill, and real-Mongo integration tests.

**Acceptance:** Duplicate results for one execution attempt are rejected by MongoDB; legacy data remains readable; raw embeddings and full OCR text are absent from result/audit records.

**Suggested commit:** `feat(verification): persist versioned attempt results`

## Task 8: Build the Backend Decision Orchestrator

Compose file checks, quality, OCR, type/format validation, face analysis, and decision policy through claim-execute-finalize. Persist the immutable result and finalize the Phase 2 execution transactionally.

**Acceptance:** All three decisions are reachable in tests; infrastructure errors remain retryable failures; ambiguous evidence becomes manual review; late results cannot win.

**Suggested commit:** `feat(verification): orchestrate evidence-based decisions`

## Task 9: Add Idempotent Re-Upload and Retry Policy

Model evidence attempts, supersession, limits, idempotency keys, actionable reason codes, and authorization. Preserve prior files/results and integrate processing retry with Phase 2 attempt history.

**Acceptance:** Concurrent duplicate submissions create one attempt; deliberate re-upload creates one new attempt; limits are enforced; cancelled/terminal requests reject new evidence.

**Suggested commit:** `feat(verification): add controlled evidence re-upload`

## Task 10: Add Human Override with Transactional Audit

Add override-aware verifier commands, mandatory reason validation, same-decision idempotency, opposite-decision conflict handling, atomic workflow advancement/rejection, and sanitized structured audit events.

**Acceptance:** Automatic evidence remains immutable; one authorized override changes the final decision atomically; audit or advancement failure rolls everything back.

**Suggested commit:** `feat(verification): add audited human decision override`

## Task 11: Build Applicant Capture and Quality UX

Split the oversized request screen into focused document upload, camera/selfie capture, preview/retake, quality feedback, re-upload, and result-summary components. Use `getUserMedia` with an accessible file fallback.

**Acceptance:** Applicants can capture or upload a selfie, understand actionable quality failures, safely retry/re-upload, and see an honest explanation of pending/manual/approved/rejected outcomes.

**Suggested commit:** `feat(frontend): add guided verification capture flow`

## Task 12: Build the Verifier Evidence and Override UX

Display document preview, extracted fields with confidence, validation checks, quality breakdown, face similarity, automatic decision/reasons, history, and a reason-required final decision form.

**Acceptance:** The verifier can distinguish evidence from conclusions, inspect uncertainty, submit one authorized override, and see its durable audited result.

**Suggested commit:** `feat(frontend): add explainable verifier review`

## Task 13: Add Calibration Fixtures, Model Card, and Security Checks

Create non-production fixture manifests, threshold evaluation scripts, a model card, privacy/logging tests, dependency audits, upload abuse cases, and documented limitations.

**Acceptance:** Thresholds have recorded evidence; no real identity data is committed; logs/audits are sanitized; known limitations and non-liveness status are explicit.

**Suggested commit:** `docs(verification): document model behavior and limits`

## Task 14: Full End-to-End and Regression Verification

Run ML, backend unit/integration/concurrency/migration, frontend component/lint/build, security, dependency, and end-to-end tests. Exercise approved, manual-review, rejected, retry, re-upload, override, cancellation, and late-result paths from the UI through persistence.

**Acceptance:** All suites pass; result/index/migration integrity reports are clean; the Phase 2 workflow invariants remain intact; generated model/cache/upload artifacts are absent from Git; the README accurately describes measured capabilities and limitations.

**Suggested commit:** `test(verification): verify Phase 3 pipeline end to end`

---

## Recommended Pull Request Boundaries

1. **Foundation PR:** Tasks 1-4 — contracts, ML testability, image quality, and corrected terminology.
2. **Document intelligence PR:** Tasks 5-7 — OCR adapter, Aadhaar/PAN validation, and immutable results.
3. **Decision pipeline PR:** Tasks 8-10 — orchestration, re-upload/retry, and human override.
4. **Experience and evidence PR:** Tasks 11-13 — applicant/verifier UX, calibration, documentation, and security checks.
5. **Release PR or release gate:** Task 14 — full regression and end-to-end verification.

Each PR must include the latest `main`, list exact test results, review generated-file changes, and merge only after its independent acceptance criteria pass.

## Decisions Requiring Approval Before Implementation

1. **Supported inputs:** Recommended Phase 3 scope is JPEG/PNG images for Aadhaar front and PAN; PDF support should route to manual review or a later dedicated task rather than silently rasterizing arbitrary PDFs.
2. **OCR placement:** Recommended first implementation keeps Tesseract.js behind a backend adapter. Moving OCR to Python is reasonable only if benchmarked accuracy/deployment needs justify the added runtime dependency.
3. **Decision thresholds:** Approve the calibration dataset and gray-zone policy before selecting quality, field-confidence, or face-similarity numbers.
4. **Automatic rejection:** Decide whether low face similarity may automatically reject or must always require human review for the resume/demo release.
5. **Human roles:** Decide whether only the assigned verifier can override or organization administrators may also do so.
6. **Limits:** Approve the recommended defaults of three processing retries and two evidence re-uploads per execution.
7. **Sensitive storage:** Choose encryption/key-management and retention policy for raw files and extracted identifiers before production deployment; local unencrypted uploads are acceptable only for development fixtures.
8. **Result visibility:** Define which unmasked extracted fields applicants, verifiers, and organization administrators may view.
9. **Anti-spoofing:** Recommended Phase 3 wording is image/selfie quality validation only. Real liveness requires a separately evaluated anti-spoofing system and must not be implied by marketing copy.

## Definition of Phase 3 Complete

Phase 3 is complete only when a user can submit a supported identity document and selfie through the frontend, the system produces an immutable versioned and explainable result, uncertain cases reach a verifier, authorized human override is reasoned and audited, retry/re-upload behavior is bounded and idempotent, and the full merged-tree regression suite passes. Completion does not mean government-source authenticity verification or real liveness unless those capabilities are separately implemented and evaluated.
