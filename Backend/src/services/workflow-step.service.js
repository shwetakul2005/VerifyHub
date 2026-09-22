const workflowStepModel = require("../models/workflow-step.model");
const workflowTemplateModel = require("../models/workflow-template.model");
const mongoose = require("mongoose");
const {
    requireWorkflowRole,
    requireWorkflowStepRole
} = require("./authorization.service");
const { assertDraftWorkflow, WorkflowDefinitionError } = require("../domain/workflow-definition");

async function mutateDraftStep(workflowId, mutation) {
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const claimed = await workflowTemplateModel.updateOne(
                { _id: workflowId, status: "draft" },
                { $inc: { definitionRevision: 1 } },
                { session }
            );
            if (claimed.modifiedCount !== 1) {
                throw new WorkflowDefinitionError("Workflow is no longer an editable draft.");
            }
            result = await mutation(session);
        });
        return result;
    } finally {
        await session.endSession();
    }
}

async function createWorkflowStep(data, actorId){
    const {workflowTemplate,stepOrder } = data;
    
    const { workflow } = await requireWorkflowRole(actorId, workflowTemplate, ["org_admin"]);
    assertDraftWorkflow(workflow);
    return mutateDraftStep(workflowTemplate, async (session) => {
        const existing = await workflowStepModel.findOne({ workflowTemplate, stepOrder }).session(session);
        if (existing) throw new WorkflowDefinitionError("A step with this order already exists in the workflow.");
        const [created] = await workflowStepModel.create([data], { session });
        return created;
    });
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
    const { step: workflowStep, workflow } = await requireWorkflowStepRole(
        actorId,
        stepId,
        ["org_admin"]
    );
    assertDraftWorkflow(workflow);

    return mutateDraftStep(workflowStep.workflowTemplate, async (session) => {
        if (data.stepOrder !== undefined && data.stepOrder !== workflowStep.stepOrder) {
            const existing = await workflowStepModel.findOne({
                workflowTemplate: workflowStep.workflowTemplate,
                stepOrder: data.stepOrder
            }).session(session);
            if (existing) {
                throw new WorkflowDefinitionError("Workflow step with this stepOrder already exists.");
            }
        }
        const updated = await workflowStepModel.findByIdAndUpdate(
            stepId,
            { $set: data },
            { session, returnDocument: "after", runValidators: true }
        );
        if (!updated) throw new WorkflowDefinitionError("Workflow step no longer exists.");
        return updated;
    });
}

async function deleteWorkflowStep(stepId, actorId){
    const { step: workflowStep, workflow } = await requireWorkflowStepRole(
        actorId,
        stepId,
        ["org_admin"]
    );
    assertDraftWorkflow(workflow);

    return mutateDraftStep(workflowStep.workflowTemplate, async (session) => {
        await workflowStepModel.deleteOne({ _id: stepId }, { session });
        return workflowStep;
    });
}

module.exports = {
                    createWorkflowStep, 
                    getWorkflowSteps, 
                    getWorkflowStepById,
                    updateWorkflowStep, 
                    deleteWorkflowStep
                }
