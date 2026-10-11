const test = require("node:test");
const assert = require("node:assert/strict");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");
const Organization = require("../../src/models/organization.model");
const User = require("../../src/models/user.model");
const WorkflowTemplate = require("../../src/models/workflow-template.model");
const WorkflowStep = require("../../src/models/workflow-step.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");
const VerificationDocument = require("../../src/models/verification-document.model");
const AuditLog = require("../../src/models/audit-log.model");
const verifierService = require("../../src/services/verifier.service");
const VerificationResult = require("../../src/models/verification-result.model");
const VerificationDecision = require("../../src/models/verification-decision.model");
const coordinator = require("../../src/services/workflow-engine.service");
const verificationRequestService = require("../../src/services/verification-request.service");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function fixture(label) {
    const [admin, applicant, verifier] = await User.create([
        { username: `Admin ${label}`, email: `admin-review-${label}@example.com`, password: "test" },
        { username: `Applicant ${label}`, email: `applicant-review-${label}@example.com`, password: "test" },
        { username: `Verifier ${label}`, email: `verifier-review-${label}@example.com`, password: "test", role: "verifier" }
    ]);
    const organization = await Organization.create({
        name: `Review ${label}`,
        slug: `review-${label}`,
        admin: [admin._id],
        members: [{ user: verifier._id, role: "verifier" }]
    });
    const workflow = await WorkflowTemplate.create({
        organization: organization._id,
        name: "Review workflow",
        status: "published",
        version: 1,
        createdBy: admin._id,
        assignedVerifier: verifier._id,
        publishedAt: new Date()
    });
    workflow.familyId = workflow._id;
    await workflow.save();
    const steps = await WorkflowStep.create([
        { workflowTemplate: workflow._id, stepOrder: 1, stepType: "document", title: "Review PAN", config: { documentType: "PAN" } },
        { workflowTemplate: workflow._id, stepOrder: 2, stepType: "face_verification", title: "Face" }
    ]);
    const request = await VerificationRequest.create({
        organization: organization._id,
        workflowTemplate: workflow._id,
        workflowVersion: workflow._id,
        applicant: applicant._id,
        status: "in_progress",
        currentStep: steps[0]._id,
        startedAt: new Date(),
        schemaVersion: 2
    });
    const executions = await VerificationStepExecution.create([
        {
            verificationRequest: request._id,
            workflowStep: steps[0]._id,
            stepOrder: 1,
            stepSnapshot: { stepType: "document", title: "Review PAN", isRequired: true, maxRetries: 3 },
            status: "waiting_for_review",
            schemaVersion: 2
        },
        {
            verificationRequest: request._id,
            workflowStep: steps[1]._id,
            stepOrder: 2,
            stepSnapshot: { stepType: "face_verification", title: "Face", isRequired: true, maxRetries: 3 },
            status: "pending",
            schemaVersion: 2
        }
    ]);
    request.currentExecution = executions[0]._id;
    await request.save();
    const document = await VerificationDocument.create({
        verificationRequest: request._id,
        workflowStep: steps[0]._id,
        title: "PAN",
        documentType: "PAN",
        fileName: "synthetic.png",
        filePath: "uploads/synthetic.png",
        mimeType: "image/png",
        fileSize: 10,
        reviewStatus: "pending"
    });
    return { applicant, verifier, request, executions, document };
}

async function createAutomaticResult(data, automaticDecision = "manual_review") {
    const payload = {
        schemaVersion: "1.0", pipelineVersion: "document-face-v1",
        componentVersions: { ocr: "v1", documentQuality: "v1", selfieQuality: "v1", faceMatcher: "v1", decisionPolicy: "v1" },
        verificationRequest: String(data.request._id), execution: String(data.executions[0]._id), attempt: 1,
        document: { documentId: String(data.document._id), declaredType: "PAN", detectedType: "PAN",
            typeConfidence: 0.9, typeMatches: true,
            quality: { score: 0.8, checks: [{ code: "SHARPNESS", passed: true, score: 0.8 }] },
            fields: { panNumber: { valueMasked: "ABCDE****F", valueHash: "digest", confidence: 0.8, source: "ocr", formatValid: true } },
            face: { detected: true, count: 1, confidence: 0.9 } },
        selfie: { quality: { score: 0.8, checks: [{ code: "BRIGHTNESS", passed: true, score: 0.8 }] },
            face: { detected: true, count: 1, confidence: 0.9 } },
        faceComparison: { similarity: 0.5, threshold: 0.8, matched: false, model: "face", modelVersion: "1" },
        thresholds: { documentQualityMin: 0.7, selfieQualityMin: 0.7, fieldConfidenceMin: 0.75 },
        automaticDecision, finalDecision: automaticDecision, reasonCodes: ["FACE_SIMILARITY_UNCERTAIN"],
        createdAt: "2026-10-10T00:00:00.000Z"
    };
    const result = await VerificationResult.create({ organization: data.request.organization,
        verificationRequest: data.request._id, execution: data.executions[0]._id, document: data.document._id,
        attempt: 1, schemaVersion: "1.0", pipelineVersion: "document-face-v1",
        automaticDecision, finalDecision: automaticDecision, reasonCodes: payload.reasonCodes, result: payload });
    await VerificationStepExecution.updateOne({ _id: data.executions[0]._id }, { $set: { currentResult: result._id } });
    return result;
}

test("simultaneous approvals produce one decision and advance atomically", async () => {
    const data = await fixture("approve");
    const decisions = await Promise.all([
        verifierService.approve(data.document._id, data.verifier._id),
        verifierService.approve(data.document._id, data.verifier._id)
    ]);
    assert.equal(decisions.every((document) => document.reviewStatus === "approved"), true);
    const request = await VerificationRequest.findById(data.request._id).lean();
    const first = await VerificationStepExecution.findById(data.executions[0]._id).lean();
    assert.equal(first.status, "completed");
    assert.equal(String(request.currentExecution), String(data.executions[1]._id));
    assert.equal(await AuditLog.countDocuments({ target: data.document._id, action: "review_decision" }), 1);
});

test("rejection terminates the request and cancels future execution atomically", async () => {
    const data = await fixture("reject");
    const document = await verifierService.reject(data.document._id, data.verifier._id, "Identity details do not match");
    assert.equal(document.reviewStatus, "rejected");
    const request = await VerificationRequest.findById(data.request._id).lean();
    const executions = await VerificationStepExecution.find({ verificationRequest: data.request._id }).sort({ stepOrder: 1 }).lean();
    assert.equal(request.status, "rejected");
    assert.equal(executions[0].status, "failed");
    assert.equal(executions[1].status, "cancelled");
});

test("an audit failure rolls back the review decision, execution, and request", async () => {
    const data = await fixture("rollback");
    const originalCreate = AuditLog.create;
    AuditLog.create = async () => { throw new Error("injected audit failure"); };
    try {
        await assert.rejects(verifierService.approve(data.document._id, data.verifier._id));
    } finally {
        AuditLog.create = originalCreate;
    }
    const document = await VerificationDocument.findById(data.document._id).lean();
    const execution = await VerificationStepExecution.findById(data.executions[0]._id).lean();
    const request = await VerificationRequest.findById(data.request._id).lean();
    assert.equal(document.reviewStatus, "pending");
    assert.equal(execution.status, "waiting_for_review");
    assert.equal(String(request.currentExecution), String(data.executions[0]._id));
});

test("a reasoned human override is idempotent and advances atomically without mutating automatic evidence", async () => {
    const data = await fixture("override-approve");
    const result = await createAutomaticResult(data);
    const first = await coordinator.overrideVerificationResult(result._id, data.verifier._id, {
        decision: "approved", reason: "Document and selfie evidence were manually confirmed.", idempotencyKey: "override-1"
    });
    const second = await coordinator.overrideVerificationResult(result._id, data.verifier._id, {
        decision: "approved", reason: "Document and selfie evidence were manually confirmed.", idempotencyKey: "override-1"
    });
    assert.equal(String(first._id), String(second._id));
    assert.equal((await VerificationResult.findById(result._id).lean()).automaticDecision, "manual_review");
    assert.equal((await VerificationDecision.countDocuments({ result: result._id })), 1);
    assert.equal((await VerificationStepExecution.findById(data.executions[0]._id).lean()).status, "completed");
    assert.equal(String((await VerificationRequest.findById(data.request._id).lean()).currentExecution), String(data.executions[1]._id));
    assert.equal(await AuditLog.countDocuments({ action: "decision_overridden", target: result._id }), 1);
});

test("role-specific request views expose a safe applicant summary and detailed verifier evidence", async () => {
    const data = await fixture("result-views");
    const result = await createAutomaticResult(data);
    await coordinator.overrideVerificationResult(result._id, data.verifier._id, {
        decision: "approved", reason: "The submitted evidence was confirmed during manual review.", idempotencyKey: "view-override-1"
    });

    const applicantView = await verificationRequestService.getVerificationRequestById(data.request._id, data.applicant._id);
    assert.deepEqual(applicantView.verificationSummary.reasonCodes, ["FACE_SIMILARITY_UNCERTAIN"]);
    assert.equal(applicantView.verificationSummary.automaticDecision, "manual_review");
    assert.equal(applicantView.verificationSummary.finalDecision, "approved");
    assert.equal(applicantView.verificationSummary.result, undefined);

    const verifierView = await verifierService.getVerificationRequest(data.request._id, data.verifier._id);
    assert.equal(verifierView.results.length, 1);
    assert.equal(verifierView.decisions.length, 1);
    assert.equal(verifierView.results[0].result.document.fields.panNumber.valueMasked, "ABCDE****F");
});

test("an opposite second override conflicts", async () => {
    const data = await fixture("override-conflict");
    const result = await createAutomaticResult(data);
    await coordinator.overrideVerificationResult(result._id, data.verifier._id, {
        decision: "approved", reason: "Manual inspection confirms the applicant.", idempotencyKey: "override-1"
    });
    await assert.rejects(coordinator.overrideVerificationResult(result._id, data.verifier._id, {
        decision: "rejected", reason: "A different operator conclusion was attempted.", idempotencyKey: "override-2"
    }), (error) => error.code === "DECISION_OVERRIDE_CONFLICT");
});

test("override audit failure rolls back the decision and workflow", async () => {
    const data = await fixture("override-rollback");
    const result = await createAutomaticResult(data);
    const originalCreate = AuditLog.create;
    AuditLog.create = async () => { throw new Error("injected override audit failure"); };
    try {
        await assert.rejects(coordinator.overrideVerificationResult(result._id, data.verifier._id, {
            decision: "approved", reason: "Manual inspection confirms the applicant.", idempotencyKey: "override-1"
        }));
    } finally {
        AuditLog.create = originalCreate;
    }
    assert.equal(await VerificationDecision.countDocuments({ result: result._id }), 0);
    assert.equal((await VerificationStepExecution.findById(data.executions[0]._id).lean()).status, "waiting_for_review");
    assert.equal(String((await VerificationRequest.findById(data.request._id).lean()).currentExecution), String(data.executions[0]._id));
});
