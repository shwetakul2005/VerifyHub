const workflowStepModel = require("../models/workflow-step.model");
const workflowTemplateModel = require("../models/workflow-template.model");
const VerificationRequest = require("../models/verification-request.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const AuditLog = require("../models/audit-log.model");
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
        const existing = await workflowStepModel.findOne({ workflowTemplate, stepOrder, archivedAt: null }).session(session);
        if (existing) throw new WorkflowDefinitionError("A step with this order already exists in the workflow.");
        const [created] = await workflowStepModel.create([data], { session });
        await AuditLog.create([{
            organization: workflow.organization,
            action: "step_added",
            actor: actorId,
            actorType: "user",
            target: created._id,
            targetModel: "WorkflowStep",
            transition: { toState: created.status, command: "create" },
            details: { stepOrder: created.stepOrder, stepType: created.stepType }
        }], { session });
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
    .find({ workflowTemplate: workflowTemplateId, archivedAt: null })
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
    if (workflowStep.archivedAt) {
        throw new WorkflowDefinitionError("Archived workflow steps are immutable.", "WORKFLOW_STEP_ARCHIVED");
    }

    return mutateDraftStep(workflowStep.workflowTemplate, async (session) => {
        if (data.stepOrder !== undefined && data.stepOrder !== workflowStep.stepOrder) {
            const existing = await workflowStepModel.findOne({
                workflowTemplate: workflowStep.workflowTemplate,
                stepOrder: data.stepOrder,
                archivedAt: null
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
        await AuditLog.create([{
            organization: workflow.organization,
            action: "step_updated",
            actor: actorId,
            actorType: "user",
            target: updated._id,
            targetModel: "WorkflowStep",
            transition: { fromState: workflowStep.status, toState: updated.status, command: "update" },
            details: { stepOrder: updated.stepOrder, stepType: updated.stepType }
        }], { session });
        return updated;
    });
}

async function deleteWorkflowStep(stepId, actorId, reason = "Removed by organization administrator"){
    const { step: workflowStep, workflow } = await requireWorkflowStepRole(
        actorId,
        stepId,
        ["org_admin"]
    );
    assertDraftWorkflow(workflow);
    if (workflowStep.archivedAt) return workflowStep;

    return mutateDraftStep(workflowStep.workflowTemplate, async (session) => {
        const referencedExecution = await VerificationStepExecution.exists({ workflowStep: stepId }).session(session);
        const referencedSnapshot = await VerificationRequest.exists({
            "workflowSnapshot.steps.workflowStep": stepId
        }).session(session);
        if (referencedExecution || referencedSnapshot) {
            const archived = await workflowStepModel.findOneAndUpdate(
                { _id: stepId, archivedAt: null },
                {
                    $set: {
                        status: "inactive",
                        archivedAt: new Date(),
                        archivedBy: actorId,
                        archiveReason: reason
                    }
                },
                { session, returnDocument: "after", runValidators: true }
            );
            if (!archived) throw new WorkflowDefinitionError("Workflow step is already archived.");
            await AuditLog.create([{
                organization: workflow.organization,
                action: "step_removed",
                actor: actorId,
                actorType: "user",
                target: workflowStep._id,
                targetModel: "WorkflowStep",
                transition: { fromState: workflowStep.status, toState: "archived", command: "archive", reason }
            }], { session });
            return archived;
        }
        const deletion = await workflowStepModel.deleteOne({ _id: stepId, archivedAt: null }, { session });
        if (deletion.deletedCount !== 1) throw new WorkflowDefinitionError("Workflow step no longer exists.");
        await AuditLog.create([{
            organization: workflow.organization,
            action: "step_removed",
            actor: actorId,
            actorType: "user",
            target: workflowStep._id,
            targetModel: "WorkflowStep",
            transition: { fromState: workflowStep.status, command: "delete", reason }
        }], { session });
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
