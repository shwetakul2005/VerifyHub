const test = require("node:test");
const assert = require("node:assert/strict");
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
const User = require("../../src/models/user.model");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function registerUser(username, email) {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/register").send({
        username,
        email,
        password: "test-pass-123"
    });

    assert.equal(response.status, 201);
    return { agent, id: response.body.user.id };
}

async function createOrganization(agent, name) {
    const response = await agent.post("/api/organizations").send({ name });
    assert.equal(response.status, 201);
    return response.body.organization;
}

test("tenant resources and verification requests cannot be read across access boundaries", async () => {
    const adminA = await registerUser("Admin A", "admin.a@example.com");
    const adminB = await registerUser("Admin B", "admin.b@example.com");
    const verifierA = await registerUser("Verifier A", "verifier.a@example.com");
    const verifierB = await registerUser("Verifier B", "verifier.b@example.com");
    const applicant = await registerUser("Applicant", "applicant@example.com");
    const outsider = await registerUser("Outsider", "outsider@example.com");

    await User.updateMany(
        { _id: { $in: [verifierA.id, verifierB.id] } },
        { $set: { role: "verifier" } }
    );

    const organizationA = await createOrganization(adminA.agent, "Tenant Alpha");
    const organizationB = await createOrganization(adminB.agent, "Tenant Beta");

    await Organization.findByIdAndUpdate(organizationA._id, {
        $push: { members: { user: verifierA.id, role: "verifier" } }
    });
    await Organization.findByIdAndUpdate(organizationB._id, {
        $push: { members: { user: verifierB.id, role: "verifier" } }
    });

    const forbiddenOrganization = await adminB.agent.get(
        `/api/organizations/${organizationA._id}`
    );
    assert.equal(forbiddenOrganization.status, 403);

    const workflowResponse = await adminA.agent.post("/api/workflows").send({
        name: "Identity verification",
        organization: organizationA._id,
        description: "Verify an applicant's identity.",
        assignedVerifier: verifierA.id
    });
    assert.equal(workflowResponse.status, 201);
    const workflow = workflowResponse.body.workflowTemplate;

    const forbiddenWorkflow = await adminB.agent.get(`/api/workflows/${workflow._id}`);
    assert.equal(forbiddenWorkflow.status, 403);

    const stepResponse = await adminA.agent.post("/api/workflow-step").send({
        workflowTemplate: workflow._id,
        stepOrder: 1,
        stepType: "document",
        title: "Upload identity document",
        status: "active"
    });
    assert.equal(stepResponse.status, 201);

    const verificationResponse = await adminA.agent
        .post("/api/verification-requests")
        .send({
            organization: organizationA._id,
            workflowTemplate: workflow._id,
            applicant: applicant.id
        });
    assert.equal(verificationResponse.status, 201);
    const verificationRequest = verificationResponse.body.verificationRequest;

    const applicantRead = await applicant.agent.get(
        `/api/verification-requests/${verificationRequest._id}`
    );
    assert.equal(applicantRead.status, 200);

    const outsiderRead = await outsider.agent.get(
        `/api/verification-requests/${verificationRequest._id}`
    );
    assert.equal(outsiderRead.status, 403);

    const otherTenantAdminRead = await adminB.agent.get(
        `/api/verification-requests/${verificationRequest._id}`
    );
    assert.equal(otherTenantAdminRead.status, 403);

    const assignedVerifierRead = await verifierA.agent.get(
        `/api/verifier/request/${verificationRequest._id}`
    );
    assert.equal(assignedVerifierRead.status, 200);

    const unassignedVerifierRead = await verifierB.agent.get(
        `/api/verifier/request/${verificationRequest._id}`
    );
    assert.equal(unassignedVerifierRead.status, 403);
});

test("invalid payloads and unknown API routes return structured client errors", async () => {
    const invalidRegistration = await request(app).post("/api/auth/register").send({
        username: "A",
        email: "not-an-email",
        password: "short"
    });

    assert.equal(invalidRegistration.status, 400);
    assert.equal(invalidRegistration.body.success, false);
    assert.equal(invalidRegistration.body.message, "Request validation failed.");
    assert.ok(Array.isArray(invalidRegistration.body.errors));

    const missingRoute = await request(app).get("/api/does-not-exist");
    assert.equal(missingRoute.status, 404);
    assert.deepEqual(missingRoute.body, {
        success: false,
        message: "Route not found."
    });
});
