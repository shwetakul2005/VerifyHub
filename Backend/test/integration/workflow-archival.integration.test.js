const test = require("node:test");
const assert = require("node:assert/strict");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");
const Organization = require("../../src/models/organization.model");
const User = require("../../src/models/user.model");
const WorkflowTemplate = require("../../src/models/workflow-template.model");
const WorkflowStep = require("../../src/models/workflow-step.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");
const AuditLog = require("../../src/models/audit-log.model");
const workflowTemplateService = require("../../src/services/workflow-template.service");
const workflowStepService = require("../../src/services/workflow-step.service");
const verificationRequestService = require("../../src/services/verification-request.service");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function fixture(label, workflowStatus = "draft") {
    const [admin, applicant, verifier] = await User.create([
        { username: `Admin ${label}`, email: `admin-archive-${label}@example.com`, password: "test" },
        { username: `Applicant ${label}`, email: `applicant-archive-${label}@example.com`, password: "test" },
        { username: `Verifier ${label}`, email: `verifier-archive-${label}@example.com`, password: "test", role: "verifier" }
    ]);
    const organization = await Organization.create({
        name: `Archive ${label}`,
        slug: `archive-${label}`,
        admin: [admin._id],
        members: [{ user: verifier._id, role: "verifier" }]
    });
    const workflow = await WorkflowTemplate.create({
        organization: organization._id,
        name: `Workflow ${label}`,
        status: workflowStatus,
        version: 1,
        createdBy: admin._id,
        assignedVerifier: verifier._id,
        publishedAt: workflowStatus === "published" ? new Date() : null
    });
    workflow.familyId = workflow._id;
    await workflow.save();
    const step = await WorkflowStep.create({
        workflowTemplate: workflow._id,
        stepOrder: 1,
        stepType: "email",
        title: "Verify email"
    });
    return { admin, applicant, organization, workflow, step };
}

async function createReference(data, status = "completed") {
    const request = await VerificationRequest.create({
        organization: data.organization._id,
        workflowTemplate: data.workflow._id,
        workflowVersion: data.workflow._id,
        workflowSnapshot: {
            version: data.workflow.version,
            name: data.workflow.name,
            assignedVerifier: data.workflow.assignedVerifier,
            steps: [{
                workflowStep: data.step._id,
                stepOrder: data.step.stepOrder,
                stepType: data.step.stepType,
                title: data.step.title,
                isRequired: data.step.isRequired,
                maxRetries: data.step.maxRetries,
                config: data.step.config
            }]
        },
        applicant: data.applicant._id,
        status,
        schemaVersion: 2
    });
    const execution = await VerificationStepExecution.create({
        verificationRequest: request._id,
        workflowStep: data.step._id,
        stepOrder: 1,
        stepSnapshot: { stepType: "email", title: "Verify email", isRequired: true, maxRetries: 3 },
        status: status === "completed" ? "completed" : "pending",
        schemaVersion: 2
    });
    return { request, execution };
}

test("deleting a referenced workflow archives the version and steps while preserving history", async () => {
    const data = await fixture("workflow", "published");
    const { request } = await createReference(data);

    const archived = await workflowTemplateService.deleteWorkflowTemplate(data.workflow._id, data.admin._id);

    assert.equal(archived.status, "archived");
    assert.ok(archived.archivedAt);
    assert.equal(String(archived.archivedBy), String(data.admin._id));
    assert.ok(await WorkflowTemplate.findById(data.workflow._id));
    const archivedStep = await WorkflowStep.findById(data.step._id).lean();
    assert.ok(archivedStep.archivedAt);
    assert.ok(await VerificationRequest.findById(request._id));
    assert.equal((await workflowTemplateService.getWorkflowTemplates(data.organization._id, data.admin._id)).length, 0);
    await WorkflowStep.updateOne({ _id: data.step._id }, { $set: { title: "Mutated live history" } });
    const applicantFlow = await verificationRequestService.getApplicantWorkflowByRequestId(request._id, data.applicant._id);
    assert.equal(applicantFlow.workflowName, data.workflow.name);
    assert.equal(applicantFlow.steps.length, 1);
    assert.equal(applicantFlow.steps[0].title, data.step.title);
    assert.equal(await AuditLog.countDocuments({ action: "workflow_archived", target: data.workflow._id }), 1);
    assert.equal(await AuditLog.countDocuments({ action: "step_removed", target: data.step._id, "transition.command": "archive" }), 1);
});

test("deleting an unreferenced draft removes it and its unreferenced steps without orphans", async () => {
    const data = await fixture("draft");

    await workflowTemplateService.deleteWorkflowTemplate(data.workflow._id, data.admin._id);

    assert.equal(await WorkflowTemplate.exists({ _id: data.workflow._id }), null);
    assert.equal(await WorkflowStep.exists({ _id: data.step._id }), null);
});

test("deleting a referenced draft step archives it and active step queries omit it", async () => {
    const data = await fixture("step");
    await createReference(data);

    const archived = await workflowStepService.deleteWorkflowStep(data.step._id, data.admin._id);

    assert.ok(archived.archivedAt);
    assert.equal(archived.status, "inactive");
    assert.ok(await WorkflowStep.findById(data.step._id));
    assert.equal((await workflowStepService.getWorkflowSteps(data.workflow._id, data.admin._id)).length, 0);
    await assert.rejects(
        workflowStepService.updateWorkflowStep(data.step._id, { title: "Mutated history" }, data.admin._id),
        (error) => error.statusCode === 409
    );
});

test("terminal requests are archived idempotently, omitted from active lists, and remain addressable", async () => {
    const data = await fixture("request", "published");
    const { request } = await createReference(data);

    const first = await verificationRequestService.archiveVerificationRequest(request._id, data.admin._id, "Retention policy");
    const repeated = await verificationRequestService.archiveVerificationRequest(request._id, data.admin._id, "Retention policy");

    assert.ok(first.archivedAt);
    assert.equal(String(first.archivedAt), String(repeated.archivedAt));
    assert.equal((await verificationRequestService.getVerificationRequests(data.organization._id, data.admin._id)).length, 0);
    assert.equal(String((await verificationRequestService.getVerificationRequestById(request._id, data.admin._id))._id), String(request._id));
    assert.equal(await AuditLog.countDocuments({ action: "request_archived", target: request._id }), 1);
});

test("an active request must be cancelled or completed before archival", async () => {
    const data = await fixture("active", "published");
    const { request } = await createReference(data, "in_progress");

    await assert.rejects(
        verificationRequestService.archiveVerificationRequest(request._id, data.admin._id, "Cleanup"),
        (error) => error.statusCode === 409
    );
    assert.equal((await VerificationRequest.findById(request._id).lean()).archivedAt, null);
});
