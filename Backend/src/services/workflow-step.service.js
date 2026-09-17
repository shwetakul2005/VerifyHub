const workflowStepModel = require("../models/workflow-step.model");
const {
    requireWorkflowRole,
    requireWorkflowStepRole
} = require("./authorization.service");

async function createWorkflowStep(data, actorId){
    const {workflowTemplate,stepOrder } = data;
    
    await requireWorkflowRole(actorId, workflowTemplate, ["org_admin"]);
    const isAlreadyStepExists = await workflowStepModel.findOne({workflowTemplate,stepOrder})

    if(isAlreadyStepExists){
        throw new Error("A step with this order already exists in the workflow.")
    }

    const newStep = await workflowStepModel.create(data);
    return newStep;
}

async function getWorkflowSteps(workflowTemplateId, actorId){
    await requireWorkflowRole(
        actorId,
        workflowTemplateId,
        ["org_admin", "verifier", "analyst"]
    );
    const allWorkflowSteps = await workflowStepModel
    .find({workflowTemplate:workflowTemplateId})
    .sort({stepOrder: 1});
    return allWorkflowSteps;
}

async function getWorkflowStepById(stepId, actorId){
    const { step } = await requireWorkflowStepRole(
        actorId,
        stepId,
        ["org_admin", "verifier", "analyst"]
    );
    return step;
}

async function updateWorkflowStep(stepId, data, actorId){
    const { step: workflowStep } = await requireWorkflowStepRole(
        actorId,
        stepId,
        ["org_admin"]
    );

    const title = data.title ?? workflowStep.title;
    const description = data.description ?? workflowStep.description;
    const status = data.status ?? workflowStep.status;
    const stepOrder = data.stepOrder ?? workflowStep.stepOrder;
    const isRequired = data.isRequired ?? workflowStep.isRequired;
    const config = data.config ?? workflowStep.config;


    // Prevent duplicate workflow names within the same organization
    if (stepOrder && stepOrder !== workflowStep.stepOrder) {
        const existingWorkflowStep = await workflowStepModel.findOne({
            workflowTemplate: workflowStep.workflowTemplate,
            stepOrder
        });

        if (existingWorkflowStep) {
            throw new Error("Workflow step with this stepOrder already exists.");
        }

        workflowStep.stepOrder = stepOrder;
    }

    if (title !== undefined) {
        workflowStep.title = title;
    }

    if (config !== undefined) {
        workflowStep.config = config;
    }

    if (isRequired !== undefined) {
        workflowStep.isRequired = isRequired;
    }

    if (description !== undefined) {
        workflowStep.description = description;
    }

    if (status !== undefined) {
        workflowStep.status = status;
    }

    await workflowStep.save();

    return workflowStep;
}

async function deleteWorkflowStep(stepId, actorId){
    const { step: workflowStep } = await requireWorkflowStepRole(
        actorId,
        stepId,
        ["org_admin"]
    );

    await workflowStep.deleteOne();
    return workflowStep;
}

module.exports = {
                    createWorkflowStep, 
                    getWorkflowSteps, 
                    getWorkflowStepById,
                    updateWorkflowStep, 
                    deleteWorkflowStep
                }
