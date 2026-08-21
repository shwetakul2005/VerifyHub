const VerificationDocumentModel = require("../../../models/verification-document.model");

async function viewDocument(documentId) {
    const document = await VerificationDocumentModel.findById(documentId);

    if (!document) {
        throw new Error("Document not found.");
    }

    return document.filePath;
}

module.exports = {
    viewDocument
};