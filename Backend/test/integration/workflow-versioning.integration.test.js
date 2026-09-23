const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "workflow-versioning-secret";
process.env.FRONTEND_URL = "http://localhost:5173";

const app = require("../../src/app");
const Organization = require("../../src/models/organization.model");
const User = require("../../src/models/user.model");
const WorkflowTemplate = require("../../src/models/workflow-template.model");
const WorkflowStep = require("../../src/models/workflow-step.model");
const AuditLog = require("../../src/models/audit-log.model");
const { installWorkflowIndexes } = require("../../src/migrations/workflow-migration");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function register(agent, username, email) {
    const response = await agent.post("/api/auth/register").send({
        username,
        email,
        password: "test-pass-123"
    });
    assert.equal(response.status, 201);
    return response.body.user.id;
}

async function createDraftFixture(sequence) {
    const adminAgent = request.agent(app);
    const adminId = await register(adminAgent, `Admin ${sequence}`, `admin-${sequence}@example.com`);
    const verifier = await User.create({
        username: `Verifier ${sequence}`,
        email: `verifier-${sequence}@example.com`,
        password: "test-pass-123",
        role: "verifier"
    });
    const verifierId = verifier._id.toString();

    const organizationResponse = await adminAgent.post("/api/organizations").send({
        name: `Versioning ${sequence}`
    });
    assert.equal(organizationResponse.status, 201);
    const organization = organizationResponse.body.organization;
    await Organization.findByIdAndUpdate(organization._id, {
        $push: { members: { user: verifierId, role: "verifier" } }
    });

    const workflowResponse = await adminAgent.post("/api/workflows").send({
        organization: organization._id,
        name: "Identity verification",
        description: "Original description",
        assignedVerifier: verifierId
    });
    assert.equal(workflowResponse.status, 201);

    return {
        adminAgent,
        adminId,
        verifierId,
        organization,
        workflow: workflowResponse.body.workflowTemplate
    };
}

async function addStep(agent, workflowId, overrides = {}) {
    return agent.post("/api/workflow-step").send({
        workflowTemplate: workflowId,
        stepOrder: 1,
        stepType: "email",
        title: "Verify email",
        ...overrides
    });
}

test("publishing validates the workflow and makes its template and steps immutable", async () => {
    const fixture = await createDraftFixture("publish");
    assert.equal(await AuditLog.countDocuments({ target: fixture.workflow._id, action: "workflow_created" }), 1);
    const stepResponse = await addStep(fixture.adminAgent, fixture.workflow._id);
    assert.equal(stepResponse.status, 201);
    assert.equal(await AuditLog.countDocuments({ target: stepResponse.body.workflowStep._id, action: "step_added" }), 1);

    const publish = await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/publish`);
    assert.equal(publish.status, 200);
    assert.equal(publish.body.workflowTemplate.status, "published");
    assert.equal(String(publish.body.workflowTemplate.publishedBy), fixture.adminId);
    const publicationEvent = await AuditLog.findOne({ target: fixture.workflow._id, action: "workflow_published" }).lean();
    assert.equal(String(publicationEvent.organization), fixture.organization._id);
    assert.equal(String(publicationEvent.actor), fixture.adminId);
    assert.deepEqual(
        {
            fromState: publicationEvent.transition.fromState,
            toState: publicationEvent.transition.toState,
            command: publicationEvent.transition.command
        },
        { fromState: "draft", toState: "published", command: "publish" }
    );

    const templateEdit = await fixture.adminAgent
        .patch(`/api/workflows/${fixture.workflow._id}`)
        .send({ description: "Mutated" });
    const stepEdit = await fixture.adminAgent
        .patch(`/api/workflow-step/${stepResponse.body.workflowStep._id}`)
        .send({ title: "Mutated" });
    const addedStep = await addStep(fixture.adminAgent, fixture.workflow._id, {
        stepOrder: 2,
        title: "Another step"
    });

    assert.equal(templateEdit.status, 409);
    assert.equal(stepEdit.status, 409);
    assert.equal(addedStep.status, 409);
    const repeated = await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/publish`);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.workflowTemplate.publishedAt, publish.body.workflowTemplate.publishedAt);
    assert.equal(await AuditLog.countDocuments({ target: fixture.workflow._id, action: "workflow_published" }), 1);
    const legacyStatusEdit = await fixture.adminAgent
        .patch(`/api/workflows/${fixture.workflow._id}`)
        .send({ status: "draft" });
    assert.equal(legacyStatusEdit.status, 400);
});

test("publication rejects empty and unsupported workflow definitions", async () => {
    const empty = await createDraftFixture("empty");
    const emptyPublish = await empty.adminAgent.post(`/api/workflows/${empty.workflow._id}/publish`);
    assert.equal(emptyPublish.status, 409);
    assert.equal(await AuditLog.countDocuments({ target: empty.workflow._id, action: "workflow_published" }), 0);

    await WorkflowStep.create({
        workflowTemplate: empty.workflow._id,
        stepOrder: 1,
        stepType: "phone",
        title: "Phone placeholder"
    });
    const unsupportedPublish = await empty.adminAgent.post(
        `/api/workflows/${empty.workflow._id}/publish`
    );
    assert.equal(unsupportedPublish.status, 409);
    assert.match(unsupportedPublish.body.message, /unsupported/i);
});

test("publication rejects document steps without a supported document configuration", async () => {
    const fixture = await createDraftFixture("document-config");
    const created = await addStep(fixture.adminAgent, fixture.workflow._id, {
        stepType: "document",
        title: "Identity document"
    });
    assert.equal(created.status, 201);

    const publish = await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/publish`);
    assert.equal(publish.status, 409);
    assert.match(publish.body.message, /aadhaar or pan/i);
});

test("an audit failure rolls back workflow publication", async () => {
    const fixture = await createDraftFixture("audit-rollback");
    await addStep(fixture.adminAgent, fixture.workflow._id);
    const originalCreate = AuditLog.create;
    AuditLog.create = async (events, options) => {
        if (events[0]?.action === "workflow_published") throw new Error("injected audit failure");
        return originalCreate.call(AuditLog, events, options);
    };
    try {
        const response = await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/publish`);
        assert.equal(response.status >= 400, true);
    } finally {
        AuditLog.create = originalCreate;
    }
    const stored = await WorkflowTemplate.findById(fixture.workflow._id).lean();
    assert.equal(stored.status, "draft");
    assert.equal(await AuditLog.countDocuments({ target: fixture.workflow._id, action: "workflow_published" }), 0);
});

test("creating a version clones a published workflow into an editable draft", async () => {
    const fixture = await createDraftFixture("clone");
    const step = await addStep(fixture.adminAgent, fixture.workflow._id);
    await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/publish`);
    const beforeIndexes = await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/versions`);
    assert.equal(beforeIndexes.status, 503);
    await installWorkflowIndexes();

    const response = await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/versions`);
    assert.equal(response.status, 201);
    const next = response.body.workflowTemplate;
    assert.equal(next.status, "draft");
    assert.equal(next.version, 2);
    assert.equal(String(next.previousVersion), fixture.workflow._id);
    assert.equal(String(next.familyId), fixture.workflow._id);
    assert.equal(await AuditLog.countDocuments({ target: next._id, action: "workflow_version_created" }), 1);

    const clonedSteps = await WorkflowStep.find({ workflowTemplate: next._id }).lean();
    assert.equal(clonedSteps.length, 1);
    assert.equal(clonedSteps[0].title, step.body.workflowStep.title);

    const edit = await fixture.adminAgent
        .patch(`/api/workflows/${next._id}`)
        .send({ description: "Version two description" });
    assert.equal(edit.status, 200);
    assert.equal(await AuditLog.countDocuments({ target: next._id, action: "workflow_updated" }), 1);
    const clonedStep = clonedSteps[0];
    const stepEdit = await fixture.adminAgent
        .patch(`/api/workflow-step/${clonedStep._id}`)
        .send({ title: "Version two email" });
    assert.equal(stepEdit.status, 200);
    assert.equal(await AuditLog.countDocuments({ target: clonedStep._id, action: "step_updated" }), 1);
    const original = await WorkflowTemplate.findById(fixture.workflow._id).lean();
    assert.equal(original.description, "Original description");

    const auditPayload = JSON.stringify(await AuditLog.find({ organization: fixture.organization._id }).lean());
    assert.equal(auditPayload.includes("Version two description"), false);
    assert.equal(auditPayload.includes("Version two email"), false);
});

test("concurrent version creation never stores duplicate family version numbers", async () => {
    const fixture = await createDraftFixture("concurrent");
    await addStep(fixture.adminAgent, fixture.workflow._id);
    await fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/publish`);
    await installWorkflowIndexes();

    const responses = await Promise.all([
        fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/versions`),
        fixture.adminAgent.post(`/api/workflows/${fixture.workflow._id}/versions`)
    ]);
    assert.equal(responses.some((response) => response.status === 201), true);
    assert.equal(responses.every((response) => [201, 409].includes(response.status)), true);

    const versions = await WorkflowTemplate.find({
        organization: fixture.organization._id,
        familyId: fixture.workflow._id
    }).sort({ version: 1 }).lean();
    assert.equal(versions.length >= 2, true);
    assert.equal(new Set(versions.map((workflow) => workflow.version)).size, versions.length);
    assert.equal(
        await AuditLog.countDocuments({ action: "workflow_version_created", organization: fixture.organization._id }),
        responses.filter((response) => response.status === 201).length
    );
});
