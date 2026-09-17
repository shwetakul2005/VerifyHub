# Phase 2 Workflow Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VerifyHub's workflow engine sequential, idempotent, transactional, version-safe, recoverable, and auditable without unrelated refactors.

**Architecture:** Introduce one central workflow transition/coordinator layer that owns request and execution state changes. Persist immutable published workflow versions and request snapshots, enforce one execution per request/step with a database index, and commit related state changes and audit events in MongoDB transactions. Step-specific services perform external work and return outcomes; they do not advance requests directly.

**Tech Stack:** Node.js 22, Express 5, Mongoose 9, MongoDB transactions, Node's built-in test runner, Supertest, and mongodb-memory-server.

**Spec:** This self-contained plan records the approved Phase 2 design and implementation sequence.

## Global Constraints

- Complete and review one numbered task at a time; do not continue automatically.
- Use test-first development for every behavior change.
- Do not perform broad unrelated refactors.
- Do not add dependencies unless the task cannot be completed safely with the existing stack.
- Enforce true data invariants with database constraints.
- Enforce state transitions centrally rather than in controllers or individual executors.
- Preserve existing data through an explicit dry-run-capable migration strategy.
- Keep existing API behavior compatible unless a Phase 2 invariant requires a documented conflict response.
- Do not run email, OCR, filesystem, or ML operations inside MongoDB transactions.
- Write workflow audit events in the same transaction as the transition they describe.

---

## Approved Domain Decisions

1. Create `feat/phase-2-workflow-reliability` from commit `6805d9e` on `test/db-integration`; do not modify the source branch.
2. Retain optional steps and introduce terminal execution state `skipped` for an explicit optional-step skip operation.
3. Use explicit manual retry in Phase 2, with three retries by default and a per-published-step override. Do not add a queue or worker in Phase 2.
4. Treat infrastructure/service failures as retryable execution failures. Treat verifier rejection and confirmed identity mismatch as business rejection of the request.
5. Allow organization administrators and the owning applicant to cancel pending or in-progress requests. Verifiers cannot cancel requests.
6. Reject edits to published versions with HTTP 409. Creating a new version is an explicit command, not an implicit PATCH side effect.
7. Guarantee idempotent database transitions and suppress concurrent duplicate external calls with atomic claims and leases. Exactly-once delivery across a process crash is out of scope unless an external provider supports idempotency.
8. Preserve existing records with preflight, backfill, verification, and index-install migration stages.
9. Prevent publication of phone, police, and medical steps until their executors implement the lifecycle contract.

## Current Architecture and Verified Defects

The workflow definition is split between `WorkflowTemplate` and mutable `WorkflowStep` documents. `VerificationRequest` stores a live template reference and `currentStep`. `VerificationStepExecution` is created lazily and has no uniqueness constraint. `workflow-engine.service.js` coordinates start, execution, recursive advancement, and completion, while email, face, and verifier services also advance or terminate requests directly.

Verified release blockers:

- Request creation stores `startedAt` while the request is still `pending`.
- Applicant endpoints can execute work before the central start command.
- Email expiry can create another execution for the same request and step.
- Start, execute, complete, approve, and reject are not consistently idempotent.
- Approval, execution completion, advancement, and rejection span independent writes.
- Completion and progress read mutable live workflow steps rather than a request snapshot.
- Completion can leave an `in_progress` request with no current step.
- Published templates and their steps remain editable and hard-deletable.
- No retry or cancellation model exists.
- Audit logging has a schema but no transition writer and insufficient action/target types.
- Phone, police, and medical step implementations do not satisfy the execution contract.
- The progress export is already corrected on the approved baseline, but null/correctness regression coverage is missing.

## Required Invariants

1. Every snapshotted request step has exactly one execution document.
2. Only the request's current execution may begin or complete.
3. Duplicate commands cannot create duplicate records, transitions, or ordinary duplicate side effects.
4. Request terminal states cannot transition again.
5. Execution terminal states cannot transition again.
6. A failed execution may only retry while it remains the current execution, the request is in progress, and retry budget remains.
7. Approval/rejection, execution transition, request advancement/termination, and audit writes are atomic.
8. Cancellation terminally stops the request and all non-terminal executions; late external results cannot advance it.
9. Published versions and steps are immutable.
10. Each request continues against the exact workflow version and snapshot captured at creation.
11. Referenced templates, steps, requests, executions, documents, and audit history remain available.
12. Every committed workflow transition has one structured audit event.

## Approved State Machines

### Request

| State | Allowed outgoing states | Terminal |
|---|---|---|
| `pending` | `in_progress`, `cancelled` | No |
| `in_progress` | `completed`, `rejected`, `cancelled` | No |
| `completed` | None | Yes |
| `rejected` | None | Yes |
| `cancelled` | None | Yes |

Technical failure remains on the current execution; it does not add a request-level `failed` state.

### Execution

| State | Allowed outgoing states | Terminal |
|---|---|---|
| `pending` | `waiting_for_input`, `processing`, `skipped`, `cancelled` | No |
| `waiting_for_input` | `processing`, `failed`, `cancelled` | No |
| `processing` | `waiting_for_review`, `completed`, `failed`, `cancelled` | No |
| `waiting_for_review` | `completed`, `failed`, `cancelled` | No |
| `failed` | `pending`, `cancelled` | Conditionally retryable |
| `completed` | None | Yes |
| `skipped` | None | Yes |
| `cancelled` | None | Yes |

Repeated commands that already achieved the requested state return the durable current result. Incompatible transitions return HTTP 409 with a stable transition error code.

## Persistence Design

### WorkflowTemplate

- Treat each document as one immutable version.
- Add `familyId`, `previousVersion`, required `version`, `publishedBy`, `archivedBy`, `archiveReason`, and `schemaVersion`.
- Add unique `{ organization, familyId, version }` index.

### WorkflowStep

- Add archive metadata and schema version.
- Add unique `{ workflowTemplate, stepOrder }` index.
- Freeze steps once their version is published.

### VerificationRequest

- Add exact `workflowVersion` reference and embedded `workflowSnapshot`.
- Add `currentExecution`, `stateVersion`, and `lastTransitionAt`.
- Add rejection, cancellation, and archival actor/time/reason metadata.
- Retain `workflowTemplate` and `currentStep` as compatibility fields during migration.

### VerificationStepExecution

- Require request and step references.
- Add expanded state enum, step order/snapshot, state version, attempt/retry history, structured error, processing token/lease, cancellation metadata, and skip metadata.
- Enforce unique `{ verificationRequest, workflowStep }` after migration cleanup.

### AuditLog

- Add request/execution/version transition actions and target models.
- Add `actorType`, transition from/to/command/reason, correlation ID, and idempotency key.
- Never copy tokens, document contents, OCR text, or biometric payloads into audit records.

## Transaction Boundaries

- Request creation: request, snapshot executions, and creation audit event.
- Start: request transition, first execution activation, and audit events.
- Completion/advancement: execution transition, next-execution selection, request update, and audit events.
- Approval/rejection: document decision, execution transition, request advance/termination, future-execution cancellation where applicable, and audit events.
- Retry: failed-to-pending transition, retry metadata, and audit event.
- Cancellation: request cancellation, all non-terminal execution cancellations, and audit event.

External work follows claim, execute, finalize: claim in a transaction; call the external dependency outside the transaction; finalize in another transaction only if the request, execution, processing token, and lease still match.

## Idempotency Rules

- Start: an already in-progress request returns its current state; terminal states conflict.
- Execute: only an atomic claim owner performs work; other calls return current state.
- Complete: repeated completion preserves the original terminal state and timestamp.
- Approve/reject: repeating the same decision returns it; the opposite decision conflicts.
- Retry: reuse the same execution and require an idempotency key for each intended retry.
- Cancel: repeated cancellation is a no-op preserving the original actor and reason.

## Migration Strategy

1. Gate workflow writes and back up the database.
2. Run a read-only preflight for duplicate executions/orders, missing references, draft references, and ambiguous active states.
3. Backfill version lineages and request snapshots.
4. Map legacy execution states using their step type and metadata; report ambiguous records rather than guessing.
5. Resolve duplicates without discarding conflicting terminal results.
6. Create missing execution rows for snapshot steps.
7. Re-run integrity validation.
8. Install unique indexes only after the data passes validation.
9. Deploy application code and run a post-deployment integrity report.

## Testing Strategy

- Table-driven unit coverage for every valid/invalid request and execution transition.
- Real MongoDB replica-set integration coverage for transactions, rollback, uniqueness, sequencing, idempotency, and concurrent commands.
- Mock only external email, OCR, ML, and filesystem boundaries.
- Versioning tests must prove old requests retain old snapshots.
- Archival tests must prove referenced history remains resolvable.
- Audit tests must prove one event per transition and transaction rollback on audit failure.

---

## Task 1: Establish the Transaction-Capable Test Foundation

**Goal:** Run backend integration tests on a temporary MongoDB replica set and prove transaction rollback behavior.

**Files:**
- Modify: `Backend/test/integration/database.helper.js`
- Create: `Backend/test/integration/database-transaction.integration.test.js`
- Modify only if necessary: `Backend/package.json`

**Prerequisites:** Branch from `test/db-integration` commit `6805d9e`; locked dependencies installed.

**Database changes:** None.

- [ ] Confirm the linked worktree, feature branch, clean Git status, and baseline commit.
- [ ] Install locked backend dependencies.
- [ ] Run all existing backend tests and record the baseline.
- [ ] Write a transaction rollback test using the shared database helper.
- [ ] Run it against the standalone helper and verify it fails because transactions require a replica set.
- [ ] Change the helper from `MongoMemoryServer` to `MongoMemoryReplSet`, preserving database cleanup and shutdown behavior.
- [ ] Run the targeted transaction test.
- [ ] Run the complete backend unit and integration suites.
- [ ] Run JavaScript syntax checks, dependency audit, and Git diff checks.
- [ ] Review the diff for lifecycle leaks, cleanup safety, unintended production changes, and unnecessary configuration.

**Acceptance criteria:**

- The helper starts a temporary replica set and connects Mongoose to it.
- A transaction that inserts a document and then throws leaves no inserted document after abort.
- All pre-existing integration tests remain isolated and pass.
- No production application file or dependency is changed.

**Risks:** Replica-set startup is slower; shutdown must always disconnect Mongoose and stop the replica set, including failed hooks.

**Suggested commit:** `test(backend): run integration tests on MongoDB replica set`

## Task 2: Characterize and Fix Progress/API Defects

Harden progress null handling and execution-derived results, preserve the corrected export, fix GET/PATCH step validation placement, and add focused HTTP regression tests. Do not mix state-machine implementation into this task.

**Acceptance:** Missing/deleted references cannot cause null dereferences; terminal progress is stable; workflow step GET accepts an empty body; PATCH validates input.

## Task 3: Introduce Central State-Machine Definitions

Create a domain module containing states, terminal-state helpers, allowed transition tables, and stable invalid-transition errors. Add exhaustive table-driven unit tests.

**Acceptance:** Every approved transition is accepted, every other transition is rejected, and services no longer need to invent transition rules.

## Task 4: Add Lifecycle Schema Fields

Add version lineage, snapshots, state versions, retry/cancellation/archive metadata, expanded execution states, and structured audit fields without deploying dirty-data-sensitive unique indexes yet.

**Acceptance:** Models represent the approved state machines and metadata while existing documents remain readable.

## Task 5: Add Safe Migration and Integrity Tooling

Create dry-run-capable preflight, backfill, duplicate-resolution, verification, and index-install scripts. Test them against legacy fixtures and require rerun safety.

**Acceptance:** Ambiguous data aborts with a report; valid legacy data migrates identically on repeated runs; indexes install only after verification.

## Task 6: Publish Immutable Workflow Versions

Add explicit publish and create-version commands. Reject edits to published templates/steps, validate supported step types and configurations, and prevent archived versions from accepting new requests.

**Acceptance:** A new version does not mutate any prior published version, and concurrent version creation cannot duplicate version numbers.

## Task 7: Create Requests and Executions Atomically

Create the request snapshot, request document, exactly one execution per snapshot step, and audit event in one transaction.

**Acceptance:** Pending requests have no start timestamp, rollback leaves no partial data, and the execution uniqueness invariant is database-enforced.

## Task 8: Implement the Sequential Transactional Coordinator

Replace recursive advancement with centralized start, atomic claim, finalize, advance, and complete operations using expected state and state version.

**Acceptance:** Only the current execution runs, concurrent commands have one winner, and terminal requests cannot reopen.

## Task 9: Convert Step Services into Outcome Adapters

Refactor email, document, and face services to perform type-specific external work and return outcomes without directly advancing or terminating requests.

**Acceptance:** No executor calls request advancement; waiting, success, technical failure, and late-result paths are covered.

## Task 10: Add Retry and Cancellation Commands

Add authorized retry/cancel APIs, retry budgets and idempotency keys, attempt history, terminal cancellation, and late-result rejection.

**Acceptance:** Retry reuses the execution ID; cancellation preserves data and prevents subsequent advancement.

## Task 11: Make Review Decisions Atomic

Move document approve/reject into the central transition transaction with conditional review status and structured audit events.

**Acceptance:** Simultaneous decisions produce one durable outcome; forced advancement/audit failure rolls back the document decision.

## Task 12: Replace Destructive Deletion with Archival

Archive referenced workflow versions, steps, and terminal requests; exclude archived records from default active queries while keeping history resolvable.

**Acceptance:** No referenced workflow history can be physically removed through public services.

## Task 13: Complete Structured Transition Auditing

Ensure every request, execution, review, retry, cancellation, publication, version, and archive transition writes exactly one sanitized structured event in the owning transaction.

**Acceptance:** Committed transitions have one event, failed transactions have none, and sensitive data is absent.

## Task 14: Full Regression and Integrity Verification

Run unit, HTTP, transaction, concurrency, migration, versioning, archival, audit, syntax, build, and dependency checks. Confirm migration dry-run has no unresolved violations and all intended indexes exist.

**Acceptance:** The complete suite passes, integrity reports are clean, unsupported steps cannot publish, and no destructive referenced-record deletion remains.
