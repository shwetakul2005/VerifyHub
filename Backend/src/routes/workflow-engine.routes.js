const express = require("express");
const workflowEngineRouter = express.Router();
const workflowEngineController = require("../controllers/workflow-engine.controller");
const authMiddleware = require("../middlewares/auth.middleware");

/**
 * @route POST /api/workflow-engine/:id/start
 * @description Start a verification workflow
 * @access Private (Admin)
 */

workflowEngineRouter.post(
    "/:requestId/start", 
    authMiddleware.authUser, 
    workflowEngineController.startVerificationController);

/**
 * @route POST /api/workflow-engine/:id/execute
 * @description Execute the current workflow step
 * @access Private (Admin, Verifier)
 */

workflowEngineRouter.post(
    "/:requestId/execute",
    authMiddleware.authUser, 
    workflowEngineController.executeCurrentStepController);

module.exports = workflowEngineRouter;
