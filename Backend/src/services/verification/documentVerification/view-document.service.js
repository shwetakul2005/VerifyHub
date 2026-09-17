const { requireDocumentAccess } = require("../../authorization.service");

async function viewDocument(documentId, userId) {
    const { document } = await requireDocumentAccess(userId, documentId);

    return document.filePath;
}

module.exports = {
    viewDocument
};
