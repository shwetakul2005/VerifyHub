const fs = require("fs");
const VerificationRequest = require("../../../models/verification-request.model");
const VerificationStepExecution = require("../../../models/verification-step-execution.model");
const VerificationDocument = require("../../../models/verification-document.model");
const { runVerificationPipeline } = require("../verification-pipeline.service");

async function getRequestForFaceVerification(requestId, applicantId) {
    const request = await VerificationRequest.findById(requestId).populate("applicant");
    if (!request) throw new Error("Verification request not found.");
    if (String(request.applicant?._id) !== String(applicantId)) {
        throw new Error("You are not authorized to access this verification request.");
    }
    if (request.status !== "in_progress") throw new Error("Verification request is not active.");
    const execution = await VerificationStepExecution.findById(request.currentExecution);
    if (execution?.stepSnapshot?.stepType !== "face_verification") {
        throw new Error("Current workflow step is not face verification.");
    }
    return { request, execution };
}

function getUploadedFiles(files) {
    const documentFile = files?.document?.[0] || files?.document || null;
    const liveFile = files?.live?.[0] || files?.live || null;
    if (!documentFile) throw new Error("Document image is required for identity verification.");
    if (!liveFile) throw new Error("Live selfie is required for identity verification.");
    return { documentFile, liveFile };
}

async function callMlService(documentFile, liveFile) {
    const mlBaseUrl = process.env.ML_SERVICE_URL || "http://localhost:8000";
    const formData = new FormData();
    formData.append("document", new Blob([fs.readFileSync(documentFile.path)], {
        type: documentFile.mimetype || "application/octet-stream"
    }), documentFile.originalname || "document.jpg");
    formData.append("live", new Blob([fs.readFileSync(liveFile.path)], {
        type: liveFile.mimetype || "application/octet-stream"
    }), liveFile.originalname || "live.jpg");
    const response = await fetch(`${mlBaseUrl}/face-verification/verify`, { method: "POST", body: formData });
    const rawText = await response.text();
    let payload;
    try {
        payload = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new Error("Face verification service returned an invalid response.");
    }
    if (!response.ok) throw new Error(payload?.detail || payload?.message || "Face verification service failed.");
    return payload;
}

async function submitFaceVerificationStep(requestId, applicantId, files) {
    const { request, execution } = await getRequestForFaceVerification(requestId, applicantId);
    const { documentFile, liveFile } = getUploadedFiles(files);
    const updated = await VerificationStepExecution.findOneAndUpdate(
        {
            _id: execution._id,
            verificationRequest: request._id,
            status: { $in: ["pending", "waiting_for_input"] }
        },
        {
            $set: {
                "metadata.verificationType": "face_verification",
                "metadata.documentFilePath": documentFile.path,
                "metadata.liveFilePath": liveFile.path,
                "metadata.documentFileName": documentFile.originalname,
                "metadata.liveFileName": liveFile.originalname,
                "metadata.documentMimeType": documentFile.mimetype,
                "metadata.liveMimeType": liveFile.mimetype
            }
        },
        { returnDocument: "after" }
    );
    if (!updated) throw new Error("Face verification input is already being processed.");
    const coordinator = require("../../workflow-engine.service");
    const result = await coordinator.executeCurrentStep(requestId, applicantId, {
        allowApplicant: true,
        allowWaitingForInput: true
    });
    return {
        success: ["completed", "waiting_for_review"].includes(result.outcome?.status),
        completed: result.outcome?.status === "completed",
        message: result.outcome?.message || "Face verification is already being processed.",
        result: result.outcome?.verificationResult ? {
            automaticDecision: result.outcome.verificationResult.automaticDecision,
            reasonCodes: result.outcome.verificationResult.reasonCodes,
            documentQuality: result.outcome.verificationResult.document.quality.score,
            selfieQuality: result.outcome.verificationResult.selfie.quality.score
        } : result.outcome?.result,
        execution: result.execution,
        verificationRequest: result.request
    };
}

async function execute(context, dependencies = {}) {
    const metadata = context.execution.metadata || {};
    if (dependencies.callMlService) {
        if (!metadata.documentFilePath || !metadata.liveFilePath) {
            return { status: "waiting_for_input", message: "Waiting for the applicant to submit the document image and live selfie." };
        }
        const mlResult = await dependencies.callMlService(
            { path: metadata.documentFilePath, mimetype: metadata.documentMimeType || "image/jpeg", originalname: metadata.documentFileName || "document.jpg" },
            { path: metadata.liveFilePath, mimetype: metadata.liveMimeType || "image/jpeg", originalname: metadata.liveFileName || "live.jpg" }
        );
        if (mlResult?.verified) return { status: "completed", metadata: { mlResult, verifiedAt: new Date() }, result: mlResult,
            message: mlResult.message || "Face verification completed successfully." };
        return { status: "failed", metadata: { mlResult, verifiedAt: new Date() },
            error: { code: "FACE_MISMATCH", message: mlResult?.message || "Face comparison did not match.", retryable: false },
            result: mlResult, message: mlResult?.message || "Face verification failed." };
    }
    if (!metadata.liveFilePath) {
        return {
            status: "waiting_for_input",
            message: "Waiting for the applicant to submit a selfie."
        };
    }
    const findDocument = dependencies.findDocument || (() => VerificationDocument.findOne({
        verificationRequest: context.request._id, isDeleted: false
    }).sort({ createdAt: -1 }));
    const document = await findDocument();
    if (!document) return { status: "waiting_for_input", message: "A supported identity document is required before selfie analysis." };
    const declaredType = document.documentType === "Aadhaar" ? "AADHAAR" : document.documentType;
    if (!["PAN", "AADHAAR"].includes(declaredType)) {
        return { status: "failed", error: { code: "DOCUMENT_UNSUPPORTED_FORMAT",
            message: "Only PAN and Aadhaar are supported by this pipeline.", retryable: false } };
    }
    const runPipeline = dependencies.runPipeline || runVerificationPipeline;
    return runPipeline({
        requestId: context.request._id,
        executionId: context.execution._id,
        attempt: context.execution.attempt,
        documentId: document._id,
        declaredType,
        documentFile: { path: document.filePath, mimetype: document.mimeType, originalname: document.fileName },
        selfieFile: { path: metadata.liveFilePath, mimetype: metadata.liveMimeType || "image/jpeg",
            originalname: metadata.liveFileName || "selfie.jpg" },
        digestKey: process.env.VERIFICATION_RESULT_DIGEST_KEY
    });
}

module.exports = {
    submitFaceVerificationStep,
    execute,
    getRequestForFaceVerification,
    callMlService
};
