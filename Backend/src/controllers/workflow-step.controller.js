const workflowStepServices = require("../services/workflow-step.service");

async function createWorkflowStepController(req, res) {
    const data = req.body;

    try {
        const workflowStep = await workflowStepServices.createWorkflowStep(data);

        return res.status(201).json({
            success: true,
            message: "Workflow step created successfully.",
            workflowStep
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function getWorkflowStepsController(req, res) {
    const { workflowTemplateId } = req.query;

    try {
        const workflowSteps = await workflowStepServices.getWorkflowSteps(workflowTemplateId);

        return res.status(200).json({
            success: true,
            message: "Workflow steps fetched successfully.",
            workflowSteps
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function getWorkflowStepByIdController(req, res) {
    const stepId = req.params.id;

    try {
        const workflowStep = await workflowStepServices.getWorkflowStepById(stepId);

        return res.status(200).json({
            success: true,
            message: "Workflow step fetched successfully.",
            workflowStep
        });
    } catch (err) {
        return res.status(404).json({
            success: false,
            message: err.message
        });
    }
}

async function updateWorkflowStepController(req, res) {
    const stepId = req.params.id;
    const data = req.body;

    try {
        const workflowStep = await workflowStepServices.updateWorkflowStep(stepId, data);

        return res.status(200).json({
            success: true,
            message: "Workflow step updated successfully.",
            workflowStep
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function deleteWorkflowStepController(req, res) {
    const stepId = req.params.id;

    try {
        const workflowStep = await workflowStepServices.deleteWorkflowStep(stepId);

        return res.status(200).json({
            success: true,
            message: "Workflow step deleted successfully.",
            workflowStep
        });
    } catch (err) {
        return res.status(404).json({
            success: false,
            message: err.message
        });
    }
}

module.exports = {
    createWorkflowStepController,
    getWorkflowStepsController,
    getWorkflowStepByIdController,
    updateWorkflowStepController,
    deleteWorkflowStepController
};