const emailVerificationService = require("./verification/email-verification.service");
const phoneVerificationService = require("./verification/phone-verification.service");
const documentVerificationService = require("./verification/document-verification.service");
const policeVerificationService = require("./verification/police-verification.service");
const medicalVerificationService = require("./verification/medical-verification.service");
const VerificationRequestModel = require("../models/verification-request.model");
const WorkflowStepModel = require("../models/workflow-step.model");

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

    return await executeCurrentStep(requestId);
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
        case "email":
            const result = await emailVerificationService.execute(verificationRequest);
            if(result.completed){
                return await moveToNextStep(requestId);
            }
            return result;

        case "phone":
            return await phoneVerificationService.execute(verificationRequest);

        case "document":
            return await documentVerificationService.execute(verificationRequest);

        case "police":
            return await policeVerificationService.execute(verificationRequest);

        case "medical":
            return await medicalVerificationService.execute(verificationRequest);

        default:
            throw new Error("Invalid workflow step.");
    }
}

async function moveToNextStep(requestId){
    const verificationRequest = await VerificationRequestModel.findById(requestId).populate("currentStep");
    if(!verificationRequest){
        throw new Error("Verification Request dosen't exist.");
    }

    const nextStep = await WorkflowStepModel.findOne({
        workflowTemplate: verificationRequest.workflowTemplate,
        stepOrder: { $gt: verificationRequest.currentStep.stepOrder },
        status: "active"
    }).sort({stepOrder:1})

    if(!nextStep){
        // verificationRequest.status == "completed";
        // await verificationRequest.save();
        return await completeVerification(requestId);
    }
    verificationRequest.currentStep = nextStep._id;
    await verificationRequest.save();
    return verificationRequest;
}

async function completeVerification(requestId){
    const verificationRequest = await VerificationRequestModel.findById(requestId);
    if(!verificationRequest){
        throw new Error("Verification Request dosen't exist.");
    }
    verificationRequest.status = "completed";
    verificationRequest.completedAt = new Date();

    await verificationRequest.save();
    return verificationRequest;
}

module.exports = {
    startVerification,
    executeCurrentStep,
    moveToNextStep,
    completeVerification
};