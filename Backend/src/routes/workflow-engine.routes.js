const express = require("express");
const workflowEngineRouter = express.Router();
const workflowEngineController = require("../controllers/workflow-engine.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

/**
 * @route POST /api/workflow-engine/:id/start
 * @description Start a verification workflow
 * @access Private (Admin)
 */

workflowEngineRouter.post(
    "/:requestId/start", 
    authMiddleware.authUser, 
    roleMiddleware.authRoles("admin", "verifier"),
    workflowEngineController.startVerificationController);

/**
 * @route POST /api/workflow-engine/:id/execute
 * @description Execute the current workflow step
 * @access Private (Admin, Verifier)
 */

workflowEngineRouter.post(
    "/:requestId/execute",
    authMiddleware.authUser, 
    roleMiddleware.authRoles("admin", "verifier"),
    workflowEngineController.executeCurrentStepController);

module.exports = workflowEngineRouter;