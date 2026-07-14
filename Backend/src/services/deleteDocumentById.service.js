const documentModel = require("../models/document.model");
const path = require("path");
const fs = require("fs");


async function deleteDocumentById(docId, userId) {
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
    
    delFileName = documentModel.fileName;
    deleteFile(delFileName);
    documentModel.deleteOne(docId);

    return {
        success: true,
        message: "Document deleted successfully."
    };
}


module.exports = {deleteDocumentById};