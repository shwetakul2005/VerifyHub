const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { serializeVerificationResult } = require("../src/services/verification/verification-result.service");

function resultWithRawPan() {
    return {
        schemaVersion: "1.0", pipelineVersion: "document-face-v1",
        componentVersions: { ocr: "tesseract-v1", documentQuality: "quality-v1", selfieQuality: "quality-v1", faceMatcher: "face-v1", decisionPolicy: "policy-v1" },
        verificationRequest: "507f1f77bcf86cd799439011", execution: "507f1f77bcf86cd799439012", attempt: 1,
        document: {
            documentId: "507f1f77bcf86cd799439013", declaredType: "PAN", detectedType: "PAN",
            typeConfidence: 0.95, typeMatches: true,
            quality: { score: 0.9, checks: [{ code: "SHARPNESS", passed: true, score: 0.9 }] },
            fields: { panNumber: { value: "ABCDE1234F", confidence: 0.9, source: "ocr", formatValid: true } },
            face: { detected: true, count: 1, confidence: 0.98 }
        },
        selfie: { quality: { score: 0.9, checks: [{ code: "BRIGHTNESS", passed: true, score: 0.9 }] }, face: { detected: true, count: 1, confidence: 0.97 } },
        faceComparison: { similarity: 0.8, threshold: 0.6, matched: true, model: "face-model", modelVersion: "1" },
        thresholds: { documentQualityMin: 0.7, selfieQualityMin: 0.7, fieldConfidenceMin: 0.8 },
        automaticDecision: "approved", finalDecision: "approved", reasonCodes: [], createdAt: "2026-10-10T00:00:00.000Z"
    };
}

test("result serialization masks identifiers and uses a keyed deterministic digest", () => {
    const first = serializeVerificationResult(resultWithRawPan(), { digestKey: "test-only-secret" });
    const second = serializeVerificationResult(resultWithRawPan(), { digestKey: "test-only-secret" });
    assert.equal(first.document.fields.panNumber.valueMasked, "ABCDE****F");
    assert.equal(first.document.fields.panNumber.value, undefined);
    assert.equal(first.document.fields.panNumber.valueHash, second.document.fields.panNumber.valueHash);
    assert.equal(first.document.fields.panNumber.valueHash.length, 64);
    assert.notEqual(first.document.fields.panNumber.valueHash, crypto.createHash("sha256").update("ABCDE1234F").digest("hex"));
});

test("result serialization requires a digest key and rejects unexpected sensitive payloads", () => {
    assert.throws(() => serializeVerificationResult(resultWithRawPan(), {}), /digest key/i);
    const withEmbedding = resultWithRawPan();
    withEmbedding.selfie.face.embedding = [0.1];
    assert.throws(() => serializeVerificationResult(withEmbedding, { digestKey: "test-only-secret" }));
});
