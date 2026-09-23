const express = require('express');
const workflowTemplateController = require("../controllers/workflow-template.controller")
const workflowTemplateRoutes = express.Router();
const authMiddleware = require("../middlewares/auth.middleware")
const { validateBody, schemas } = require("../middlewares/validation.middleware");

/**
 * @route POST /api/workflows
 * @description Create a new workflow template
 * @access Organization admin
 */
workflowTemplateRoutes.post("/", authMiddleware.authUser, validateBody(schemas.workflowCreate), workflowTemplateController.createWorkflowTemplateController)

/**
 * @route GET /api/workflows
 * @description Get all existing workflows of an organization
 * @access Organization member
 */
workflowTemplateRoutes.get("/",authMiddleware.authUser, workflowTemplateController.getWorkflowTemplatesController)

workflowTemplateRoutes.post("/:id/publish", authMiddleware.authUser, workflowTemplateController.publishWorkflowTemplateController)

workflowTemplateRoutes.post("/:id/versions", authMiddleware.authUser, workflowTemplateController.createWorkflowVersionController)

/**
 * @route GET /api/workflows/:id
 * @description Get a workflow using its id
 * @access Organization member
 */
workflowTemplateRoutes.get("/:id",authMiddleware.authUser, workflowTemplateController.getWorkflowTemplateByIdController)

/**
 * @route PATCH /api/workflows/:id
 * @description Update a workflow using its id
 * @access Organization admin
 */
workflowTemplateRoutes.patch("/:id", authMiddleware.authUser, validateBody(schemas.workflowUpdate), workflowTemplateController.updateWorkflowTemplateController)

/**
 * @route DELETE /api/workflows/:id
 * @description DELETE a workflow using its id
 * @access Organization admin
 */
workflowTemplateRoutes.delete("/:id", authMiddleware.authUser, validateBody(schemas.archive), workflowTemplateController.deleteWorkflowTemplateController)


module.exports = workflowTemplateRoutes;
