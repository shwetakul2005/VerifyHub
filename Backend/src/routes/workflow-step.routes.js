const express = require("express");
const workflowStepRouter = express.Router();
const workflowStepController = require("../controllers/workflow-step.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

/**
 * @route POST /api/workflow-step
 * @description Create a workflow step
 * @access Private (Admin)
 */
workflowStepRouter.post(
    "/",
    authMiddleware.authUser,
    roleMiddleware.authRoles("admin"),
    workflowStepController.createWorkflowStepController
);

/**
 * @route GET /api/workflow-step
 * @description Get all workflow steps for a workflow template
 * @access Private (Admin, Verifier)
 * Query Params: workflowTemplateId
 */
workflowStepRouter.get(
    "/",
    authMiddleware.authUser,
    roleMiddleware.authRoles("admin", "verifier"),
    workflowStepController.getWorkflowStepsController
);

/**
 * @route GET /api/workflow-step/:id
 * @description Get workflow step by ID
 * @access Private (Admin, Verifier)
 */
workflowStepRouter.get(
    "/:id",
    authMiddleware.authUser,
    roleMiddleware.authRoles("admin", "verifier"),
    workflowStepController.getWorkflowStepByIdController
);

/**
 * @route PATCH /api/workflow-step/:id
 * @description Update workflow step
 * @access Private (Admin)
 */
workflowStepRouter.patch(
    "/:id",
    authMiddleware.authUser,
    roleMiddleware.authRoles("admin"),
    workflowStepController.updateWorkflowStepController
);

/**
 * @route DELETE /api/workflow-step/:id
 * @description Delete workflow step
 * @access Private (Admin)
 */
workflowStepRouter.delete(
    "/:id",
    authMiddleware.authUser,
    roleMiddleware.authRoles("admin"),
    workflowStepController.deleteWorkflowStepController
);

module.exports = workflowStepRouter;