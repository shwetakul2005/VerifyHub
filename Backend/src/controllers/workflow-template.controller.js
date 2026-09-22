const workflowTemplateServices = require("../services/workflow-template.service");

async function createWorkflowTemplateController(req,res) {
    const data = req.body;
    let workflowTemplate;
    try{
        workflowTemplate = await workflowTemplateServices.createWorkflowTemplate(data, req.user.id);
    }
    catch(err){
        return res.status(err.statusCode || 400).json({
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
        workflowTemplates = await workflowTemplateServices.getWorkflowTemplates(organizationId, req.user.id);
    }
    catch(err){
        return res.status(err.statusCode || 400).json({
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
        workflowTemplate = await workflowTemplateServices.getWorkflowTemplateById(workflowTemplateId, req.user.id);
    }
    catch(err){
        return res.status(err.statusCode || 400).json({
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
        workflowTemplate = await workflowTemplateServices.updateWorkflowTemplate(workflowTemplateId, data, req.user.id);
    }
    catch(err){
        return res.status(err.statusCode || 400).json({
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
        workflowTemplate = await workflowTemplateServices.deleteWorkflowTemplate(workflowTemplateId, req.user.id);
    }
    catch(err){
        return res.status(err.statusCode || 400).json({
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

async function publishWorkflowTemplateController(req, res) {
    try {
        const workflowTemplate = await workflowTemplateServices.publishWorkflowTemplate(
            req.params.id,
            req.user.id
        );
        return res.status(200).json({
            success: true,
            message: "Workflow published successfully.",
            workflowTemplate
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
}

async function createWorkflowVersionController(req, res) {
    try {
        const workflowTemplate = await workflowTemplateServices.createWorkflowVersion(
            req.params.id,
            req.user.id
        );
        return res.status(201).json({
            success: true,
            message: "Workflow version created successfully.",
            workflowTemplate
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
}

module.exports = {
            createWorkflowTemplateController,
            getWorkflowTemplatesController,
            getWorkflowTemplateByIdController,
            updateWorkflowTemplateController,
            deleteWorkflowTemplateController,
            publishWorkflowTemplateController,
            createWorkflowVersionController}
