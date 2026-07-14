const documentModel = require("../models/document.model");
const { unlink } = require("fs/promises");

async function deleteDocumentById(documentId, userId) {
    // Find the document
    const document = await documentModel.findById(documentId);

    // Document doesn't exist
    if (!document) {
        return {
            success: false,
            status: 404,
            message: "Document not found."
        };
    }

    // Ownership check
    if (!document.owner.equals(userId)) {
        return {
            success: false,
            status: 403,
            message: "Document access forbidden."
        };
    }

    // Delete file from uploads folder
    try {
        await unlink(document.filePath);
    } catch (err) {
        return {
            success: false,
            status: 500,
            message: "Could not delete the document file."
        };
    }

    // Delete metadata from MongoDB
    await document.deleteOne();

    return {
        success: true,
        status: 200,
        message: "Document deleted successfully."
    };
}

module.exports = { deleteDocumentById };