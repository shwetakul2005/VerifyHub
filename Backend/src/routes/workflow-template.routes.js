const express = require('express');
const workflowTemplateController = require("../controllers/workflow-template.controller")
const workflowTemplateRoutes = express.Router();
const authMiddleware = require("../middlewares/auth.middleware")
const roleMiddleware = require("../middlewares/role.middleware")

/**
 * @route POST /api/workflows
 * @description Create a new workflow template
 * @access Public
 */
workflowTemplateRoutes.post("/",authMiddleware.authUser, workflowTemplateController.createWorkflowTemplateController)

/**
 * @route GET /api/workflows
 * @description Get all existing workflows of an organization
 * @access public
 */
workflowTemplateRoutes.get("/",authMiddleware.authUser, workflowTemplateController.getWorkflowTemplatesController)

/**
 * @route GET /api/workflows/:id
 * @description Get a workflow using its id
 * @access public
 */
workflowTemplateRoutes.get("/:id",authMiddleware.authUser, workflowTemplateController.getWorkflowTemplateByIdController)

/**
 * @route PATCH /api/workflows/:id
 * @description Update a workflow using its id
 * @access public
 */
workflowTemplateRoutes.patch("/:id",authMiddleware.authUser, workflowTemplateController.updateWorkflowTemplateController)

/**
 * @route DELETE /api/workflows/:id
 * @description DELETE a workflow using its id
 * @access public
 */
workflowTemplateRoutes.delete("/:id",authMiddleware.authUser, workflowTemplateController.deleteWorkflowTemplateController)


module.exports = workflowTemplateRoutes;