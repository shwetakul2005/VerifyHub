const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { startDatabase, clearDatabase, stopDatabase } = require("./database.helper");
const VerificationResult = require("../../src/models/verification-result.model");
const VerificationStepExecution = require("../../src/models/verification-step-execution.model");
const VerificationRequest = require("../../src/models/verification-request.model");
const { persistVerificationResult } = require("../../src/services/verification/verification-result.service");
const VerificationDocument = require("../../src/models/verification-document.model");
const {
    planVerificationResultMigration,
    applyVerificationResultMigration
} = require("../../src/migrations/verification-result-migration");
const AuditLog = require("../../src/models/audit-log.model");
const coordinator = require("../../src/services/workflow-engine.service");

test.before(startDatabase);
test.beforeEach(clearDatabase);
test.after(stopDatabase);

const id = () => new mongoose.Types.ObjectId();

function validResult(requestId, executionId, documentId) {
    return {
        schemaVersion: "1.0", pipelineVersion: "document-face-v1",
        componentVersions: { ocr: "tesseract-v1", documentQuality: "quality-v1", selfieQuality: "quality-v1", faceMatcher: "face-v1", decisionPolicy: "policy-v1" },
        verificationRequest: String(requestId), execution: String(executionId), attempt: 1,
        document: {
            documentId: String(documentId), declaredType: "PAN", detectedType: "PAN", typeConfidence: 0.95, typeMatches: true,
            quality: { score: 0.9, checks: [{ code: "SHARPNESS", passed: true, score: 0.9 }] },
            fields: { panNumber: { valueMasked: "ABCDE****F", valueHash: "keyed-digest", confidence: 0.9, source: "ocr", formatValid: true } },
            face: { detected: true, count: 1, confidence: 0.98 }
        },
        selfie: { quality: { score: 0.9, checks: [{ code: "BRIGHTNESS", passed: true, score: 0.9 }] }, face: { detected: true, count: 1, confidence: 0.97 } },
        faceComparison: { similarity: 0.8, threshold: 0.6, matched: true, model: "face-model", modelVersion: "1" },
        thresholds: { documentQualityMin: 0.7, selfieQualityMin: 0.7, fieldConfidenceMin: 0.8 },
        automaticDecision: "approved", finalDecision: "approved", reasonCodes: [], createdAt: "2026-10-10T00:00:00.000Z"
    };
}

async function fixture() {
    const organization = id(), workflowStep = id(), document = id();
    const requestRecord = await VerificationRequest.create({
        organization, workflowTemplate: id(), applicant: id(), status: "in_progress", currentStep: workflowStep
    });
    const request = requestRecord._id;
    const execution = await VerificationStepExecution.create({ verificationRequest: request, workflowStep, status: "processing", attempt: 1 });
    return { organization, request, document, execution };
}

test("one immutable result is persisted and linked per execution attempt", async () => {
    const f = await fixture();
    const saved = await persistVerificationResult({ organization: f.organization, result: validResult(f.request, f.execution._id, f.document) });
    const execution = await VerificationStepExecution.findById(f.execution._id).lean();
    assert.equal(String(execution.currentResult), String(saved._id));
    assert.equal(saved.result.document.fields.panNumber.valueMasked, "ABCDE****F");
    assert.equal(JSON.stringify(saved.toObject()).includes("ABCDE1234F"), false);

    saved.automaticDecision = "rejected";
    await saved.save();
    assert.equal((await VerificationResult.findById(saved._id).lean()).automaticDecision, "approved");
    await assert.rejects(VerificationResult.updateOne({ _id: saved._id }, { $set: { automaticDecision: "rejected" } }), /immutable/i);
});

test("MongoDB rejects duplicate execution-attempt results", async () => {
    const f = await fixture();
    const result = validResult(f.request, f.execution._id, f.document);
    await persistVerificationResult({ organization: f.organization, result });
    await assert.rejects(
        VerificationResult.create({ organization: f.organization, verificationRequest: f.request, execution: f.execution._id,
            document: f.document, attempt: 1, schemaVersion: "1.0", pipelineVersion: "document-face-v1",
            automaticDecision: "approved", finalDecision: "approved", reasonCodes: [], result }),
        (error) => error?.code === 11000
    );
});

test("the model rejects a version-one payload containing raw OCR or embeddings", async () => {
    const f = await fixture();
    const result = validResult(f.request, f.execution._id, f.document);
    result.document.rawText = "private OCR";
    await assert.rejects(VerificationResult.create({
        organization: f.organization, verificationRequest: f.request, execution: f.execution._id,
        document: f.document, attempt: 1, schemaVersion: "1.0", pipelineVersion: "document-face-v1",
        automaticDecision: "approved", finalDecision: "approved", reasonCodes: [], result
    }));
});

test("persistence rolls back when the execution attempt no longer matches", async () => {
    const f = await fixture();
    await VerificationStepExecution.updateOne({ _id: f.execution._id }, { $set: { attempt: 2 } });
    await assert.rejects(
        persistVerificationResult({ organization: f.organization, result: validResult(f.request, f.execution._id, f.document) }),
        /execution attempt/i
    );
    assert.equal(await VerificationResult.countDocuments(), 0);
});

test("result persistence and workflow finalization commit in one transaction", async () => {
    const f = await fixture();
    await VerificationStepExecution.updateOne({ _id: f.execution._id }, { $set: { processingToken: "claim-token" } });
    await VerificationRequest.updateOne({ _id: f.request }, {
        $set: { currentExecution: f.execution._id, currentStep: f.execution.workflowStep }
    });
    const outcome = {
        status: "waiting_for_review",
        verificationResult: { ...validResult(f.request, f.execution._id, f.document),
            automaticDecision: "manual_review", finalDecision: "manual_review",
            reasonCodes: ["FACE_SIMILARITY_UNCERTAIN"] }
    };
    const finalized = await coordinator.finalizeExecution({
        requestId: f.request, executionId: f.execution._id, processingToken: "claim-token", outcome
    });
    const result = await VerificationResult.findOne({ execution: f.execution._id }).lean();
    assert.equal(result.automaticDecision, "manual_review");
    assert.equal(String(finalized.execution.currentResult), String(result._id));
    assert.equal(await AuditLog.countDocuments({ action: "verification_result_created", target: result._id }), 1);
});

test("legacy OCR metadata is preflighted and backfilled without copying raw PII", async () => {
    const f = await fixture();
    const legacy = await VerificationDocument.create({
        verificationRequest: f.request, workflowStep: f.execution.workflowStep,
        title: "Legacy PAN", documentType: "PAN", fileName: "legacy.png", filePath: "uploads/legacy.png",
        mimeType: "image/png", fileSize: 100,
        metadata: { ocr: { provider: "tesseract", confidence: 0.5, rawText: "ABCDE1234F" },
            extracted: { result: { panNumber: "ABCDE1234F", name: "Private Person" } } }
    });
    const plan = await planVerificationResultMigration();
    assert.equal(plan.candidates.length, 1);
    assert.deepEqual(plan.violations, []);

    await applyVerificationResultMigration({ dryRun: false });
    await applyVerificationResultMigration({ dryRun: false });
    const stored = await VerificationResult.findOne({ document: legacy._id }).lean();
    assert.equal(stored.schemaVersion, "legacy-0");
    assert.equal(stored.automaticDecision, null);
    assert.equal(JSON.stringify(stored).includes("ABCDE1234F"), false);
    assert.equal(JSON.stringify(stored).includes("Private Person"), false);
    assert.equal(await VerificationResult.countDocuments(), 1);
});

test("legacy migration reports an ambiguous missing execution and performs no writes", async () => {
    const request = await VerificationRequest.create({
        organization: id(), workflowTemplate: id(), applicant: id(), status: "in_progress"
    });
    await VerificationDocument.create({
        verificationRequest: request._id, workflowStep: id(), title: "Orphan", documentType: "PAN",
        fileName: "orphan.png", filePath: "uploads/orphan.png", mimeType: "image/png", fileSize: 100,
        metadata: { ocr: { provider: "legacy", rawText: "sensitive" } }
    });
    const plan = await planVerificationResultMigration();
    assert.equal(plan.violations[0].code, "MISSING_DOCUMENT_EXECUTION");
    await assert.rejects(applyVerificationResultMigration({ dryRun: false }), /preflight/i);
    assert.equal(await VerificationResult.countDocuments(), 0);
});
