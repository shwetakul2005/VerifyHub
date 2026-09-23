const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");
const WorkflowTemplate = require("../../src/models/workflow-template.model");
const WorkflowStep = require("../../src/models/workflow-step.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");
const {
    planWorkflowMigration,
    applyWorkflowMigration,
    verifyWorkflowMigration,
    installWorkflowIndexes
} = require("../../src/migrations/workflow-migration");

const id = () => new mongoose.Types.ObjectId();

test.before(startDatabase);
test.beforeEach(clearDatabase);
test.after(stopDatabase);

async function createWorkflow(status = "published") {
    const workflow = await WorkflowTemplate.create({
        organization: id(), name: "Identity", status, createdBy: id(), assignedVerifier: id()
    });
    const email = await WorkflowStep.create({
        workflowTemplate: workflow._id, stepOrder: 1, stepType: "email", title: "Email"
    });
    const document = await WorkflowStep.create({
        workflowTemplate: workflow._id, stepOrder: 2, stepType: "document", title: "Document"
    });
    return { workflow, email, document };
}

async function createRequest(workflow, currentStep, status = "pending") {
    return VerificationRequest.create({
        organization: workflow.organization,
        workflowTemplate: workflow._id,
        applicant: id(),
        status,
        currentStep,
        startedAt: status === "pending" ? new Date() : null
    });
}

test("preflight reports draft references and duplicate step orders without writing", async () => {
    const { workflow, email } = await createWorkflow("draft");
    await WorkflowStep.create({
        workflowTemplate: workflow._id, stepOrder: 1, stepType: "document", title: "Duplicate order"
    });
    const request = await createRequest(workflow, email._id);
    const before = await VerificationRequest.collection.findOne({ _id: request._id });

    const report = await planWorkflowMigration();

    assert.equal(report.violations.some((violation) => violation.code === "DUPLICATE_STEP_ORDER"), true);
    assert.equal(report.violations.some((violation) => violation.code === "DRAFT_WORKFLOW_REFERENCE"), true);
    const unchanged = await VerificationRequest.collection.findOne({ _id: request._id });
    assert.deepEqual(unchanged, before);
});

test("migration backfills version snapshots and one execution per step, and is repeatable", async () => {
    const { workflow, email, document } = await createWorkflow();
    const request = await createRequest(workflow, email._id);

    const dryRun = await applyWorkflowMigration({ dryRun: true });
    assert.equal(dryRun.violations.length, 0);
    assert.equal(await VerificationStepExecution.countDocuments({ verificationRequest: request._id }), 0);

    await applyWorkflowMigration({ dryRun: false });
    await applyWorkflowMigration({ dryRun: false });

    const migratedWorkflow = await WorkflowTemplate.findById(workflow._id).lean();
    const migratedRequest = await VerificationRequest.findById(request._id).lean();
    const executions = await VerificationStepExecution.find({ verificationRequest: request._id })
        .sort({ stepOrder: 1 }).lean();

    assert.equal(String(migratedWorkflow.familyId), String(workflow._id));
    assert.equal(String(migratedRequest.workflowVersion), String(workflow._id));
    assert.deepEqual(migratedRequest.workflowSnapshot.steps.map((step) => String(step.workflowStep)), [
        String(email._id), String(document._id)
    ]);
    assert.equal(migratedRequest.startedAt, null);
    assert.equal(executions.length, 2);
    assert.deepEqual(executions.map((execution) => execution.status), ["pending", "pending"]);
    assert.equal(String(migratedRequest.currentExecution), String(executions[0]._id));
    assert.equal((await verifyWorkflowMigration()).violations.length, 0);
});

test("ambiguous active face execution blocks migration without partial writes", async () => {
    const { workflow, email } = await createWorkflow();
    const request = await createRequest(workflow, email._id, "in_progress");
    const face = await WorkflowStep.create({
        workflowTemplate: workflow._id, stepOrder: 3,
        stepType: "face_verification", title: "Face"
    });
    await VerificationRequest.updateOne({ _id: request._id }, { $set: { currentStep: face._id } });
    await VerificationStepExecution.create({
        verificationRequest: request._id,
        workflowStep: face._id,
        status: "in_progress",
        metadata: { documentFilePath: "document.jpg", liveFilePath: "live.jpg" }
    });
    const before = await VerificationRequest.collection.findOne({ _id: request._id });

    const report = await planWorkflowMigration();
    assert.equal(report.violations.some((violation) => violation.code === "AMBIGUOUS_EXECUTION_STATE"), true);
    await assert.rejects(applyWorkflowMigration({ dryRun: false }), /preflight/i);
    const unchanged = await VerificationRequest.collection.findOne({ _id: request._id });
    assert.deepEqual(unchanged, before);
});

test("duplicate workflow family versions block unique index installation", async () => {
    const organization = id();
    const familyId = id();
    const shared = {
        organization,
        familyId,
        version: 2,
        status: "published",
        createdBy: id(),
        assignedVerifier: id()
    };
    await WorkflowTemplate.create({ ...shared, name: "Duplicate A" });
    await WorkflowTemplate.create({ ...shared, name: "Duplicate B" });

    const report = await planWorkflowMigration();

    assert.equal(
        report.violations.some((violation) => violation.code === "DUPLICATE_WORKFLOW_VERSION"),
        true
    );
    await assert.rejects(installWorkflowIndexes(), /integrity violations/i);
});

test("safe duplicate pending executions are archived before unique index installation", async () => {
    const { workflow, email } = await createWorkflow();
    const request = await createRequest(workflow, email._id);
    const first = await VerificationStepExecution.create({
        verificationRequest: request._id, workflowStep: email._id, status: "pending"
    });
    const second = await VerificationStepExecution.create({
        verificationRequest: request._id, workflowStep: email._id, status: "pending"
    });

    const report = await planWorkflowMigration();
    assert.equal(report.safeDuplicateGroups.length, 1);
    assert.equal(report.violations.length, 0);

    await applyWorkflowMigration({ dryRun: false });
    await installWorkflowIndexes();

    const [workflowIndexes, stepIndexes, executionIndexes] = await Promise.all([
        WorkflowTemplate.collection.listIndexes().toArray(),
        WorkflowStep.collection.listIndexes().toArray(),
        VerificationStepExecution.collection.listIndexes().toArray()
    ]);
    assert.equal(workflowIndexes.some((index) => index.name === "unique_workflow_family_version" && index.unique), true);
    assert.equal(stepIndexes.some((index) => index.name === "unique_workflow_step_order" && index.unique), true);
    assert.equal(executionIndexes.some((index) => index.name === "unique_request_step_execution" && index.unique), true);

    const executions = await VerificationStepExecution.find({
        verificationRequest: request._id, workflowStep: email._id
    }).lean();
    const archived = await mongoose.connection.collection("workflow_migration_archives")
        .find({ sourceExecution: second._id }).toArray();

    assert.equal(executions.length, 1);
    assert.equal(String(executions[0]._id), String(first._id));
    assert.equal(archived.length, 1);
    assert.equal(String(archived[0].originalDocument._id), String(second._id));
    await assert.rejects(
        VerificationStepExecution.create({
            verificationRequest: request._id, workflowStep: email._id, status: "pending"
        }),
        (error) => error.code === 11000
    );
});
