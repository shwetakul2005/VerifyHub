const OrganizationModel = require("../models/organization.model");
const workflowTemplateModel = require("../models/workflow-template.model");
const UserModel = require("../models/user.model");
async function createWorkflowTemplate(data){
    
   const {
        name,
        organization,
        description,
        status,
        createdBy,
        assignedVerifier
        } = data;

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

    const createdWorkflow = await workflowTemplateModel.create(data);
    return createdWorkflow;

}


async function getWorkflowTemplates(organizationId)
{
    const allWorkflows = await workflowTemplateModel.find({organization:organizationId});
    return allWorkflows;
}

async function getWorkflowTemplateById(id)
{
    const allWorkflows = await workflowTemplateModel.findById(id);
    if (!allWorkflows) {
        throw new Error("Workflow template not found.");
    }
    return allWorkflows;
}

async function updateWorkflowTemplate(workflowId, data) {
    const { name, description, status } = data;

    const workflow = await workflowTemplateModel.findById(workflowId);

    if (!workflow) {
        throw new Error("Workflow template not found.");
    }

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

async function deleteWorkflowTemplate(id)
{
    const workflow = await workflowTemplateModel.findById(id);
    if(!workflow){
        throw new Error("Workflow template not found.");
    }

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