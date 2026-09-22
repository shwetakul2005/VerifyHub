const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const WorkflowTemplate = require("../src/models/workflow-template.model");
const WorkflowStep = require("../src/models/workflow-step.model");
const VerificationRequest = require("../src/models/verification-request.model");
const VerificationStepExecution = require("../src/models/verification-step-execution.model");
const AuditLog = require("../src/models/audit-log.model");

const id = () => new mongoose.Types.ObjectId();

test("legacy workflow records remain valid while version and archive metadata can be stored", async () => {
    const workflow = new WorkflowTemplate({
        organization: id(), name: "Identity", createdBy: id(), assignedVerifier: id(),
        familyId: id(), previousVersion: id(), version: 2, publishedBy: id(),
        schemaVersion: 2, archivedBy: id(), archiveReason: "retired"
    });
    const step = new WorkflowStep({
        workflowTemplate: workflow._id, stepOrder: 1, stepType: "email", title: "Email",
        maxRetries: 4, schemaVersion: 2, archivedAt: new Date(), archivedBy: id(),
        archiveReason: "retired"
    });

    await workflow.validate();
    await step.validate();
    assert.equal(workflow.familyId != null, true);
    assert.equal(workflow.previousVersion != null, true);
    assert.equal(workflow.archivedBy != null, true);
    assert.equal(workflow.archiveReason, "retired");
    assert.equal(step.maxRetries, 4);
    assert.equal(step.schemaVersion, 2);
    assert.equal(step.archivedBy != null, true);
});

test("request schema stores a version snapshot and lifecycle metadata", async () => {
    const workflowVersion = id();
    const stepId = id();
    const request = new VerificationRequest({
        organization: id(), workflowTemplate: workflowVersion, applicant: id(),
        status: "cancelled", workflowVersion, currentExecution: id(), stateVersion: 3,
        lastTransitionAt: new Date(), cancelledAt: new Date(), cancelledBy: id(),
        cancellationReason: "withdrawn", archivedAt: new Date(), archivedBy: id(),
        archiveReason: "retention", schemaVersion: 2,
        workflowSnapshot: {
            version: 2,
            name: "Identity",
            steps: [{ workflowStep: stepId, stepOrder: 1, stepType: "email", title: "Email", isRequired: true, maxRetries: 3 }]
        }
    });

    await request.validate();
    assert.equal(String(request.workflowVersion), String(workflowVersion));
    assert.equal(String(request.workflowSnapshot.steps[0].workflowStep), String(stepId));
    assert.equal(request.stateVersion, 3);
    assert.equal(request.cancellationReason, "withdrawn");
    assert.equal(request.archiveReason, "retention");
});

test("execution schema accepts new states, retry, claim, and cancellation metadata", async () => {
    const execution = new VerificationStepExecution({
        verificationRequest: id(), workflowStep: id(), status: "waiting_for_review",
        stepOrder: 1, stepSnapshot: { stepType: "document", title: "Document", isRequired: true },
        stateVersion: 2, attempt: 2, maxRetries: 3,
        attemptHistory: [{ attempt: 1, startedAt: new Date(), finishedAt: new Date(), errorCode: "OCR_DOWN" }],
        lastError: { code: "OCR_DOWN", message: "Unavailable", retryable: true },
        processingToken: "claim-1", leaseExpiresAt: new Date(),
        cancelledAt: new Date(), cancelledBy: id(), cancellationReason: "withdrawn",
        skippedAt: new Date(), skippedBy: id(), skipReason: "not needed",
        schemaVersion: 2
    });

    await execution.validate();
    assert.equal(execution.status, "waiting_for_review");
    assert.equal(execution.attempt, 2);
    assert.equal(execution.attemptHistory[0].errorCode, "OCR_DOWN");
    assert.equal(execution.lastError.code, "OCR_DOWN");
    assert.equal(execution.processingToken, "claim-1");
    assert.equal(execution.cancellationReason, "withdrawn");
});

test("legacy request and execution shapes remain readable before migration", async () => {
    const request = new VerificationRequest({ organization: id(), workflowTemplate: id(), applicant: id() });
    const execution = new VerificationStepExecution({
        verificationRequest: request._id, workflowStep: id(), status: "in_progress"
    });

    await request.validate();
    await execution.validate();
    assert.equal(request.status, "pending");
    assert.equal(execution.status, "in_progress");
});

test("audit schema stores structured transition events without requiring a user actor for system events", async () => {
    const event = new AuditLog({
        organization: id(), action: "execution_transition", actorType: "system",
        targetModel: "VerificationStepExecution", target: id(),
        transition: {
            fromState: "processing", toState: "failed", command: "finalize",
            reason: "provider_unavailable", correlationId: "trace-1", idempotencyKey: "attempt-1"
        }
    });

    await event.validate();
    assert.equal(event.actorType, "system");
    assert.equal(event.transition.fromState, "processing");
    assert.equal(event.transition.idempotencyKey, "attempt-1");
});
