const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const crypto = require("node:crypto");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");
const WorkflowStep = require("../../src/models/workflow-step.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");
const VerificationDocument = require("../../src/models/verification-document.model");
const { uploadVerificationDocument, deleteDocument } = require("../../src/services/verification-document.service");

test.before(startDatabase);
test.beforeEach(clearDatabase);
test.after(stopDatabase);
const id = () => new mongoose.Types.ObjectId();

async function fixture() {
    const applicant = id();
    const step = await WorkflowStep.create({ workflowTemplate: id(), stepOrder: 1, stepType: "document",
        title: "Identity", config: { documentType: "PAN" } });
    const request = await VerificationRequest.create({ organization: id(), workflowTemplate: id(), applicant,
        status: "in_progress", currentStep: step._id });
    const execution = await VerificationStepExecution.create({ verificationRequest: request._id,
        workflowStep: step._id, stepOrder: 1, status: "waiting_for_input", attempt: 1 });
    request.currentExecution = execution._id;
    await request.save();
    return { applicant, step, request, execution };
}

function uploadData(f, suffix) {
    return { verificationRequest: f.request._id, title: "PAN", documentType: "PAN",
        fileName: `${suffix}.png`, filePath: `uploads/${suffix}.png`, mimeType: "image/png", fileSize: 100,
        contentDigest: crypto.createHash("sha256").update(suffix).digest("hex") };
}

test("duplicate submission keys return one evidence attempt", async () => {
    const f = await fixture();
    const [first, second] = await Promise.all([
        uploadVerificationDocument(uploadData(f, "first"), f.applicant, { idempotencyKey: "submission-1" }),
        uploadVerificationDocument(uploadData(f, "first"), f.applicant, { idempotencyKey: "submission-1" })
    ]);
    assert.equal(String(first._id), String(second._id));
    assert.equal(await VerificationDocument.countDocuments(), 1);
    assert.equal(first.uploadAttempt, 1);
});

test("a new key creates an immutable superseding attempt and enforces the limit", async () => {
    const f = await fixture();
    const first = await uploadVerificationDocument(uploadData(f, "first"), f.applicant, { idempotencyKey: "submission-1" });
    const second = await uploadVerificationDocument(uploadData(f, "second"), f.applicant, { idempotencyKey: "submission-2" });
    const old = await VerificationDocument.findById(first._id).lean();
    assert.equal(second.uploadAttempt, 2);
    assert.equal(String(second.supersedes), String(first._id));
    assert.equal(old.isActive, false);
    assert.notEqual(old.supersededAt, null);
    await uploadVerificationDocument(uploadData(f, "third"), f.applicant, { idempotencyKey: "submission-3" });
    await assert.rejects(
        uploadVerificationDocument(uploadData(f, "fourth"), f.applicant, { idempotencyKey: "submission-4" }),
        (error) => error.code === "REUPLOAD_LIMIT_REACHED"
    );
    assert.equal(await VerificationDocument.countDocuments(), 3);
});

test("terminal requests and missing idempotency keys reject new evidence", async () => {
    const f = await fixture();
    await assert.rejects(uploadVerificationDocument(uploadData(f, "first"), f.applicant), /idempotency key/i);
    await VerificationRequest.updateOne({ _id: f.request._id }, { $set: { status: "cancelled" } });
    await assert.rejects(
        uploadVerificationDocument(uploadData(f, "first"), f.applicant, { idempotencyKey: "submission-1" }),
        /active request/i
    );
});

test("removing unprocessed evidence archives its record and retains the file reference", async () => {
    const f = await fixture();
    const document = await uploadVerificationDocument(uploadData(f, "first"), f.applicant, { idempotencyKey: "submission-1" });
    const response = await deleteDocument(f.request._id, document._id, f.applicant);
    const stored = await VerificationDocument.findById(document._id).lean();
    assert.equal(response.status, 200);
    assert.equal(stored.isDeleted, true);
    assert.equal(stored.isActive, false);
    assert.equal(stored.filePath, "uploads/first.png");
});

test("requested re-upload returns a review execution to input without deleting its prior evidence", async () => {
    const f = await fixture();
    const first = await uploadVerificationDocument(uploadData(f, "first"), f.applicant, { idempotencyKey: "submission-1" });
    await VerificationStepExecution.updateOne({ _id: f.execution._id }, {
        $set: { status: "waiting_for_review", "metadata.reuploadRequested": true }
    });
    await uploadVerificationDocument(uploadData(f, "second"), f.applicant, { idempotencyKey: "submission-2" });
    const execution = await VerificationStepExecution.findById(f.execution._id).lean();
    assert.equal(execution.status, "waiting_for_input");
    assert.equal((await VerificationDocument.findById(first._id).lean()).processingStatus, "superseded");
});
