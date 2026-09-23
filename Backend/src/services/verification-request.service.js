const verificationRequestModel = require("../models/verification-request.model");
const workflowTemplateModel = require("../models/workflow-template.model");
const workflowStepModel = require("../models/workflow-step.model");
const userModel = require("../models/user.model");
const VerificationStepExecutionModel = require("../models/verification-step-execution.model");
const AuditLogModel = require("../models/audit-log.model");
const mongoose = require("mongoose");
const faceVerificationService = require("./verification/faceVerification/face-verification.service");
const { WorkflowDefinitionError } = require("../domain/workflow-definition");
const {
    AccessError,
    requireOrganizationRole,
    requireRequestAccess
} = require("./authorization.service");

async function createVerificationRequest(data, actorId){
    const {organization, workflowTemplate,
        applicant} = data;

    await requireOrganizationRole(actorId, organization, ["org_admin"]);
    const applicantExists = await userModel.findById(applicant);
    if(!applicantExists){
        throw new AccessError("Applicant doesn't exist.", 400);
    }

    const availableWorkflow = await workflowTemplateModel.exists({
        _id: workflowTemplate,
        organization,
        status: "published",
        archivedAt: null
    });
    if (!availableWorkflow) {
        throw new WorkflowDefinitionError("A request requires a published, non-archived workflow in this organization.");
    }

    const indexes = await VerificationStepExecutionModel.collection.listIndexes().toArray()
        .catch((error) => {
            if (error.code === 26) return [];
            throw error;
        });
    const executionIndex = indexes.find((index) => index.name === "unique_request_step_execution");
    if (!executionIndex?.unique ||
        JSON.stringify(executionIndex.key) !== JSON.stringify({ verificationRequest: 1, workflowStep: 1 })) {
        const error = new Error("Request creation is unavailable until the unique execution index is installed.");
        error.statusCode = 503;
        throw error;
    }

    const session = await mongoose.startSession();
    let createdRequest;
    try {
        await session.withTransaction(async () => {
            const workflow = await workflowTemplateModel.findOne({
                _id: workflowTemplate,
                organization,
                status: "published",
                archivedAt: null
            }).session(session).lean();
            if (!workflow) {
                throw new WorkflowDefinitionError("A request requires a published, non-archived workflow in this organization.");
            }
            const steps = await workflowStepModel.find({
                workflowTemplate,
                status: "active",
                archivedAt: null
            }).sort({ stepOrder: 1 }).session(session).lean();
            if (steps.length === 0) {
                throw new WorkflowDefinitionError("Published workflow has no active steps.");
            }
            const snapshotSteps = steps.map((step) => ({
                workflowStep: step._id,
                stepOrder: step.stepOrder,
                stepType: step.stepType,
                title: step.title,
                description: step.description,
                isRequired: step.isRequired,
                maxRetries: step.maxRetries,
                config: step.config
            }));
            const [request] = await verificationRequestModel.create([{
                organization,
                workflowTemplate,
                workflowVersion: workflow._id,
                workflowSnapshot: {
                    version: workflow.version,
                    name: workflow.name,
                    description: workflow.description,
                    assignedVerifier: workflow.assignedVerifier,
                    steps: snapshotSteps
                },
                applicant,
                status: "pending",
                currentStep: steps[0]._id,
                startedAt: null,
                schemaVersion: 2
            }], { session });
            createdRequest = request;
            await VerificationStepExecutionModel.insertMany(snapshotSteps.map((step) => ({
                verificationRequest: request._id,
                workflowStep: step.workflowStep,
                stepOrder: step.stepOrder,
                stepSnapshot: {
                    stepType: step.stepType,
                    title: step.title,
                    description: step.description,
                    isRequired: step.isRequired,
                    maxRetries: step.maxRetries,
                    config: step.config
                },
                maxRetries: step.maxRetries,
                status: "pending",
                schemaVersion: 2
            })), { session });
            await AuditLogModel.create([{
                organization,
                action: "request_created",
                actor: actorId,
                actorType: "user",
                target: request._id,
                targetModel: "VerificationRequest",
                transition: { toState: "pending", command: "create" }
            }], { session });
        });
    } finally {
        await session.endSession();
    }
    return createdRequest;

}

async function getVerificationRequests(organizationId, actorId){
    const { membership } = await requireOrganizationRole(
        actorId,
        organizationId,
        ["org_admin", "verifier", "analyst"]
    );

    const query = { organization: organizationId, archivedAt: null };
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
        .find({ applicant: userId, archivedAt: null })
        .populate("organization")
        .populate("workflowTemplate")
        .populate("currentStep");

    if(!verificationRequests){
        throw new Error("No verification requsts found.")
    }

    return verificationRequests;

    
}

async function resolveRequestSteps(verificationRequest, legacyFilter = {}) {
    const snapshotSteps = verificationRequest.workflowSnapshot?.steps || [];
    if (snapshotSteps.length > 0) {
        return snapshotSteps
            .map((step) => ({
                _id: step.workflowStep,
                stepOrder: step.stepOrder,
                stepType: step.stepType,
                title: step.title,
                description: step.description,
                isRequired: step.isRequired,
                maxRetries: step.maxRetries,
                config: step.config
            }))
            .sort((left, right) => left.stepOrder - right.stepOrder);
    }
    const workflowId = verificationRequest.workflowTemplate?._id || verificationRequest.workflowTemplate;
    if (!workflowId) throw new AccessError("Workflow template not found.", 404);
    return workflowStepModel.find({ workflowTemplate: workflowId, ...legacyFilter }).sort({ stepOrder: 1 });
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
    const workflowSteps = await resolveRequestSteps(verificationRequest, { status: "active" });

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
        workflowName: verificationRequest.workflowSnapshot?.name || verificationRequest.workflowTemplate?.name || null,
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
    const { currentStep } = verificationRequest;

    const steps = await resolveRequestSteps(verificationRequest);

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

async function archiveVerificationRequest(requestId, actorId, reason = "Archived by organization administrator") {
    const { request } = await requireRequestAccess(actorId, requestId, {
        organizationRoles: ["org_admin"]
    });
    if (request.archivedAt) return request;
    if (!["completed", "rejected", "cancelled"].includes(request.status)) {
        throw new WorkflowDefinitionError(
            "Only completed, rejected, or cancelled requests can be archived.",
            "REQUEST_NOT_TERMINAL"
        );
    }

    const session = await mongoose.startSession();
    let archived;
    try {
        await session.withTransaction(async () => {
            const current = await verificationRequestModel.findById(requestId).session(session);
            if (!current) throw new AccessError("Verification request not found.", 404);
            if (current.archivedAt) {
                archived = current;
                return;
            }
            if (!["completed", "rejected", "cancelled"].includes(current.status)) {
                throw new WorkflowDefinitionError(
                    "Only completed, rejected, or cancelled requests can be archived.",
                    "REQUEST_NOT_TERMINAL"
                );
            }
            archived = await verificationRequestModel.findOneAndUpdate(
                { _id: current._id, archivedAt: null, status: current.status },
                { $set: { archivedAt: new Date(), archivedBy: actorId, archiveReason: reason } },
                { session, returnDocument: "after", runValidators: true }
            );
            if (!archived) throw new WorkflowDefinitionError("Verification request changed concurrently.");
            await AuditLogModel.create([{
                organization: current.organization,
                action: "request_archived",
                actor: actorId,
                actorType: "user",
                target: current._id,
                targetModel: "VerificationRequest",
                transition: { fromState: current.status, toState: current.status, command: "archive", reason }
            }], { session });
        });
    } finally {
        await session.endSession();
    }
    return archived;
}

module.exports = {createVerificationRequest,
                    getVerificationRequests,
                    getVerificationRequestById,
                    getApplicantWorkflowByRequestId,
    submitFaceVerificationStep,
                    getVerificationRequestByUserId,
                    getRequestProgress,
                    archiveVerificationRequest
                };

