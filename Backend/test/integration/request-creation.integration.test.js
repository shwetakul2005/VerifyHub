const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "request-creation-test-secret";
process.env.FRONTEND_URL = "http://localhost:5173";

const app = require("../../src/app");
const Organization = require("../../src/models/organization.model");
const User = require("../../src/models/user.model");
const WorkflowTemplate = require("../../src/models/workflow-template.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");
const AuditLog = require("../../src/models/audit-log.model");
const { installWorkflowIndexes } = require("../../src/migrations/workflow-migration");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function register(agent, name, email) {
    const response = await agent.post("/api/auth/register").send({
        username: name,
        email,
        password: "test-pass-123"
    });
    assert.equal(response.status, 201);
    return response.body.user.id;
}

async function fixture(label = "creation") {
    const adminAgent = request.agent(app);
    const verifierAgent = request.agent(app);
    const adminId = await register(adminAgent, `Admin ${label}`, `admin-${label}@example.com`);
    const verifierId = await register(verifierAgent, `Verifier ${label}`, `verifier-${label}@example.com`);
    const applicant = await User.create({
        username: `Applicant ${label}`,
        email: `applicant-${label}@example.com`,
        password: "unused-test-password"
    });
    const applicantId = applicant._id;
    await User.findByIdAndUpdate(verifierId, { role: "verifier" });

    const organizationResponse = await adminAgent.post("/api/organizations").send({ name: `Org ${label}` });
    assert.equal(organizationResponse.status, 201);
    const organizationId = organizationResponse.body.organization._id;
    await Organization.findByIdAndUpdate(organizationId, {
        $push: { members: { user: verifierId, role: "verifier" } }
    });
    const workflowResponse = await adminAgent.post("/api/workflows").send({
        organization: organizationId,
        name: "Identity verification",
        assignedVerifier: verifierId
    });
    assert.equal(workflowResponse.status, 201);
    const workflowId = workflowResponse.body.workflowTemplate._id;
    const first = await adminAgent.post("/api/workflow-step").send({
        workflowTemplate: workflowId,
        stepOrder: 1,
        stepType: "email",
        title: "Verify email"
    });
    const second = await adminAgent.post("/api/workflow-step").send({
        workflowTemplate: workflowId,
        stepOrder: 2,
        stepType: "document",
        title: "Upload PAN",
        config: { documentType: "PAN" },
        maxRetries: 2
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    return { adminAgent, adminId, applicantId, organizationId, workflowId, firstStepId: first.body.workflowStep._id };
}

function createRequest({ adminAgent, organizationId, workflowId, applicantId }) {
    return adminAgent.post("/api/verification-requests").send({
        organization: organizationId,
        workflowTemplate: workflowId,
        applicant: applicantId
    });
}

test("request creation snapshots a published version and its pending executions atomically", async () => {
    const data = await fixture("snapshot");
    const draftAttempt = await createRequest(data);
    assert.equal(draftAttempt.status, 409);
    assert.equal(await VerificationRequest.countDocuments(), 0);

    const publication = await data.adminAgent.post(`/api/workflows/${data.workflowId}/publish`);
    assert.equal(publication.status, 200);
    await installWorkflowIndexes();

    const response = await createRequest(data);
    assert.equal(response.status, 201);
    const created = await VerificationRequest.findById(response.body.verificationRequest._id).lean();
    assert.equal(created.status, "pending");
    assert.equal(created.startedAt, null);
    assert.equal(String(created.workflowVersion), data.workflowId);
    assert.equal(String(created.currentStep), data.firstStepId);
    assert.equal(created.currentExecution, null);
    assert.deepEqual(created.workflowSnapshot.steps.map((step) => step.stepOrder), [1, 2]);
    assert.equal(created.workflowSnapshot.steps[1].config.documentType, "PAN");
    assert.equal(created.workflowSnapshot.steps[1].maxRetries, 2);

    const executions = await VerificationStepExecution.find({ verificationRequest: created._id }).sort({ stepOrder: 1 }).lean();
    assert.equal(executions.length, 2);
    assert.deepEqual(executions.map((execution) => execution.status), ["pending", "pending"]);
    assert.equal(new Set(executions.map((execution) => String(execution.workflowStep))).size, 2);
    assert.equal(executions[1].maxRetries, 2);
    await assert.rejects(
        VerificationStepExecution.create({
            verificationRequest: created._id,
            workflowStep: executions[0].workflowStep,
            status: "pending"
        }),
        { code: 11000 }
    );
    const events = await AuditLog.find({ target: created._id, action: "request_created" }).lean();
    assert.equal(events.length, 1);
    assert.equal(String(events[0].actor), data.adminId);
});

test("request creation refuses to run without the unique execution index", async () => {
    const data = await fixture("index");
    await data.adminAgent.post(`/api/workflows/${data.workflowId}/publish`);
    await VerificationStepExecution.collection.dropIndex("unique_request_step_execution");
    const response = await createRequest(data);
    assert.equal(response.status, 503);
    assert.equal(await VerificationRequest.countDocuments(), 0);
});

test("a missing applicant remains a client error without creating records", async () => {
    const data = await fixture("missing-applicant");
    await data.adminAgent.post(`/api/workflows/${data.workflowId}/publish`);
    await installWorkflowIndexes();
    const response = await createRequest({ ...data, applicantId: "000000000000000000000000" });
    assert.equal(response.status, 400);
    assert.equal(await VerificationRequest.countDocuments(), 0);
});

test("an audit write failure rolls back the request and every execution", async () => {
    const data = await fixture("rollback");
    await data.adminAgent.post(`/api/workflows/${data.workflowId}/publish`);
    await installWorkflowIndexes();
    const originalCreate = AuditLog.create;
    AuditLog.create = async () => { throw new Error("injected audit failure"); };
    try {
        const response = await createRequest(data);
        assert.equal(response.status, 500);
        assert.doesNotMatch(response.body.message, /injected audit failure/);
    } finally {
        AuditLog.create = originalCreate;
    }
    assert.equal(await VerificationRequest.countDocuments(), 0);
    assert.equal(await VerificationStepExecution.countDocuments(), 0);
});
