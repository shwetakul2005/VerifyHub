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
const coordinator = require("../../src/services/workflow-engine.service");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

async function createFixture(label) {
    const [admin, applicant, verifier] = await User.create([
        { username: `Admin ${label}`, email: `admin-${label}@example.com`, password: "test" },
        { username: `Applicant ${label}`, email: `applicant-${label}@example.com`, password: "test" },
        { username: `Verifier ${label}`, email: `verifier-${label}@example.com`, password: "test", role: "verifier" }
    ]);
    const organization = await Organization.create({
        name: `Coordinator ${label}`,
        slug: `coordinator-${label}`,
        admin: [admin._id],
        members: [
            { user: admin._id, role: "org_admin" },
            { user: verifier._id, role: "verifier" }
        ]
    });
    const workflow = await WorkflowTemplate.create({
        organization: organization._id,
        name: "Sequential workflow",
        status: "published",
        familyId: null,
        version: 1,
        createdBy: admin._id,
        assignedVerifier: verifier._id,
        publishedAt: new Date(),
        publishedBy: admin._id,
        schemaVersion: 2
    });
    workflow.familyId = workflow._id;
    await workflow.save();
    const steps = await WorkflowStep.create([
        { workflowTemplate: workflow._id, stepOrder: 1, stepType: "email", title: "Email" },
        { workflowTemplate: workflow._id, stepOrder: 2, stepType: "document", title: "Document", config: { documentType: "PAN" } }
    ]);
    const request = await VerificationRequest.create({
        organization: organization._id,
        workflowTemplate: workflow._id,
        workflowVersion: workflow._id,
        applicant: applicant._id,
        status: "pending",
        currentStep: steps[0]._id,
        workflowSnapshot: {
            version: 1,
            name: workflow.name,
            assignedVerifier: verifier._id,
            steps: steps.map((step) => ({
                workflowStep: step._id,
                stepOrder: step.stepOrder,
                stepType: step.stepType,
                title: step.title,
                isRequired: true,
                maxRetries: 3,
                config: step.config
            }))
        },
        schemaVersion: 2
    });
    const executions = await VerificationStepExecution.create(steps.map((step) => ({
        verificationRequest: request._id,
        workflowStep: step._id,
        stepOrder: step.stepOrder,
        stepSnapshot: { stepType: step.stepType, title: step.title, isRequired: true, maxRetries: 3, config: step.config },
        status: "pending",
        schemaVersion: 2
    })));
    return { admin, request, executions };
}

test("simultaneous starts are idempotent and select exactly the first execution", async () => {
    const { admin, request, executions } = await createFixture("start");
    const results = await Promise.all([
        coordinator.startVerification(request._id, admin._id),
        coordinator.startVerification(request._id, admin._id)
    ]);
    assert.equal(results.every((result) => result.status === "in_progress"), true);
    const stored = await VerificationRequest.findById(request._id).lean();
    assert.equal(String(stored.currentExecution), String(executions[0]._id));
    assert.notEqual(stored.startedAt, null);
    assert.equal(stored.stateVersion, 1);
    assert.equal(await AuditLog.countDocuments({ target: request._id, action: "request_transition" }), 1);
});

test("only one caller claims the current execution and an early step cannot run", async () => {
    const { admin, request, executions } = await createFixture("claim");
    await coordinator.startVerification(request._id, admin._id);
    await assert.rejects(
        coordinator.claimExecution(request._id, executions[1]._id, admin._id),
        (error) => error.statusCode === 409
    );
    const claims = await Promise.all([
        coordinator.claimExecution(request._id, executions[0]._id, admin._id),
        coordinator.claimExecution(request._id, executions[0]._id, admin._id)
    ]);
    assert.equal(claims.filter((claim) => claim.claimed).length, 1);
    assert.equal(claims.filter((claim) => !claim.claimed).length, 1);
    assert.equal(await AuditLog.countDocuments({ target: executions[0]._id, action: "execution_transition" }), 1);
});

test("an expired processing lease can be reclaimed with a new token", async () => {
    const { admin, request, executions } = await createFixture("lease");
    await coordinator.startVerification(request._id, admin._id);
    await VerificationStepExecution.findByIdAndUpdate(executions[0]._id, {
        $set: {
            status: "processing",
            processingToken: "expired-token",
            leaseExpiresAt: new Date(Date.now() - 1000)
        }
    });
    const reclaimed = await coordinator.claimExecution(request._id, executions[0]._id, admin._id);
    assert.equal(reclaimed.claimed, true);
    assert.notEqual(reclaimed.execution.processingToken, "expired-token");
    assert.equal(reclaimed.execution.status, "processing");
});

test("finalization advances strictly in order, is repeatable, and completes only after the last step", async () => {
    const { admin, request, executions } = await createFixture("finalize");
    await coordinator.startVerification(request._id, admin._id);
    const firstClaim = await coordinator.claimExecution(request._id, executions[0]._id, admin._id);
    const first = await coordinator.finalizeExecution({
        requestId: request._id,
        executionId: executions[0]._id,
        processingToken: firstClaim.execution.processingToken,
        outcome: { status: "completed", metadata: { verified: true } }
    });
    assert.equal(first.request.status, "in_progress");
    assert.equal(String(first.request.currentExecution), String(executions[1]._id));
    const repeated = await coordinator.finalizeExecution({
        requestId: request._id,
        executionId: executions[0]._id,
        processingToken: firstClaim.execution.processingToken,
        outcome: { status: "completed", metadata: { verified: true } }
    });
    assert.equal(repeated.idempotent, true);

    const secondClaim = await coordinator.claimExecution(request._id, executions[1]._id, admin._id);
    const completed = await coordinator.finalizeExecution({
        requestId: request._id,
        executionId: executions[1]._id,
        processingToken: secondClaim.execution.processingToken,
        outcome: { status: "completed" }
    });
    assert.equal(completed.request.status, "completed");
    assert.equal(completed.request.currentExecution, null);
    assert.equal(completed.request.currentStep, null);
    await assert.rejects(
        coordinator.startVerification(request._id, admin._id),
        (error) => error.statusCode === 409
    );
});

test("execute calls one outcome adapter outside the claim transaction and finalizes its result", async () => {
    const { admin, request, executions } = await createFixture("adapter");
    await coordinator.startVerification(request._id, admin._id);
    let calls = 0;
    const adapter = {
        async execute(context) {
            calls += 1;
            assert.equal(String(context.execution._id), String(executions[0]._id));
            return { status: "waiting_for_input", metadata: { delivery: "sent" }, message: "Waiting" };
        }
    };
    const results = await Promise.all([
        coordinator.executeCurrentStep(request._id, admin._id, { adapters: { email: adapter } }),
        coordinator.executeCurrentStep(request._id, admin._id, { adapters: { email: adapter } })
    ]);
    assert.equal(calls, 1);
    assert.equal(results.filter((result) => result.claimed === false).length, 1);
    const stored = await VerificationStepExecution.findById(executions[0]._id).lean();
    assert.equal(stored.status, "waiting_for_input");
    assert.equal(stored.metadata.delivery, "sent");
});

test("an adapter failure becomes a retryable failed execution without advancing", async () => {
    const { admin, request, executions } = await createFixture("adapter-failure");
    await coordinator.startVerification(request._id, admin._id);
    const adapter = { async execute() { throw new Error("provider unavailable"); } };
    await assert.rejects(
        coordinator.executeCurrentStep(request._id, admin._id, { adapters: { email: adapter } }),
        (error) => error.statusCode === 502
    );
    const storedRequest = await VerificationRequest.findById(request._id).lean();
    const storedExecution = await VerificationStepExecution.findById(executions[0]._id).lean();
    assert.equal(String(storedRequest.currentExecution), String(executions[0]._id));
    assert.equal(storedExecution.status, "failed");
    assert.equal(storedExecution.lastError.retryable, true);
});
