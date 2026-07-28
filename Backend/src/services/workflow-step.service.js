const workflowStepModel = require("../models/workflow-step.model");
const workflowTemplateModel = require("../models/workflow-template.model");

async function createWorkflowStep(data){
    const {workflowTemplate,stepOrder } = data;
    
    const findTemplateById = await workflowTemplateModel.findById(workflowTemplate);
    if(!findTemplateById){
        throw new Error("Workflow template not valid.");
    }
    const isAlreadyStepExists = await workflowStepModel.findOne({workflowTemplate,stepOrder})

    if(isAlreadyStepExists){
        throw new Error("A step with this order already exists in the workflow.")
    }

    const newStep = await workflowStepModel.create(data);
    return newStep;
}

async function getWorkflowSteps(workflowTemplateId){
    const allWorkflowSteps = await workflowStepModel
    .find({workflowTemplate:workflowTemplateId})
    .sort({stepOrder: 1});
    return allWorkflowSteps;
}

async function getWorkflowStepById(stepId){
    const step = await workflowStepModel.findById(stepId);
    if (!step) {
        throw new Error("Workflow step not found.");
    }
    return step;
}

async function updateWorkflowStep(stepId, data){

    const workflowStep = await workflowStepModel.findById(stepId);

    if (!workflowStep) {
        throw new Error("Workflow step not found.");
    }

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

async function deleteWorkflowStep(stepId){
    const workflowStep = await workflowStepModel.findById(stepId);
    if(!workflowStep){
        throw new Error("Workflow step not found.");
    }

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