const VerificationDocumentModel = require("../models/verification-document.model");
const VerificationRequestModel = require("../models/verification-request.model");
const WorkflowStepModel = require("../models/workflow-step.model");
const { unlink } = require("fs/promises");


async function uploadVerificationDocument(data) {
    const {verificationRequest} = data;
    if (!data.documentType) {
        throw new Error("Document type is required.");
    }
    const request = await VerificationRequestModel.findById(verificationRequest);
    if (!request) {
        throw new Error("Verification Request not found.");
    }
    
    if (request.status === "completed") {
        throw new Error("Verification request is already completed.");
    }

    if (request.status === "rejected") {
        throw new Error("Verification request has been rejected.");
    }

    if (!request.currentStep) {
        throw new Error("No active workflow step.");
    }

    const workflowStep = await WorkflowStepModel.findById(request.currentStep);
    
    if (!workflowStep) {
        throw new Error("Workflow step not found.");
    }

    if (workflowStep.stepType !== "document") {
        throw new Error(
            "The current workflow step does not accept document uploads."
        );
    }

    const existing = await VerificationDocumentModel.findOne({
        verificationRequest: request._id,
        workflowStep: workflowStep._id
    });

    if (existing) {
        throw new Error(
            "A document has already been uploaded for this step."
        );
    }
    data.workflowStep = workflowStep._id;
    const document = await VerificationDocumentModel.create(data);
    return document;
    
}

async function getDocuments(requestId){
    const document = await VerificationDocumentModel.find({
        verificationRequest: requestId
    }).populate("workflowStep");
    if (document.length === 0) {
        throw new Error("No documents found.");
    }
    return document;
}

async function getDocumentsById(documentId){
    const document = await VerificationDocumentModel.findById(documentId).populate("workflowStep");
    if (!document) {
        throw new Error("Document not found.");
    }
    return document;
}

async function deleteDocument(verificationRequestId,verificationDocumentId){
    // Find the document
    const document =
        await VerificationDocumentModel.findOne({
            _id: verificationDocumentId,
            verificationRequest: verificationRequestId
        }).populate("verificationRequest").populate("workflowStep");
    
    // Document doesn't exist
    if (!document) {
        throw new Error("Document not found.");
    }

    // document verification is already completed
    if (document.verificationRequest.status !== "pending") {
        throw new Error(
            "Documents can only be deleted while verification is pending."
        );
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

module.exports = {uploadVerificationDocument,
    getDocuments,
    getDocumentsById,
    deleteDocument
};