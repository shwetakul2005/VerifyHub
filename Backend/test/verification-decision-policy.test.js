const test = require("node:test");
const assert = require("node:assert/strict");
const { decideVerification } = require("../src/domain/verification-decision-policy");

function passingEvidence() {
    return {
        documentQuality: { status: "usable", score: 0.9, reasonCodes: [] },
        selfieQuality: { status: "usable", score: 0.9, reasonCodes: [] },
        document: { typeMatches: true, typeConfidence: 0.95, reasonCodes: [],
            fields: { panNumber: { confidence: 0.9, formatValid: true } },
            face: { count: 1 } },
        selfie: { face: { count: 1 } },
        faceComparison: { similarity: 0.8, matched: true },
        reuploadExhausted: false
    };
}

test("fully passing evidence is approved", () => {
    assert.deepEqual(decideVerification(passingEvidence()), { decision: "approved", reasonCodes: [] });
});

test("low face similarity always routes to manual review", () => {
    const evidence = passingEvidence();
    evidence.faceComparison = { similarity: 0.2, matched: false };
    assert.deepEqual(decideVerification(evidence), {
        decision: "manual_review", reasonCodes: ["FACE_SIMILARITY_UNCERTAIN"]
    });
});

test("borderline quality and low field confidence route to manual review", () => {
    const evidence = passingEvidence();
    evidence.documentQuality.status = "borderline";
    evidence.documentQuality.reasonCodes = ["DOCUMENT_TOO_BLURRY"];
    evidence.document.fields.panNumber.confidence = 0.5;
    assert.deepEqual(decideVerification(evidence), {
        decision: "manual_review", reasonCodes: ["DOCUMENT_TOO_BLURRY", "FIELD_LOW_CONFIDENCE"]
    });
});

test("explicit deterministic document failures reject", () => {
    for (const reason of ["DOCUMENT_UNSUPPORTED_FORMAT", "DOCUMENT_CORRUPT", "DOCUMENT_TYPE_MISMATCH", "PAN_FORMAT_INVALID", "AADHAAR_FORMAT_INVALID"]) {
        const evidence = passingEvidence();
        evidence.document.reasonCodes = [reason];
        assert.equal(decideVerification(evidence).decision, "rejected", reason);
    }
});

test("missing face rejects only after evidence re-upload is exhausted", () => {
    const evidence = passingEvidence();
    evidence.document.face.count = 0;
    assert.equal(decideVerification(evidence).decision, "manual_review");
    evidence.reuploadExhausted = true;
    assert.deepEqual(decideVerification(evidence), {
        decision: "rejected", reasonCodes: ["DOCUMENT_FACE_MISSING", "REUPLOAD_LIMIT_REACHED"]
    });
});

test("infrastructure errors are not converted into identity decisions", () => {
    assert.throws(() => decideVerification({ infrastructureError: true }), /infrastructure/i);
});

test("missing required evidence can never be automatically approved", () => {
    const evidence = passingEvidence();
    evidence.document.typeMatches = undefined;
    evidence.document.fields = {};
    evidence.selfie.face.count = undefined;
    const result = decideVerification(evidence);
    assert.equal(result.decision, "manual_review");
    assert.ok(result.reasonCodes.includes("DOCUMENT_TYPE_UNCERTAIN"));
    assert.ok(result.reasonCodes.includes("REQUIRED_FIELD_MISSING"));
    assert.ok(result.reasonCodes.includes("SELFIE_FACE_MISSING"));
});
