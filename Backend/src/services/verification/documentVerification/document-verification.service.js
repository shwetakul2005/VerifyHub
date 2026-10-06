const VerificationDocument = require("../../../models/verification-document.model");
const { findParser } = require("../ocr/findParser");
const { createOcrAdapter } = require("../ocr/ocr-adapter");

async function execute(context, dependencies = {}) {
    const findDocuments = dependencies.findDocuments || ((query) => VerificationDocument.find(query));
    const recognize = dependencies.recognize || (dependencies.extractText
        ? async (filePath) => ({ text: await dependencies.extractText(filePath), provider: "legacy", confidence: null })
        : createOcrAdapter().recognize);
    const parseDocument = dependencies.parseDocument || findParser;
    const documents = await findDocuments({
        verificationRequest: context.request._id,
        workflowStep: context.execution.workflowStep
    });
    if (documents.length === 0) {
        return {
            status: "waiting_for_input",
            message: "Waiting for applicant to upload the required document."
        };
    }
    const unprocessed = documents.filter((document) => !document.metadata?.ocr);
    for (const document of unprocessed) {
        const evidence = await recognize(document.filePath);
        const parsed = await parseDocument(document.documentType,
            dependencies.parseDocument ? evidence.text : evidence);
        document.metadata = {
            ...(document.metadata || {}),
            ocr: {
                provider: evidence.provider,
                providerVersion: evidence.providerVersion || null,
                confidence: evidence.confidence,
                uncertain: evidence.confidence === null || evidence.confidence < 0.75
            },
            extracted: { result: parsed }
        };
        await document.save();
    }
    return {
        status: "waiting_for_review",
        metadata: {
            verificationType: "document",
            documentIds: documents.map((document) => String(document._id))
        },
        message: unprocessed.length > 0
            ? "Document processed. Waiting for verifier review."
            : "Document is waiting for verifier review."
    };
}

module.exports = { execute };
