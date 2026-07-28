const VerificationDocumentModel = require("../models/verification-document.model");
const VerificationDocument = require("../models/verification-document.model");
const VerificationRequest = require("../models/verification-request.model");
const verificationStepExecutionModel = require("../models/verification-step-execution.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const workflowEngineService = require("./workflow-engine.service");

async function approve(documentId, verifierId) {
    const document = await VerificationDocument.findById(documentId);

    if (!document) {
        throw new Error("Document not found.");
    }

    document.reviewStatus = "approved";
    document.reviewedBy = verifierId;
    document.reviewedAt = new Date();

    await document.save();
    const execution = await VerificationStepExecution.findOne({
        verificationRequest: document.verificationRequest,
        workflowStep: document.workflowStep,
        status: "in_progress"
    });
    
    
    // execution.status = "completed";
    // execution.completedAt = new Date();
    
    // await execution.save();

    return await workflowEngineService.moveToNextStep(
        document.verificationRequest
    );
}

async function reject(documentId, verifierId, rejectionReason) {
    const document = await VerificationDocument.findById(documentId);

    if (!document) {
        throw new Error("Document not found.");
    }

    document.reviewStatus = "rejected";
    document.reviewedBy = verifierId;
    document.reviewedAt = new Date();
    document.rejectionReason = rejectionReason;

    await document.save();

    const execution = await VerificationStepExecution.findOne({
        verificationRequest: document.verificationRequest,
        workflowStep: document.workflowStep,
        status: "in_progress"
    });

    if (execution) {
        execution.status = "failed";
        execution.completedAt = new Date();
        await execution.save();
    }

    const request = await VerificationRequest.findById(
        document.verificationRequest
    );

    request.status = "rejected";
    await request.save();

    return document;
}

async function getPendingDocuments(verifierId) {
    const documents = await VerificationDocumentModel.find({
        reviewStatus: "pending"
    })
    .populate({
        path: "verificationRequest",
        populate: [
            {
                path: "workflowTemplate"
            },
            {
                path: "applicant"
            },
            {
                path: "organization"
            },
            {
                path: "currentStep"
            }
        ]
    }).populate("workflowStep");

        return documents.filter(doc => {
            const request = doc.verificationRequest;

            return (
                request &&
                request.workflowTemplate &&
                request.workflowTemplate.assignedVerifier.equals(verifierId)
            );
    });
    
}

async function getVerificationRequest(requestId, verifierId) {
    const request = await VerificationRequest.findById(requestId)
        .populate("organization")
        .populate("workflowTemplate")
        .populate("applicant")
        .populate("currentStep");
    console.log(request.workflowTemplate.assignedVerifier._id);
    console.log(verifierId);
    if(request.workflowTemplate.assignedVerifier._id !== verifierId){
        throw new Error("You can't access this resource.")   
    }

    if (!request) {
        throw new Error("Verification request not found.");
    }

    const documents = await VerificationDocument.find({
        verificationRequest: requestId
    }).populate("workflowStep");

    const executions = await VerificationStepExecution.find({
        verificationRequest: requestId
    }).populate("workflowStep");

    return {
        request,
        documents,
        executions
    };
}

module.exports = {
    approve,
    reject,
    getPendingDocuments,
    getVerificationRequest
};