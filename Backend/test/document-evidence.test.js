const test = require("node:test");
const assert = require("node:assert/strict");
const {
    validateAadhaar,
    validatePan,
    extractDocumentEvidence
} = require("../src/domain/document-evidence");

test("synthetic Aadhaar number requires length, nonzero prefix, and Verhoeff checksum", () => {
    assert.equal(validateAadhaar("1111 1111 1115"), true);
    assert.equal(validateAadhaar("1111 1111 1116"), false);
    assert.equal(validateAadhaar("0111 1111 1115"), false);
    assert.equal(validateAadhaar("11111111115"), false);
});

test("PAN format normalizes case but rejects ambiguous OCR substitutions", () => {
    assert.equal(validatePan("abcde1234f"), true);
    assert.equal(validatePan("ABCDE 1234 F"), true);
    assert.equal(validatePan("ABCDEI234F"), false);
    assert.equal(validatePan("ABCDE123F"), false);
});

test("multiple textual signals detect a PAN and preserve field confidence", () => {
    const evidence = extractDocumentEvidence("PAN", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nDEMO APPLICANT\nABCDE 1234 F\n01/01/1995",
        confidence: 0.92,
        blocks: [{ text: "ABCDE 1234 F", confidence: 0.81 }]
    });
    assert.equal(evidence.detectedType, "PAN");
    assert.equal(evidence.typeMatches, true);
    assert.equal(evidence.fields.panNumber.value, "ABCDE1234F");
    assert.equal(evidence.fields.panNumber.confidence, 0.81);
    assert.equal(evidence.fields.panNumber.formatValid, true);
    assert.equal(evidence.fields.name.value, "DEMO APPLICANT");
    assert.deepEqual(evidence.reasonCodes, []);
});

test("declared and detected type conflict is explicit when OCR evidence is strong", () => {
    const evidence = extractDocumentEvidence("AADHAAR", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nDEMO APPLICANT\nABCDE1234F",
        confidence: 0.95,
        blocks: []
    });
    assert.equal(evidence.detectedType, "PAN");
    assert.equal(evidence.typeMatches, false);
    assert.ok(evidence.reasonCodes.includes("DOCUMENT_TYPE_MISMATCH"));
});

test("conflicting or weak OCR signals stay uncertain", () => {
    const conflict = extractDocumentEvidence("PAN", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nUIDAI AADHAAR\nABCDE1234F",
        confidence: 0.9, blocks: []
    });
    assert.equal(conflict.detectedType, null);
    assert.ok(conflict.reasonCodes.includes("EVIDENCE_CONFLICT"));

    const weak = extractDocumentEvidence("AADHAAR", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nABCDE1234F",
        confidence: 0.3, blocks: []
    });
    assert.ok(weak.reasonCodes.includes("DOCUMENT_TYPE_UNCERTAIN"));
    assert.equal(weak.reasonCodes.includes("DOCUMENT_TYPE_MISMATCH"), false);
});

test("invalid and multiple identifier candidates do not become a confident extracted field", () => {
    const invalid = extractDocumentEvidence("AADHAAR", {
        text: "GOVERNMENT OF INDIA\nAADHAAR\nDEMO APPLICANT\n1111 1111 1116",
        confidence: 0.9, blocks: []
    });
    assert.equal(invalid.fields.aadhaarNumber.formatValid, false);
    assert.ok(invalid.reasonCodes.includes("AADHAAR_FORMAT_INVALID"));

    const multiple = extractDocumentEvidence("PAN", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nABCDE1234F\nFGHIJ5678K",
        confidence: 0.9, blocks: []
    });
    assert.equal(multiple.fields.panNumber, undefined);
    assert.ok(multiple.reasonCodes.includes("EVIDENCE_CONFLICT"));
});

test("Aadhaar type can be confidently detected with its identifier and UIDAI label", () => {
    const evidence = extractDocumentEvidence("AADHAAR", {
        text: "UIDAI AADHAAR\nDEMO APPLICANT\n1111 1111 1115",
        confidence: 0.95, blocks: []
    });
    assert.equal(evidence.typeMatches, true);
    assert.equal(evidence.fields.aadhaarNumber.formatValid, true);
    assert.deepEqual(evidence.reasonCodes, []);
});

test("low-confidence extracted fields remain reviewable uncertainty", () => {
    const evidence = extractDocumentEvidence("PAN", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nDEMO APPLICANT\nABCDE1234F",
        confidence: 0.9,
        blocks: [{ text: "ABCDE1234F", confidence: 0.3 }]
    });
    assert.ok(evidence.reasonCodes.includes("FIELD_LOW_CONFIDENCE"));
});

test("PAN extracts the parent name when a second name line is present", () => {
    const evidence = extractDocumentEvidence("PAN", {
        text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nDEMO APPLICANT\nDEMO PARENT\nABCDE1234F",
        confidence: 0.92, blocks: []
    });
    assert.equal(evidence.fields.name.value, "DEMO APPLICANT");
    assert.equal(evidence.fields.fatherName.value, "DEMO PARENT");
});
