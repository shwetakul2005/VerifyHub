const verificationRequestModel = require("../models/verification-request.model");
const organizationModel = require("../models/organization.model");
const workflowTemplateModel = require("../models/workflow-template.model");
const workflowStepModel = require("../models/workflow-step.model");
const userModel = require("../models/user.model");


async function createVerificationRequest(data){
    const {organization, workflowTemplate,
        applicant} = data;

    const organizationExists = await organizationModel.findById(organization);
    if(!organizationExists){
        throw new Error("Organization dosen't exist.");
    }

    const workflowTemplateExists = await workflowTemplateModel.findById(workflowTemplate);
    if(!workflowTemplateExists){
        throw new Error("Workflow template dosen't exist.");
    }

    const applicantExists = await userModel.findById(applicant);
    if(!applicantExists){
        throw new Error("Applicant dosen't exist.");
    }

    if(!workflowTemplateExists.organization.equals(organization)){
        throw new Error("Worktemplate dosen't belong to your organization.")
    }
    
    const activeStep = await workflowStepModel.findOne({workflowTemplate, status: "active"}).sort({ stepOrder: 1 });
    if(!activeStep){
        throw new Error("No active steps found.");
    }
    const verificationRequestData = {
        organization,
        workflowTemplate,
        applicant,
        status: "pending",
        currentStep: activeStep._id,
        startedAt: new Date()
    };

    const newReq = await verificationRequestModel.create(verificationRequestData);
    return newReq;

}

async function getVerificationRequests(organizationId){    
    
    const allData = await verificationRequestModel
                            .find({organization: organizationId})
                            .populate("applicant", "username email")
                            .populate("workflowTemplate", "name")
                            .populate("currentStep", "title stepOrder stepType");

    return allData; 
}

async function getVerificationRequestById(requestId) {
    const verificationRequest = await verificationRequestModel
        .findById(requestId)
        .populate("organization")
        .populate("workflowTemplate")
        .populate("applicant")
        .populate("currentStep");

    if (!verificationRequest) {
        throw new Error("Verification request not found.");
    }

    return verificationRequest;
}

async function getVerificationRequestByUserId(userId) {

    // const userExists = await userModel.findById(userId);
    // if(!userExists){
    //     throw new Error("User does not exist.");
    // }
    console.log(userId);
    const verificationRequests = await verificationRequestModel
        .find({applicant:userId})
        .populate("organization")
        .populate("workflowTemplate")
        .populate("currentStep");

    if(!verificationRequests){
        throw new Error("No verification requsts found.")
    }

    return verificationRequests;

    
}

async function updateVerificationRequest(requestId, data) {
    const { status, currentStep, completedAt } = data;

    const verificationRequest = await verificationRequestModel.findById(requestId);

    if (!verificationRequest) {
        throw new Error("Verification request not found.");
    }

    if (status !== undefined) {
        verificationRequest.status = status;
    }

    if (currentStep !== undefined) {
        verificationRequest.currentStep = currentStep;
    }

    if (completedAt !== undefined) {
        verificationRequest.completedAt = completedAt;
    }

    await verificationRequest.save();

    return verificationRequest;
}

async function deleteVerificationRequest(requestId) {
    const verificationRequest = await verificationRequestModel.findById(requestId);

    if (!verificationRequest) {
        throw new Error("Verification request not found.");
    }

    await verificationRequest.deleteOne();

    return verificationRequest;
}

async function progressRequestController(requestId){
    const verificationRequest = await verificationRequestModel.findById(requestId).populate("currentStep").populate("workflowTemplate");
    const {status} = verificationRequest;
    const {currentStep, workflowTemplate} = verificationRequest;
    const steps = await workflowStepModel.find({
        workflowTemplate: workflowTemplate
    }).sort({stepOrder: 1});

    const progress = [];

    for (const step of steps) {

        let status;

        if (step.stepOrder < currentStep.stepOrder || verificationRequest.status === "completed") {
            status = "completed";
        }
        else if (step.stepOrder === currentStep.stepOrder) {
            status = "in_progress";
        }
        else {
            status = "pending";
        }

        progress.push({
            title: step.title,
            stepOrder: step.stepOrder,
            status
        });
    }

    return {
        verificationRequestId: verificationRequest._id,

        overallStatus: verificationRequest.status,

        
        currentStep: {
            id: verificationRequest.currentStep._id,
            title: verificationRequest.currentStep.title,
            stepOrder: verificationRequest.currentStep.stepOrder
        },

        progress: progress
    };
}   

module.exports = {createVerificationRequest,
                    getVerificationRequests,
                    getVerificationRequestById,
                    updateVerificationRequest,
                    deleteVerificationRequest,
                    progressRequestController,
                    getVerificationRequestByUserId
                };

