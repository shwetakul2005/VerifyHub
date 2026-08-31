const fs = require("fs");
const VerificationRequestModel = require("../../../models/verification-request.model");
const VerificationStepExecutionModel = require("../../../models/verification-step-execution.model");
const WorkflowStepModel = require("../../../models/workflow-step.model");

async function getOrCreateExecution(verificationRequest) {
    const workflowStep = verificationRequest.currentStep;

    if (!workflowStep || workflowStep.stepType !== "face_verification") {
        throw new Error("Current workflow step is not face verification.");
    }

    let execution = await VerificationStepExecutionModel.findOne({
        verificationRequest: verificationRequest._id,
        workflowStep: workflowStep._id,
    }).sort({ createdAt: -1 });

    if (!execution) {
        execution = await VerificationStepExecutionModel.create({
            verificationRequest: verificationRequest._id,
            workflowStep: workflowStep._id,
            status: "in_progress",
            startedAt: new Date(),
            metadata: {
                verificationType: "face_verification"
            }
        });
    }

    if (execution.status === "completed") {
        throw new Error("Face verification step has already been completed.");
    }

    return execution;
}

async function getRequestForFaceVerification(requestId, applicantId) {
    const verificationRequest = await VerificationRequestModel.findById(requestId)
        .populate("applicant")
        .populate("currentStep");

    if (!verificationRequest) {
        throw new Error("Verification request not found.");
    }

    const applicantMatches = verificationRequest.applicant?._id
        ? verificationRequest.applicant._id.toString() === applicantId.toString()
        : false;

    if (!applicantMatches) {
        throw new Error("You are not authorized to access this verification request.");
    }

    if (verificationRequest.status === "completed") {
        throw new Error("Verification request is already completed.");
    }

    if (!verificationRequest.currentStep) {
        throw new Error("No active workflow step.");
    }

    if (verificationRequest.currentStep.stepType !== "face_verification") {
        throw new Error("Current workflow step is not face verification.");
    }

    return verificationRequest;
}

function getUploadedFiles(files) {
    const documentFile = files?.document?.[0] || files?.document || null;
    const liveFile = files?.live?.[0] || files?.live || null;

    if (!documentFile) {
        throw new Error("Document image is required for identity verification.");
    }

    if (!liveFile) {
        throw new Error("Live selfie is required for identity verification.");
    }

    return { documentFile, liveFile };
}

async function callMlService(documentFile, liveFile) {
    const mlBaseUrl = process.env.ML_SERVICE_URL || "http://localhost:8000";
    const formData = new FormData();

    formData.append(
        "document",
        new Blob([fs.readFileSync(documentFile.path)], { type: documentFile.mimetype || "application/octet-stream" }),
        documentFile.originalname || "document.jpg"
    );

    formData.append(
        "live",
        new Blob([fs.readFileSync(liveFile.path)], { type: liveFile.mimetype || "application/octet-stream" }),
        liveFile.originalname || "live.jpg"
    );

    const response = await fetch(`${mlBaseUrl}/face-verification/verify`, {
        method: "POST",
        body: formData,
    });

    const rawText = await response.text();
    let payload;

    try {
        payload = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
        throw new Error(`Invalid response from ML service: ${rawText}`);
    }

    if (!response.ok) {
        const message = payload?.detail || payload?.message || "Face verification service rejected the request.";
        throw new Error(message);
    }

    return payload;
}

async function submitFaceVerificationStep(requestId, applicantId, files) {
    const verificationRequest = await getRequestForFaceVerification(requestId, applicantId);
    const { documentFile, liveFile } = getUploadedFiles(files);

    const execution = await getOrCreateExecution(verificationRequest);

    execution.status = "in_progress";
    execution.startedAt = execution.startedAt || new Date();
    execution.metadata = {
        ...(execution.metadata || {}),
        verificationType: "face_verification",
        documentFilePath: documentFile.path,
        liveFilePath: liveFile.path,
        documentFileName: documentFile.originalname,
        liveFileName: liveFile.originalname,
        documentMimeType: documentFile.mimetype,
        liveMimeType: liveFile.mimetype
    };
    await execution.save();

    const mlResult = await callMlService(documentFile, liveFile);

    execution.metadata = {
        ...(execution.metadata || {}),
        mlResult,
        verifiedAt: new Date()
    };

    if (mlResult?.verified) {
        execution.status = "completed";
        execution.completedAt = new Date();
        await execution.save();

        const workflowEngineService = require("../../workflow-engine.service");
        const nextRequest = await workflowEngineService.moveToNextStep(requestId);

        return {
            success: true,
            completed: true,
            message: mlResult?.message || "Face verification passed.",
            result: mlResult,
            verificationRequest: nextRequest,
            execution
        };
    }

    execution.status = "failed";
    execution.completedAt = new Date();
    await execution.save();

    return {
        success: false,
        completed: false,
        message: mlResult?.message || "Face verification failed.",
        result: mlResult,
        execution
    };
}

async function execute(verificationRequest) {
    const execution = await VerificationStepExecutionModel.findOne({
        verificationRequest: verificationRequest._id,
        workflowStep: verificationRequest.currentStep._id,
    }).sort({ createdAt: -1 });

    if (!execution || !execution.metadata?.documentFilePath || !execution.metadata?.liveFilePath) {
        return {
            success: false,
            completed: false,
            message: "Waiting for the applicant to submit the document image and live selfie."
        };
    }

    const documentFile = {
        path: execution.metadata.documentFilePath,
        mimetype: execution.metadata.documentMimeType || "image/jpeg",
        originalname: execution.metadata.documentFileName || "document.jpg"
    };

    const liveFile = {
        path: execution.metadata.liveFilePath,
        mimetype: execution.metadata.liveMimeType || "image/jpeg",
        originalname: execution.metadata.liveFileName || "live.jpg"
    };

    try {
        const mlResult = await callMlService(documentFile, liveFile);

        execution.metadata = {
            ...(execution.metadata || {}),
            mlResult,
            verifiedAt: new Date()
        };

        if (mlResult?.verified) {
            execution.status = "completed";
            execution.completedAt = new Date();
            await execution.save();

            return {
                success: true,
                completed: true,
                result: mlResult,
                message: mlResult.message || "Face verification completed successfully."
            };
        }

        execution.status = "failed";
        execution.completedAt = new Date();
        await execution.save();

        return {
            success: false,
            completed: false,
            result: mlResult,
            message: mlResult.message || "Face verification failed."
        };
    } catch (error) {
        execution.status = "failed";
        execution.completedAt = new Date();
        execution.metadata = {
            ...(execution.metadata || {}),
            mlError: error.message
        };
        await execution.save();

        return {
            success: false,
            completed: false,
            message: error.message
        };
    }
}

module.exports = {
    submitFaceVerificationStep,
    execute,
    getRequestForFaceVerification,
    getOrCreateExecution
};
