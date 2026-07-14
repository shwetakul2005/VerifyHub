const documentModel = require("../models/document.model.js");
async function getPendingDocuments(){
    const documents = await documentModel.find({status: "pending"});
    if (!documents) {
        return {
            success: false,
            status: 404,
            message: "Document not found."
        };
    }

    return {
        success: true,
        status: 200,
        message: "Pending documents fetched successfully.",
        documents
    };
    
}

module.exports = {getPendingDocuments}