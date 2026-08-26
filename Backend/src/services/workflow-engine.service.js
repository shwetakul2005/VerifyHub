const emailVerificationService = require("./verification/emailVerification/email-verification.service");
const phoneVerificationService = require("./verification/phone-verification.service");
const documentVerificationService = require("./verification/documentVerification/document-verification.service");
const policeVerificationService = require("./verification/police-verification.service");
const medicalVerificationService = require("./verification/medical-verification.service");
const VerificationRequestModel = require("../models/verification-request.model");
const WorkflowStepModel = require("../models/workflow-step.model");
const VerificationStepExecutionModel = require("../models/verification-step-execution.model");

function applicantCanContinue(step) {
    return step.config?.allowApplicantToContinueWhilePending !== false;
}

async function startVerification(requestId){
    const verificationRequest = await VerificationRequestModel.findById(requestId);
    if(!verificationRequest) {
        throw new Error("Verification Request not found.");
    }
    if(verificationRequest.status != "pending"){
        throw new Error("Verification request has been started.");
    }
    verificationRequest.status = "in_progress";
    verificationRequest.startedAt = new Date();
    await verificationRequest.save();
    console.log("reached here000");
    await executeCurrentStep(requestId);
    console.log("reached here");
    return verificationRequest;
}

async function executeCurrentStep(requestId){
    const verificationRequest = await VerificationRequestModel.findById(requestId);
    if(!verificationRequest){
        throw new Error("Verification Request dosen't exist.");
    }
    await verificationRequest.populate("currentStep");
    if (!verificationRequest.currentStep) {
        throw new Error("Current workflow step not found.");
    }
    
    switch (verificationRequest.currentStep.stepType) {
        case "email": {
            const result = await emailVerificationService.execute(verificationRequest);

            if (result.completed) {
                return await moveToNextStep(requestId);
            }

            return result;
        }
            
        case "phone": {
            const result = await phoneVerificationService.execute(verificationRequest);

            if (result.completed) {
                return await moveToNextStep(requestId);
            }

            return result;
        }
                
        case "document": {
            const result =
                await documentVerificationService.execute(
                    verificationRequest
                );

            if (result.completed) {
                return await moveToNextStep(requestId);
            }

            if (result.success && applicantCanContinue(verificationRequest.currentStep)) {
                return await moveToNextStep(requestId);
            }

            return result;
        }

        case "police":{
            const result = await policeVerificationService.execute(verificationRequest);
            if (result.completed) {
                return await moveToNextStep(requestId);
            }

            return result;
        }
        case "medical":{
            const result = await medicalVerificationService.execute(verificationRequest);
            if (result.completed) {
                return await moveToNextStep(requestId);
            }

            return result;
        }
        default:
            throw new Error("Invalid workflow step.");
    }
}

async function moveToNextStep(requestId){
    const verificationRequest = await VerificationRequestModel.findById(requestId).populate("currentStep");
    if(!verificationRequest){
        throw new Error("Verification Request dosen't exist.");
    }

    if (!verificationRequest.currentStep) {
        return await completeVerification(requestId);
    }

    const nextStep = await WorkflowStepModel.findOne({
        workflowTemplate: verificationRequest.workflowTemplate,
        stepOrder: { $gt: verificationRequest.currentStep.stepOrder },
        status: "active"
    }).sort({stepOrder:1})

    if(!nextStep){
        return await completeVerification(requestId);
    }
    verificationRequest.currentStep = nextStep._id;
    await verificationRequest.save();
    return await executeCurrentStep(verificationRequest._id);
    // return verificationRequest;
}

async function completeVerification(requestId){
    const verificationRequest = await VerificationRequestModel.findById(requestId);
    if(!verificationRequest){
        throw new Error("Verification Request dosen't exist.");
    }
    const requiredSteps = await WorkflowStepModel.find({
        workflowTemplate: verificationRequest.workflowTemplate,
        status: "active",
        isRequired: true
    }).select("_id");

    const completedExecutions = await VerificationStepExecutionModel.find({
        verificationRequest: requestId,
        status: "completed"
    }).select("workflowStep");

    const completedStepIds = new Set(
        completedExecutions.map((execution) => execution.workflowStep.toString())
    );
    const allRequiredStepsCompleted = requiredSteps.every((step) =>
        completedStepIds.has(step._id.toString())
    );

    verificationRequest.status = allRequiredStepsCompleted
        ? "completed"
        : "in_progress";
    verificationRequest.currentStep = null;
    verificationRequest.completedAt = allRequiredStepsCompleted
        ? new Date()
        : null;

    await verificationRequest.save();
    return verificationRequest;
}

module.exports = {
    startVerification,
    executeCurrentStep,
    moveToNextStep,
    completeVerification
};