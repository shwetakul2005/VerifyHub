const workflowTemplateModel = require("../models/workflow-template.model");
const UserModel = require("../models/user.model");
const {
    requireOrganizationRole,
    requireWorkflowRole,
    idEquals
} = require("./authorization.service");

async function createWorkflowTemplate(data, actorId){
    
   const {
        name,
        organization,
        description,
        assignedVerifier
        } = data;

    await requireOrganizationRole(actorId, organization, ["org_admin"]);

    const existingWorkflow = await workflowTemplateModel.findOne({name, organization});

    if(existingWorkflow) {
        throw new Error("Workflow template already exists.");
    }

    const verifier = await UserModel.findOne({
        _id: assignedVerifier,
        role: "verifier"
    });

    if (!verifier) {
        throw new Error("Invalid verifier selected.");
    }

    const verifierAccess = await requireOrganizationRole(
        assignedVerifier,
        organization,
        ["verifier"]
    );

    if (!idEquals(verifierAccess.membership.user, assignedVerifier)) {
        throw new Error("Selected verifier does not belong to this organization.");
    }

    const createdWorkflow = await workflowTemplateModel.create({
        ...data,
        createdBy: actorId,
        status: "draft"
    });
    return createdWorkflow;

}


async function getWorkflowTemplates(organizationId, actorId)
{
    await requireOrganizationRole(
        actorId,
        organizationId,
        ["org_admin", "verifier", "analyst"]
    );
    const allWorkflows = await workflowTemplateModel.find({organization:organizationId});
    return allWorkflows;
}

async function getWorkflowTemplateById(id, actorId)
{
    const { workflow } = await requireWorkflowRole(
        actorId,
        id,
        ["org_admin", "verifier", "analyst"]
    );
    return workflow;
}

async function updateWorkflowTemplate(workflowId, data, actorId) {
    const { name, description, status } = data;

    const { workflow } = await requireWorkflowRole(
        actorId,
        workflowId,
        ["org_admin"]
    );

    // Prevent duplicate workflow names within the same organization
    if (name && name !== workflow.name) {
        const existingWorkflow = await workflowTemplateModel.findOne({
            organization: workflow.organization,
            name
        });

        if (existingWorkflow) {
            throw new Error("Workflow template with this name already exists.");
        }

        workflow.name = name;
    }

    if (description !== undefined) {
        workflow.description = description;
    }

    if (status !== undefined) {
        workflow.status = status;
    }

    await workflow.save();

    return workflow;
}

async function deleteWorkflowTemplate(id, actorId)
{
    const { workflow } = await requireWorkflowRole(actorId, id, ["org_admin"]);

    await workflow.deleteOne();
    return workflow;
}


module.exports = {
                    createWorkflowTemplate, 
                    getWorkflowTemplates, 
                    getWorkflowTemplateById,
                    updateWorkflowTemplate, 
                    deleteWorkflowTemplate
                }
