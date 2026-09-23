const VerificationDocument = require("../models/verification-document.model");
const VerificationRequest = require("../models/verification-request.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const workflowEngineService = require("./workflow-engine.service");
const {
    findMembership,
    idEquals,
    requireRequestAccess
} = require("./authorization.service");

async function approve(documentId, verifierId) {
    return workflowEngineService.reviewDocument(documentId, verifierId, "approved");
}

async function reject(documentId, verifierId, rejectionReason) {
    return workflowEngineService.reviewDocument(documentId, verifierId, "rejected", rejectionReason);
}

async function getPendingDocuments(verifierId) {
    const documents = await VerificationDocument.find({
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
                request.organization &&
                findMembership(request.organization, verifierId)?.role === "verifier" &&
                request.workflowTemplate &&
                idEquals(request.workflowTemplate.assignedVerifier, verifierId)
            );
    });
    
}

async function getVerificationRequest(requestId, verifierId) {
    await requireRequestAccess(verifierId, requestId, {
        organizationRoles: ["verifier"],
        requireAssignedVerifier: true
    });

    const request = await VerificationRequest.findById(requestId)
        .populate("organization")
        .populate("workflowTemplate")
        .populate("applicant")
        .populate("currentStep");
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
