const documentModel = require("../models/document.model");
async function getDocumentById(docId, userId) {
    const document = await documentModel.findById(docId);

    if (!document) {
        return {
            success: false,
            status: 404,
            message: "Document not found."
        };
    }

    if (!document.owner.equals(userId)) {
        return {
            success: false,
            status: 403,
            message: "Document access forbidden."
        };
    }

    return {
        success: true,
        document
    };
}

module.exports = {getDocumentById};

