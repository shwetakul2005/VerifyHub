const VerificationDocument = require("../models/verification-document.model");
const VerificationRequest = require("../models/verification-request.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const workflowEngineService = require("./workflow-engine.service");
const {
    findMembership,
    idEquals,
    requireDocumentReviewer,
    requireRequestAccess
} = require("./authorization.service");

async function approve(documentId, verifierId) {
    const { document } = await requireDocumentReviewer(verifierId, documentId);

    if (document.reviewStatus !== "pending") {
        throw new Error("Document has already been reviewed.");
    }

    const execution = await VerificationStepExecution.findOne({
        verificationRequest: document.verificationRequest._id,
        workflowStep: document.workflowStep,
        status: "in_progress"
    });

    if (!execution) {
        throw new Error(
            "Verification step execution not found."
        );
    }

    document.reviewStatus = "approved";
    document.reviewedBy = verifierId;
    document.reviewedAt = new Date();

    await document.save();
    execution.status = "completed";
    execution.completedAt = new Date();
    
    execution.metadata = {
        ...execution.metadata,
        result: "approved",
        verifiedBy: verifierId
    };

    await execution.save();

    const request = await VerificationRequest.findById(
        document.verificationRequest
    );

    if (request?.currentStep?.equals(document.workflowStep)) {
        await workflowEngineService.moveToNextStep(document.verificationRequest);
    } else if (request && !request.currentStep) {
        await workflowEngineService.completeVerification(document.verificationRequest);
    }

    return document;
}

async function reject(documentId, verifierId, rejectionReason) {
    const { document } = await requireDocumentReviewer(verifierId, documentId);

    if (document.reviewStatus !== "pending") {
        throw new Error("Document has already been reviewed.");
    }

    if (!rejectionReason || !rejectionReason.trim()) {
        throw new Error("A rejection reason is required.");
    }

    document.reviewStatus = "rejected";
    document.reviewedBy = verifierId;
    document.reviewedAt = new Date();
    document.rejectionReason = rejectionReason.trim();

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
