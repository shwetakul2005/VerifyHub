const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPipelineOutcome, runVerificationPipeline } = require("../src/services/verification/verification-pipeline.service");
const { validateVerificationResult } = require("../src/domain/verification-result");

function input() {
    return {
        requestId: "507f1f77bcf86cd799439011", executionId: "507f1f77bcf86cd799439012", attempt: 1,
        documentId: "507f1f77bcf86cd799439013", declaredType: "PAN", digestKey: "test-secret",
        documentQuality: { qualityVersion: "image-quality-v1", score: 0.9, status: "usable", checks: [{ code: "SHARPNESS", passed: true, score: 0.9 }], reasonCodes: [] },
        selfieQuality: { qualityVersion: "image-quality-v1", score: 0.9, status: "usable", checks: [{ code: "BRIGHTNESS", passed: true, score: 0.9 }], reasonCodes: [] },
        documentEvidence: { detectedType: "PAN", typeConfidence: 0.95, typeMatches: true, reasonCodes: [],
            fields: { panNumber: { value: "ABCDE1234F", confidence: 0.9, source: "ocr", formatValid: true } } },
        faceEvidence: {
            model: { name: "face-model", version: "1" },
            documentFace: { count: 1, confidence: 0.98 }, selfieFace: { count: 1, confidence: 0.97 },
            faceComparison: { similarity: 0.8, threshold: 0.6, matched: true }
        },
        ocrVersion: "tesseract-v1", now: new Date("2026-10-10T00:00:00.000Z")
    };
}

test("pipeline builds a strict sanitized approved result and completed outcome", () => {
    const outcome = buildPipelineOutcome(input());
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.verificationResult.automaticDecision, "approved");
    assert.equal(outcome.verificationResult.document.fields.panNumber.valueMasked, "ABCDE****F");
    assert.doesNotThrow(() => validateVerificationResult(outcome.verificationResult));
});

test("pipeline makes low similarity manual review and never auto-rejects it", () => {
    const value = input();
    value.faceEvidence.faceComparison = { similarity: -0.2, threshold: 0.6, matched: false };
    const outcome = buildPipelineOutcome(value);
    assert.equal(outcome.status, "waiting_for_review");
    assert.equal(outcome.verificationResult.automaticDecision, "manual_review");
    assert.equal(outcome.verificationResult.faceComparison.similarity, 0.4);
});

test("pipeline sends deterministic type mismatch to review with a rejected automatic result", () => {
    const value = input();
    value.documentEvidence.typeMatches = false;
    value.documentEvidence.detectedType = "AADHAAR";
    value.documentEvidence.reasonCodes = ["DOCUMENT_TYPE_MISMATCH"];
    const outcome = buildPipelineOutcome(value);
    assert.equal(outcome.status, "waiting_for_review");
    assert.equal(outcome.verificationResult.automaticDecision, "rejected");
});

test("pipeline runner composes quality, OCR, parsing, and face adapters", async () => {
    const value = input();
    let calls = 0;
    const outcome = await runVerificationPipeline({
        ...value, documentFile: { path: "document.png" }, selfieFile: { path: "selfie.png" }
    }, {
        analyzeDocumentQuality: async () => { calls += 1; return value.documentQuality; },
        analyzeSelfieQuality: async () => { calls += 1; return value.selfieQuality; },
        compareFaces: async () => { calls += 1; return value.faceEvidence; },
        recognize: async () => { calls += 1; return { text: "PAN ABCDE1234F", confidence: 0.9, providerVersion: "v1" }; },
        extractEvidence: () => value.documentEvidence
    });
    assert.equal(calls, 4);
    assert.equal(outcome.verificationResult.automaticDecision, "approved");
});

test("pipeline runner propagates infrastructure failures for workflow retry", async () => {
    const value = input();
    await assert.rejects(runVerificationPipeline({
        ...value, documentFile: { path: "document.png" }, selfieFile: { path: "selfie.png" }
    }, {
        analyzeDocumentQuality: async () => { throw new Error("service unavailable"); },
        analyzeSelfieQuality: async () => value.selfieQuality,
        compareFaces: async () => value.faceEvidence,
        recognize: async () => ({ text: "", confidence: 0.9, providerVersion: "v1" }),
        extractEvidence: () => value.documentEvidence
    }), /service unavailable/);
});
