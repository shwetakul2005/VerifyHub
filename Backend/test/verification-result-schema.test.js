const test = require("node:test");
const assert = require("node:assert/strict");
const { validateVerificationResult } = require("../src/domain/verification-result");

function validResult() {
    return {
        schemaVersion: "1.0",
        pipelineVersion: "document-face-v1",
        componentVersions: { ocr: "tesseract-v1", documentQuality: "quality-v1", selfieQuality: "quality-v1", faceMatcher: "face-v1", decisionPolicy: "policy-v1" },
        verificationRequest: "request-1",
        execution: "execution-1",
        attempt: 1,
        document: {
            documentId: "document-1",
            declaredType: "PAN",
            detectedType: "PAN",
            typeConfidence: 0.95,
            typeMatches: true,
            quality: { score: 0.82, checks: [{ code: "SHARPNESS", passed: true, score: 0.8 }] },
            fields: {
                panNumber: { valueMasked: "ABCDE****F", valueHash: "digest", confidence: 0.9, source: "ocr", formatValid: true }
            },
            face: { detected: true, count: 1, confidence: 0.98 }
        },
        selfie: {
            quality: { score: 0.85, checks: [{ code: "BRIGHTNESS", passed: true, score: 0.85 }] },
            face: { detected: true, count: 1, confidence: 0.97 }
        },
        faceComparison: { similarity: 0.72, threshold: 0.6, matched: true, model: "face-model", modelVersion: "1" },
        thresholds: { documentQualityMin: 0.7, selfieQualityMin: 0.7, fieldConfidenceMin: 0.8 },
        automaticDecision: "approved",
        finalDecision: "approved",
        reasonCodes: [],
        createdAt: "2026-10-05T00:00:00.000Z"
    };
}

test("a versioned result accepts bounded scores and all three decisions", () => {
    for (const decision of ["approved", "manual_review", "rejected"]) {
        const result = validResult();
        result.automaticDecision = decision;
        result.finalDecision = decision;
        result.document.quality.score = 0;
        result.selfie.quality.score = 1;
        assert.equal(validateVerificationResult(result).automaticDecision, decision);
    }
});

test("a result rejects missing versions, invalid decisions, and nonfinite or unbounded scores", () => {
    const withoutVersion = validResult();
    delete withoutVersion.schemaVersion;
    assert.throws(() => validateVerificationResult(withoutVersion));
    const withoutComponents = validResult();
    delete withoutComponents.componentVersions;
    assert.throws(() => validateVerificationResult(withoutComponents));

    const invalidDecision = validResult();
    invalidDecision.automaticDecision = "verified";
    assert.throws(() => validateVerificationResult(invalidDecision));

    for (const score of [-0.01, 1.01, NaN, Infinity, -Infinity]) {
        const result = validResult();
        result.document.fields.panNumber.confidence = score;
        assert.throws(() => validateVerificationResult(result), `score ${score} must be rejected`);
    }
});

test("result input rejects raw OCR, embeddings, unmasked identifiers, and unknown nested fields", () => {
    for (const mutation of [
        (result) => { result.document.rawText = "private OCR"; },
        (result) => { result.selfie.face.embedding = [0.1, 0.2]; },
        (result) => { result.document.fields.panNumber.value = "ABCDE1234F"; },
        (result) => { result.liveness = true; }
    ]) {
        const result = validResult();
        mutation(result);
        assert.throws(() => validateVerificationResult(result));
    }
});

test("result input rejects unrecognized reason codes and invalid attempt numbers", () => {
    const reason = validResult();
    reason.reasonCodes = ["UNKNOWN_INTERNAL_REASON"];
    assert.throws(() => validateVerificationResult(reason));

    const attempt = validResult();
    attempt.attempt = 0;
    assert.throws(() => validateVerificationResult(attempt));
});

test("identifier fields must be masked and automatic result cannot embed an override", () => {
    const unmasked = validResult();
    unmasked.document.fields.panNumber.valueMasked = "ABCDE1234F";
    assert.throws(() => validateVerificationResult(unmasked));

    const override = validResult();
    override.finalDecision = "rejected";
    assert.throws(() => validateVerificationResult(override));
});
