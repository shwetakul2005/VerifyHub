const test = require("node:test");
const assert = require("node:assert/strict");

const emailAdapter = require("../src/services/verification/emailVerification/email-verification.service");
const documentAdapter = require("../src/services/verification/documentVerification/document-verification.service");
const faceAdapter = require("../src/services/verification/faceVerification/face-verification.service");

test("email adapter returns a waiting outcome without mutating the execution", async () => {
    const execution = { metadata: { existing: true } };
    let deliveredTo;
    const outcome = await emailAdapter.execute({
        request: { applicant: { username: "Applicant", email: "applicant@example.com" } },
        execution
    }, {
        sendEmail: async (to) => { deliveredTo = to; }
    });
    assert.equal(deliveredTo, "applicant@example.com");
    assert.equal(outcome.status, "waiting_for_input");
    assert.equal(typeof outcome.metadata.token, "string");
    assert.deepEqual(execution, { metadata: { existing: true } });
});

test("document adapter reports waiting states and returns OCR evidence without advancing", async () => {
    const context = { request: { _id: "request" }, execution: { workflowStep: "step" } };
    const waiting = await documentAdapter.execute(context, { findDocuments: async () => [] });
    assert.equal(waiting.status, "waiting_for_input");

    let saved = 0;
    const document = {
        _id: "document",
        filePath: "synthetic.png",
        documentType: "PAN",
        metadata: {},
        async save() { saved += 1; }
    };
    const processed = await documentAdapter.execute(context, {
        findDocuments: async () => [document],
        extractText: async () => "PAN ABCDE1234F",
        parseDocument: async () => ({ pan: "ABCDE1234F" })
    });
    assert.equal(processed.status, "waiting_for_review");
    assert.equal(saved, 1);
    assert.deepEqual(processed.metadata.documentIds, ["document"]);
});

test("document adapter uses typed OCR evidence and omits full OCR text from new metadata", async () => {
    const document = {
        _id: "document", filePath: "synthetic.png", documentType: "PAN", metadata: {},
        async save() {}
    };
    const outcome = await documentAdapter.execute({
        request: { _id: "request" }, execution: { workflowStep: "step" }
    }, {
        findDocuments: async () => [document],
        recognize: async () => ({ schemaVersion: "1.0", provider: "fake", confidence: 0.41,
            text: "PAN ABCDE1234F", blocks: [] }),
        parseDocument: async () => ({ panNumber: "ABCDE1234F" })
    });
    assert.equal(outcome.status, "waiting_for_review");
    assert.equal(document.metadata.ocr.confidence, 0.41);
    assert.equal(document.metadata.ocr.uncertain, true);
    assert.equal(document.metadata.ocr.rawText, undefined);
    assert.equal(document.metadata.extracted.result.panNumber, "ABCDE1234F");
});

test("document adapter uses typed OCR evidence for PAN detection and field confidence", async () => {
    const document = {
        _id: "document", filePath: "synthetic.png", documentType: "PAN", metadata: {},
        async save() {}
    };
    await documentAdapter.execute({
        request: { _id: "request" }, execution: { workflowStep: "step" }
    }, {
        findDocuments: async () => [document],
        recognize: async () => ({ schemaVersion: "1.0", provider: "fake", confidence: 0.95,
            text: "INCOME TAX DEPARTMENT\nPERMANENT ACCOUNT NUMBER\nDEMO APPLICANT\nABCDE1234F",
            blocks: [{ text: "ABCDE1234F", confidence: 0.81 }] })
    });
    assert.equal(document.metadata.extracted.result.panNumber, "ABCDE1234F");
    assert.equal(document.metadata.extracted.result.evidence.typeMatches, true);
    assert.equal(document.metadata.extracted.result.evidence.fields.panNumber.confidence, 0.81);
    assert.equal(document.metadata.ocr.rawText, undefined);
});

test("face adapter returns completed or non-retryable failed outcomes without advancing", async () => {
    const context = {
        execution: {
            metadata: {
                documentFilePath: "document.png",
                liveFilePath: "live.png",
                documentMimeType: "image/png",
                liveMimeType: "image/png"
            }
        }
    };
    const completed = await faceAdapter.execute(context, {
        callMlService: async () => ({ verified: true, similarity: 0.91 })
    });
    assert.equal(completed.status, "completed");
    const mismatch = await faceAdapter.execute(context, {
        callMlService: async () => ({ verified: false, similarity: 0.12 })
    });
    assert.equal(mismatch.status, "failed");
    assert.equal(mismatch.error.retryable, false);
});
