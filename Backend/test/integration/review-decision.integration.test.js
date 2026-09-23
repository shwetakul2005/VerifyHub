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
    return { verifier, request, executions, document };
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
