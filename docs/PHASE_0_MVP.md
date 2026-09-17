# VerifyHub MVP Definition

## Purpose

This document fixes the scope of the first portfolio-ready release of VerifyHub. The MVP must demonstrate one complete, secure, auditable identity-verification journey rather than several partially implemented verification types.

The release is complete only when a reviewer can clone the repository, start the system from documented commands, seed demo data, and finish the full journey without editing database records manually.

## Product statement

VerifyHub is a multi-tenant identity-verification workflow platform. An organization administrator publishes a reusable verification workflow and invites an applicant. The applicant verifies their email, submits an identity document and selfie, and receives a result produced by automated checks or human review. Every significant action and state transition is recorded for auditability.

## Primary showcase journey

1. An organization administrator signs in.
2. The administrator creates or selects an organization.
3. The administrator creates a draft workflow containing these ordered steps:
   1. Email verification.
   2. Identity-document verification.
   3. Face verification.
4. The administrator assigns a verifier and publishes an immutable workflow version.
5. The administrator invites an applicant by email.
6. The applicant opens a one-time invitation link and signs in or registers.
7. The invitation is claimed once and creates one verification request.
8. The workflow starts at email verification.
9. The applicant verifies the email address using a time-limited, single-use token.
10. The applicant uploads the requested identity document.
11. The system validates the file, stores it privately, performs OCR and extracts supported fields.
12. The applicant submits a selfie. The system checks image quality and compares its face embedding with the document face.
13. The decision layer produces one of three outcomes:
    - Approved automatically.
    - Manual review required.
    - Rejected.
14. If review is required, the assigned verifier reviews the artifacts and records an approval or rejection with a reason.
15. The workflow reaches a terminal state.
16. The administrator and applicant can view the outcome and a role-appropriate history.
17. The audit log shows the invitation, submissions, automated decisions, manual decision, and workflow transitions.

## MVP roles

### Platform administrator

Platform administration is limited to seeded/demo operations for the MVP. A production-grade platform administration console is deferred.

### Organization administrator

An organization administrator can:

- View only organizations in which they have an active `org_admin` membership.
- Manage members of those organizations.
- Create, edit, publish, archive, and clone workflows in those organizations.
- Assign a verifier who belongs to the same organization.
- Invite applicants to a published workflow.
- View requests, results, and audit events belonging to the organization.

### Verifier

A verifier can:

- View only review tasks assigned to them within an organization where they have an active `verifier` membership.
- View the minimum applicant and artifact data required for that task.
- Approve or reject a review once, recording a reason for rejection and optional review notes.

### Applicant

An applicant can:

- Claim an invitation addressed to them.
- View only their own verification requests.
- Act only on the current workflow step.
- Submit required evidence, retry when policy allows, and view the final status.

## In scope

### Authentication and tenancy

- Registration, login, logout, and current-user retrieval.
- Secure cookie-based sessions or an equivalently documented token flow.
- Organization membership with tenant-scoped authorization.
- Explicit ownership and assignment checks on every protected resource.
- Active-user and active-membership enforcement.

### Organizations

- Create and view an organization.
- List organizations available to the signed-in user.
- Invite or add a verifier for the demo journey.
- View members and their organization roles.

### Workflow management

- Draft workflow creation and editing.
- Ordered email, document, and face-verification steps.
- Step reordering and validation.
- Workflow publication and immutable published versions.
- Workflow archive and clone operations.
- A workflow cannot be published without at least one active step and an assigned verifier.

### Invitations and requests

- Create an invitation for one email address and published workflow version.
- Time-limited, single-use invitation token.
- Idempotent invitation claiming.
- Exactly one request per claimed invitation.
- Request and step status history.

### Email verification

- Time-limited, single-use email verification token.
- Resend with throttling and invalidation of the previous token.
- Successful verification advances the workflow exactly once.

### Document verification

- One identity document per document step.
- Supported inputs for the MVP: JPEG, PNG, and single- or multi-page PDF within a configured size limit.
- Supported document types: Aadhaar and PAN.
- Private storage and authorized retrieval.
- OCR text extraction and structured field extraction.
- Basic deterministic validation for document number format and required fields.
- Image/document quality indicators and extraction confidence.
- Manual review when confidence or validation is insufficient.
- Re-upload after a rejected artifact when allowed by policy.

### Face verification

- Document-face extraction.
- Selfie image capture or upload.
- Image-decode, single-face, and basic quality checks.
- Face-embedding comparison with a versioned threshold.
- Clear distinction between image-quality checks and genuine anti-spoof liveness detection.
- Manual review routing for inconclusive results.

### Human review

- Assigned-verifier queue.
- Artifact preview.
- OCR and face-match evidence display.
- Approve and reject actions.
- Required rejection reason.
- Idempotent review decision and auditable manual override.

### Audit and basic reporting

- Append-only audit events for security-sensitive actions and workflow transitions.
- Request totals by status.
- Manual-review rate.
- Average completion time when sufficient completed data exists.
- Failure/rejection reason summary.

### Developer experience and delivery

- Root README with architecture, setup, environment variables, and demo instructions.
- Seed script with synthetic accounts and workflows.
- Docker Compose for local dependencies and application services.
- Automated lint, test, and production-build checks.
- Deployed demo using synthetic data only.

## Explicitly out of scope

The following items must not delay the MVP:

- Phone OTP verification.
- Police verification.
- Medical verification.
- Parallel workflow branches.
- Conditional workflow branching.
- Drag-and-drop graph edges; simple ordered step composition is sufficient.
- Production-grade biometric liveness or anti-spoof guarantees.
- Automated government-database verification.
- Mobile applications.
- Billing, subscriptions, and usage metering.
- Custom domains and advanced white-labelling.
- Enterprise SSO or SCIM.
- Localization.
- A full platform-administration console.
- Tenant-specific RAG knowledge bases.
- Multiple storage providers exposed through the UI.

Phone, police, and medical step types should be hidden from workflow creation until implemented. Existing placeholder services may remain temporarily for migration compatibility, but they must not be presented as working features.

## Workflow rules

### Execution model

The MVP is strictly sequential. A verification request has at most one actionable step at a time. A step waiting for human review remains the current step; later steps do not start until it is resolved.

### Request states

Allowed request states are:

```text
pending -> in_progress -> completed
                       -> rejected
                       -> cancelled
```

- `pending`: created but not started.
- `in_progress`: exactly one current, non-terminal step exists.
- `completed`: every required step completed successfully.
- `rejected`: a terminal automated or manual decision rejected the request.
- `cancelled`: an authorized administrator cancelled the request.

Terminal requests cannot be restarted or mutated. A new invitation/request is required.

### Step execution states

Allowed execution states are:

```text
pending
waiting_for_input
processing
waiting_for_review
completed
failed
```

Only domain services may change request or execution states. Generic endpoints must not accept arbitrary `status` or `currentStep` values.

### Idempotency invariants

- A request has no more than one execution per workflow step.
- Claiming an invitation repeatedly returns the original request and never creates duplicates.
- Verifying an already-used email token does not advance the workflow again.
- Retrying a network request cannot approve, reject, or advance a step twice.
- Only the current step can accept applicant input.
- A published workflow version never changes after requests reference it.

## Automated decision policy

The automated checks return evidence, not an unqualified truth claim.

### Auto approve

Auto approval is allowed only when:

- The file passed format and quality validation.
- The requested document type matches the extracted structure.
- Required fields were extracted above configured confidence thresholds.
- Deterministic document-number checks passed.
- Exactly one face was found in the identity document and selfie.
- The selfie passed the documented quality checks.
- Face similarity met the evaluated approval threshold.

### Manual review

Manual review is required when processing succeeds but confidence falls in an inconclusive band, a required field needs confirmation, or policy explicitly requires a verifier.

### Automatic rejection

Automatic rejection is limited to clear policy violations such as unreadable input after the permitted retry count, unsupported or mismatched document type, no usable face, multiple faces where one is required, or a face similarity result below the evaluated rejection threshold.

Thresholds must be configuration with recorded model/version metadata, not unexplained constants in route code.

## Data and privacy baseline

- Use synthetic identity data in source control, demos, screenshots, and automated tests.
- Do not commit uploaded identity documents, face images, secrets, virtual environments, generated vector indexes, or database files.
- Store identity artifacts privately and authorize every read.
- Record retention and deletion timestamps.
- Avoid placing raw OCR text, tokens, or biometric embeddings in application logs.
- Encrypt traffic in deployed environments.
- Display applicant consent and a concise data-use notice before uploads.
- State clearly in project documentation that the system is a portfolio demonstration, not a certified KYC product.

## Required frontend surfaces

### Shared

- Login, registration, logout, session expiry, unauthorized, not-found, and error states.
- Responsive application shell derived from the supplied UI reference.
- Role-aware navigation and landing routes.

### Organization administrator

- Overview dashboard.
- Organization and member page.
- Workflow list.
- Ordered workflow builder.
- Workflow preview and publish flow.
- Applicant invitation form.
- Verification request list and detail.
- Audit activity.
- Basic reports.

### Verifier

- Assigned review queue.
- Review detail with document preview, extracted data, quality indicators, face result, and decision controls.

### Applicant

- Invitation claim page.
- Request dashboard.
- Sequential progress view.
- Email verification state.
- Document submission and retry state.
- Selfie submission and retry state.
- Waiting-for-review and final-result states.

## API capability boundaries

The final endpoint naming may change, but the API must expose these capabilities:

- Authentication and current session.
- Current user's organizations and memberships.
- Organization members.
- Workflow draft CRUD, step ordering, publish, clone, and archive.
- Invitation creation, lookup, and claim.
- Applicant-owned request list and detail.
- Applicant action for the current step.
- Assigned-verifier task list and task decision.
- Organization-scoped request search and detail.
- Authorized artifact upload and download.
- Audit event listing.
- Basic reporting metrics.
- Service health and readiness.

All collection endpoints must support bounded pagination. Organization-scoped endpoints must derive or validate tenant access on the server.

## MVP acceptance criteria

### Functional

- The complete showcase journey succeeds from a clean seeded environment.
- At least two organizations exist in test fixtures, and cross-tenant access attempts fail.
- A published workflow can be reused for at least two applicants without mutation.
- A request never has two actionable steps simultaneously.
- Duplicate invitation claims, token verification, submissions, and review decisions do not duplicate side effects.
- Both automatic approval and manual-review paths are demonstrated.
- Rejection and permitted retry paths are demonstrated.
- Audit history agrees with the final request state.

### Quality

- Frontend and backend lint checks pass with zero errors.
- Frontend and backend production builds pass.
- Unit and integration tests cover the workflow transition and authorization layers.
- End-to-end tests cover the principal administrator, applicant, and verifier journeys.
- No secrets or personal identity data are tracked by Git.
- API failures use a consistent error shape and do not expose stack traces.

### ML evidence

- Face-match threshold selection is documented using a reproducible test dataset.
- The evaluation reports false-match and false-non-match behavior, not only overall accuracy.
- OCR extraction is evaluated per supported field and document type.
- Model names, versions, thresholds, and evaluation limitations are documented.
- Image-quality checks are not represented as certified liveness detection.

### Delivery

- A new developer can start the system by following the README.
- Synthetic seed data creates usable admin, verifier, and applicant demo accounts.
- The hosted demo includes no real identity documents.
- A short demo script or video shows the full journey and one failure path.

## Phase 0 exit checklist

- [x] One primary showcase journey is selected.
- [x] Supported roles and their boundaries are defined.
- [x] MVP verification types are limited to email, Aadhaar/PAN document checks, and face comparison.
- [x] Strict sequential workflow execution is selected.
- [x] Automated decision outcomes are defined.
- [x] Explicit non-goals are recorded.
- [x] Functional, quality, ML, privacy, and delivery acceptance criteria are recorded.
- [ ] Confirm final public product name: `VerifyHub` or `Digital Check`.
- [ ] Confirm the deployed MVP will use private object storage rather than local disk.
- [ ] Confirm whether the RAG assistant ships in the MVP or immediately after it.

The three unchecked branding/deployment choices do not block Phase 1 security work. Until decided, implementation should use `VerifyHub` internally, a storage interface with local development and private-object-storage production adapters, and treat RAG as a post-core feature.

## Next implementation milestone

Phase 1 begins with authorization and workflow safety because the current API cannot safely support the MVP journey until tenant boundaries are enforced.

The first Phase 1 slice is:

1. Introduce a coherent organization-membership authorization model.
2. Add reusable tenant, ownership, and verifier-assignment guards.
3. Apply those guards to organization, workflow, request, document, and verifier routes.
4. Remove direct arbitrary request-state mutation.
5. Fix the progress endpoint export/runtime issue.
6. Add cross-tenant and role-matrix integration tests.
