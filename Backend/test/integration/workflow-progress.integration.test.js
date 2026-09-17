const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");

const {
    startDatabase,
    clearDatabase,
    stopDatabase
} = require("./database.helper");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-secret";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.GOOGLE_CLIENT_ID = "integration-test-client";
process.env.GOOGLE_CLIENT_SECRET = "integration-test-secret";
process.env.GOOGLE_REFRESH_TOKEN = "integration-test-refresh";
process.env.GOOGLE_USER = "integration@example.com";

const app = require("../../src/app");
const Organization = require("../../src/models/organization.model");
const WorkflowTemplate = require("../../src/models/workflow-template.model");
const WorkflowStep = require("../../src/models/workflow-step.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function registerApplicant(sequence) {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/register").send({
        username: `Progress User ${sequence}`,
        email: `progress.${sequence}@example.com`,
        password: "test-pass-123"
    });

    assert.equal(response.status, 201);
    return { agent, id: response.body.user.id };
}

async function createWorkflowFixture(sequence, actorId, stepCount = 1) {
    const organization = await Organization.create({
        name: `Progress Organization ${sequence}`,
        slug: `progress-organization-${sequence}`,
        admin: [actorId]
    });
    const workflow = await WorkflowTemplate.create({
        organization: organization._id,
        name: `Progress Workflow ${sequence}`,
        createdBy: actorId,
        assignedVerifier: actorId
    });
    const steps = await WorkflowStep.create(
        Array.from({ length: stepCount }, (_, index) => ({
            workflowTemplate: workflow._id,
            stepOrder: index + 1,
            stepType: "email",
            title: `Step ${index + 1}`,
            status: "active"
        }))
    );

    return { organization, workflow, steps };
}

test("workflow-step GET accepts an empty request body", async () => {
    const actor = await registerApplicant("step-get");
    const { steps } = await createWorkflowFixture("step-get", actor.id);

    const response = await actor.agent.get(`/api/workflow-step/${steps[0]._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.workflowStep._id, steps[0]._id.toString());
});

test("workflow-step PATCH rejects an empty update body", async () => {
    const actor = await registerApplicant("step-patch");
    const { steps } = await createWorkflowFixture("step-patch", actor.id);

    const response = await actor.agent
        .patch(`/api/workflow-step/${steps[0]._id}`)
        .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Request validation failed.");
});

test("progress uses execution states when the request has no current step", async () => {
    const actor = await registerApplicant("execution-state");
    const { organization, workflow, steps } = await createWorkflowFixture(
        "execution-state",
        actor.id,
        3
    );
    const verificationRequest = await VerificationRequest.create({
        organization: organization._id,
        workflowTemplate: workflow._id,
        applicant: actor.id,
        status: "in_progress",
        currentStep: null,
        startedAt: new Date()
    });

    await VerificationStepExecution.create([
        {
            verificationRequest: verificationRequest._id,
            workflowStep: steps[0]._id,
            status: "completed",
            completedAt: new Date()
        },
        {
            verificationRequest: verificationRequest._id,
            workflowStep: steps[1]._id,
            status: "failed",
            completedAt: new Date()
        },
        {
            verificationRequest: verificationRequest._id,
            status: "completed",
            completedAt: new Date()
        }
    ]);

    const response = await actor.agent.get(
        `/api/verification-requests/progress/${verificationRequest._id}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result.currentStep, null);
    assert.deepEqual(
        response.body.result.progress.map((step) => step.status),
        ["completed", "failed", "pending"]
    );
});

test("progress returns 404 when the referenced workflow no longer exists", async () => {
    const actor = await registerApplicant("missing-workflow");
    const organization = await Organization.create({
        name: "Missing Workflow Organization",
        slug: "missing-workflow-organization",
        admin: [actor.id]
    });
    const verificationRequest = await VerificationRequest.create({
        organization: organization._id,
        workflowTemplate: new mongoose.Types.ObjectId(),
        applicant: actor.id,
        status: "pending",
        currentStep: null
    });

    const response = await actor.agent.get(
        `/api/verification-requests/progress/${verificationRequest._id}`
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "Workflow template not found.");
});
