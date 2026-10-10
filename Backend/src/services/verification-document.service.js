const VerificationDocumentModel = require("../models/verification-document.model");
const VerificationRequestModel = require("../models/verification-request.model");
const WorkflowStepModel = require("../models/workflow-step.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const mongoose = require("mongoose");
const { assertExecutionTransition } = require("../domain/workflow-state-machine");
const {
    assertApplicantOwnsRequest,
    assertApplicantOwnsDocument
} = require("./document-authorization.service");


async function uploadVerificationDocument(data, applicantId, options = {}) {
    const {verificationRequest} = data;
    const idempotencyKey = options.idempotencyKey?.trim();
    if (!idempotencyKey) throw new Error("An idempotency key is required for evidence submission.");
    if (!/^[a-f0-9]{64}$/i.test(data.contentDigest || "")) {
        throw new Error("A SHA-256 content digest is required for evidence submission.");
    }
    if (!data.documentType) {
        throw new Error("Document type is required.");
    }
    await assertApplicantOwnsRequest(
        verificationRequest,
        applicantId
    );
    const session = await mongoose.startSession();
    let document;
    try {
        await session.withTransaction(async () => {
            const request = await VerificationRequestModel.findOne({ _id: verificationRequest, applicant: applicantId }).session(session);
            if (!request || !["pending", "in_progress"].includes(request.status)) {
                throw new Error("Evidence can only be submitted for an active request.");
            }
            if (!request.currentStep || !request.currentExecution) throw new Error("No active workflow step.");
            const workflowStep = await WorkflowStepModel.findById(request.currentStep).session(session);
            if (!workflowStep || workflowStep.stepType !== "document") {
                throw new Error("The current workflow step does not accept document uploads.");
            }
            const execution = await VerificationStepExecution.findOne({
                _id: request.currentExecution, verificationRequest: request._id, workflowStep: workflowStep._id
            }).session(session);
            if (!execution || !["pending", "waiting_for_input", "waiting_for_review", "failed"].includes(execution.status)) {
                throw new Error("The current execution does not accept evidence uploads.");
            }
            if (execution.status === "waiting_for_review" && execution.metadata?.reuploadRequested !== true) {
                throw new Error("A verifier must request re-upload before reviewed evidence can be replaced.");
            }
            const duplicate = await VerificationDocumentModel.findOne({
                execution: execution._id, evidenceRole: "document", idempotencyKey
            }).session(session);
            if (duplicate) { document = duplicate; return; }
            const existing = await VerificationDocumentModel.findOne({
                execution: execution._id, evidenceRole: "document", isActive: true
            }).session(session);
            if (existing && execution.reuploadCount >= execution.maxReuploads) {
                const error = new Error("The evidence re-upload limit has been reached.");
                error.code = "REUPLOAD_LIMIT_REACHED";
                throw error;
            }
            const now = new Date();
            if (existing) {
                await VerificationDocumentModel.updateOne({ _id: existing._id, isActive: true }, {
                    $set: { isActive: false, supersededAt: now, processingStatus: "superseded" }
                }, { session });
            }
            const uploadAttempt = existing ? existing.uploadAttempt + 1 : 1;
            [document] = await VerificationDocumentModel.create([{
                ...data,
                workflowStep: workflowStep._id,
                execution: execution._id,
                evidenceRole: "document",
                uploadAttempt,
                supersedes: existing?._id || null,
                idempotencyKey,
                isActive: true,
                processingStatus: "uploaded"
            }], { session });
            let nextStatus = execution.status;
            if (existing && execution.status === "waiting_for_review") nextStatus = "waiting_for_input";
            if (existing && execution.status === "failed") nextStatus = "pending";
            if (nextStatus !== execution.status) assertExecutionTransition(execution.status, nextStatus);
            const executionUpdate = await VerificationStepExecution.updateOne({ _id: execution._id, stateVersion: execution.stateVersion }, {
                $set: { currentEvidenceAttempt: uploadAttempt, status: nextStatus,
                    processingToken: null, leaseExpiresAt: null, "metadata.reuploadRequested": false },
                ...(existing ? { $inc: { reuploadCount: 1, stateVersion: 1 } } : { $inc: { stateVersion: 1 } })
            }, { session });
            if (executionUpdate.modifiedCount !== 1) throw new Error("Evidence submission changed concurrently.");
        });
    } catch (error) {
        if (error?.code === 11000) {
            const duplicate = await VerificationDocumentModel.findOne({
                execution: (await VerificationRequestModel.findById(verificationRequest).lean())?.currentExecution,
                evidenceRole: "document", idempotencyKey
            });
            if (duplicate) return duplicate;
        }
        throw error;
    } finally {
        await session.endSession();
    }
    return document;
    
}

async function getDocuments(requestId, applicantId){
    await assertApplicantOwnsRequest(requestId, applicantId);

    const document = await VerificationDocumentModel.find({
        verificationRequest: requestId
    }).populate("workflowStep");
    if (document.length === 0) {
        throw new Error("No documents found.");
    }
    return document;
}

async function getDocumentsById(documentId, applicantId){
    await assertApplicantOwnsDocument(documentId, applicantId);

    const document = await VerificationDocumentModel.findById(documentId)
        .populate("workflowStep");
    return document;
}

async function deleteDocument(verificationRequestId, verificationDocumentId, applicantId){
    await assertApplicantOwnsRequest(verificationRequestId, applicantId);

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

    if (!["pending", "in_progress"].includes(document.verificationRequest.status)) {
        throw new Error(
            "Evidence can only be removed while verification is active."
        );
    }
    if (document.processingStatus === "processing" || document.metadata?.ocr) {
        throw new Error("Processed evidence must be superseded rather than removed.");
    }
    document.isDeleted = true;
    document.isActive = false;
    document.deletedAt = new Date();
    document.deletedBy = applicantId;
    document.deletionReason = "Applicant removed unprocessed evidence";
    await document.save();
    
    return {
        success: true,
        status: 200,
        message: "Document archived successfully."
    };
}

module.exports = {uploadVerificationDocument,
    getDocuments,
    getDocumentsById,
    deleteDocument
};
