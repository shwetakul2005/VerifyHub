const verificationRequestModel = require("../models/verification-request.model");
const workflowTemplateModel = require("../models/workflow-template.model");
const workflowStepModel = require("../models/workflow-step.model");
const userModel = require("../models/user.model");
const VerificationStepExecutionModel = require("../models/verification-step-execution.model");
const faceVerificationService = require("./verification/faceVerification/face-verification.service");
const {
    AccessError,
    requireOrganizationRole,
    requireRequestAccess
} = require("./authorization.service");

async function createVerificationRequest(data, actorId){
    const {organization, workflowTemplate,
        applicant} = data;

    await requireOrganizationRole(actorId, organization, ["org_admin"]);

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

async function getVerificationRequests(organizationId, actorId){
    const { membership } = await requireOrganizationRole(
        actorId,
        organizationId,
        ["org_admin", "verifier", "analyst"]
    );

    const query = { organization: organizationId };
    if (membership.role === "verifier") {
        const assignedWorkflows = await workflowTemplateModel.find({
            organization: organizationId,
            assignedVerifier: actorId
        }).select("_id");
        query.workflowTemplate = { $in: assignedWorkflows.map((workflow) => workflow._id) };
    }
    
    const allData = await verificationRequestModel
                            .find(query)
                            .populate("applicant", "username email")
                            .populate("workflowTemplate", "name")
                            .populate("currentStep", "title stepOrder stepType");

    return allData; 
}

async function getVerificationRequestById(requestId, actorId) {
    await requireRequestAccess(actorId, requestId, {
        allowApplicant: true,
        organizationRoles: ["org_admin", "verifier", "analyst"],
        requireAssignedVerifier: true
    });

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

async function getApplicantWorkflowByRequestId(requestId, userId) {
    await requireRequestAccess(userId, requestId, { allowApplicant: true });

    const verificationRequest = await verificationRequestModel
        .findById(requestId)
        .populate("workflowTemplate")
        .populate("currentStep")
        .populate("applicant");

    if (!verificationRequest) {
        throw new Error("Verification request not found.");
    }

    const requestApplicantId = verificationRequest.applicant?._id
        ? verificationRequest.applicant._id.toString()
        : verificationRequest.applicant?.toString();
    
    if (requestApplicantId !== String(userId)) {
        throw new Error("You are not allowed to access this verification workflow.");
    }
    const workflowSteps = await workflowStepModel
        .find({
            workflowTemplate: verificationRequest.workflowTemplate._id,
            status: "active"
        })
        .sort({ stepOrder: 1 });

    const executions = await VerificationStepExecutionModel.find({ verificationRequest: requestId })
        .lean();

    const executionByStep = new Map(
        executions.map((execution) => [execution.workflowStep.toString(), execution])
    );

    const completedStepIds = new Set(
        executions
            .filter((execution) => execution.status === "completed")
            .map((execution) => execution.workflowStep.toString())
    );

    const failedStepIds = new Set(
        executions
            .filter((execution) => execution.status === "failed")
            .map((execution) => execution.workflowStep.toString())
    );

    const currentStepId = verificationRequest.currentStep?._id
        ? verificationRequest.currentStep._id.toString()
        : null;

    const steps = workflowSteps.map((step) => {
        const stepId = step._id.toString();
        const execution = executionByStep.get(stepId);
        const isFailed = failedStepIds.has(stepId);
        const isCompleted =
            verificationRequest.status === "completed"
                ? true
                : completedStepIds.has(stepId) ||
                  (currentStepId && step.stepOrder < verificationRequest.currentStep.stepOrder);

        let status = "pending";

        if (verificationRequest.status === "completed") {
            status = "completed";
        } else if (isFailed) {
            status = "failed";
        } else if (currentStepId && stepId === currentStepId) {
            status = "current";
        } else if (isCompleted) {
            status = "completed";
        }

        return {
            id: step._id,
            title: step.title,
            description: step.description,
            stepOrder: step.stepOrder,
            stepType: step.stepType,
            isRequired: step.isRequired,
            status,
            isCompleted,
            isFailed,
            isCurrent: status === "current",
            isLocked: status === "pending",
            isViewOnly: status === "completed" || status === "failed",
            canOpen: status === "current" || status === "completed" || status === "failed",
            actionUrl: status === "current" ? `/dashboard/request/${requestId}` : null,
            executionStatus: execution?.status || null,
            completedAt: execution?.completedAt || null
        };
    });

    return {
        requestId: verificationRequest._id,
        overallStatus: verificationRequest.status,
        currentStep: verificationRequest.currentStep
            ? {
                id: verificationRequest.currentStep._id,
                title: verificationRequest.currentStep.title,
                stepOrder: verificationRequest.currentStep.stepOrder,
                stepType: verificationRequest.currentStep.stepType,
                description: verificationRequest.currentStep.description
            }
            : null,
        workflowName: verificationRequest.workflowTemplate?.name || null,
        steps
    };
}

async function submitFaceVerificationStep(requestId, applicantId, files) {
    return await faceVerificationService.submitFaceVerificationStep(requestId, applicantId, files);
}

async function getRequestProgress(requestId, actorId){
    const { request: verificationRequest } = await requireRequestAccess(actorId, requestId, {
        allowApplicant: true,
        organizationRoles: ["org_admin", "verifier", "analyst"],
        requireAssignedVerifier: true
    });

    await verificationRequest.populate("currentStep");
    const {currentStep, workflowTemplate} = verificationRequest;

    if (!workflowTemplate) {
        throw new AccessError("Workflow template not found.", 404);
    }

    const steps = await workflowStepModel.find({
        workflowTemplate: workflowTemplate._id
    }).sort({stepOrder: 1});

    const executions = await VerificationStepExecutionModel.find({
        verificationRequest: requestId
    }).sort({ createdAt: 1 }).lean();
    const executionByStep = new Map(
        executions
            .filter((execution) => execution.workflowStep)
            .map((execution) => [execution.workflowStep.toString(), execution])
    );
    const currentStepId = currentStep?._id?.toString() || null;

    const progress = [];

    for (const step of steps) {
        const execution = executionByStep.get(step._id.toString());
        const status = execution?.status || (
            verificationRequest.status === "in_progress" &&
            currentStepId === step._id.toString()
                ? "in_progress"
                : "pending"
        );

        progress.push({
            title: step.title,
            stepOrder: step.stepOrder,
            status
        });
    }

    return {
        verificationRequestId: verificationRequest._id,

        overallStatus: verificationRequest.status,

        
        currentStep: currentStep ? {
            id: currentStep._id,
            title: currentStep.title,
            stepOrder: currentStep.stepOrder
        } : null,

        progress: progress
    };
}   

module.exports = {createVerificationRequest,
                    getVerificationRequests,
                    getVerificationRequestById,
                    getApplicantWorkflowByRequestId,
    submitFaceVerificationStep,
                    getVerificationRequestByUserId,
                    getRequestProgress
                };

