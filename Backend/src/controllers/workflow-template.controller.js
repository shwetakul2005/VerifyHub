const workflowTemplateServices = require("../services/workflow-template.service");

async function createWorkflowTemplateController(req,res) {
    const data = req.body;
    let workflowTemplate;
    try{
        workflowTemplate = await workflowTemplateServices.createWorkflowTemplate(data);
    }
    catch(err){
        return res.status(404).json({
            success: false,
            message: err.message
        })
    }

    return res.status(201).json({
        success: true,
        message: "Workflow Template created successfully",
        workflowTemplate
    })
}


async function getWorkflowTemplatesController(req,res) {
    const { organizationId } = req.query;
    let workflowTemplates;
    try{
        workflowTemplates = await workflowTemplateServices.getWorkflowTemplates(organizationId);
    }
    catch(err){
        return res.status(404).json({
            success: false,
            message: err.message
        })
    }

    return res.status(200).json({
        success: true,
        message: "Workflow templates fetched successfully.",
        workflowTemplates
    })
}


async function getWorkflowTemplateByIdController(req,res) {
    const workflowTemplateId = req.params.id;
    let workflowTemplate;
    try{
        workflowTemplate = await workflowTemplateServices.getWorkflowTemplateById(workflowTemplateId);
    }
    catch(err){
        return res.status(404).json({
            success: false,
            message: err.message
        })
    }

    return res.status(200).json({
        success: true,
        message: "Workflow template fetched successfully.",
        workflowTemplate
    })
}


async function updateWorkflowTemplateController(req,res) {
    const workflowTemplateId = req.params.id;
    const data = req.body;
    let workflowTemplate;
    try{
        workflowTemplate = await workflowTemplateServices.updateWorkflowTemplate(workflowTemplateId, data);
    }
    catch(err){
        return res.status(404).json({
            success: false,
            message: err.message
        })
    }

    return res.status(200).json({
        success: true,
        message: "Workflow template updated successfully.",
        workflowTemplate
    })
}



async function deleteWorkflowTemplateController(req,res) {
    const workflowTemplateId = req.params.id;
    let workflowTemplate;
    try{
        workflowTemplate = await workflowTemplateServices.deleteWorkflowTemplate(workflowTemplateId);
    }
    catch(err){
        return res.status(404).json({
            success: false,
            message: err.message
        })
    }

    return res.status(200).json({
        success: true,
        message: "Workflow template deleted successfully.",
        workflowTemplate
    })
}

module.exports = {
            createWorkflowTemplateController,
            getWorkflowTemplatesController,
            getWorkflowTemplateByIdController,
            updateWorkflowTemplateController,
            deleteWorkflowTemplateController}   