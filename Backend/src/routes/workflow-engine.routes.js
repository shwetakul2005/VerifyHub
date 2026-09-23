const express = require("express");
const workflowEngineRouter = express.Router();
const workflowEngineController = require("../controllers/workflow-engine.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const { validateBody, schemas } = require("../middlewares/validation.middleware");

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

workflowEngineRouter.post(
    "/:requestId/retry",
    authMiddleware.authUser,
    validateBody(schemas.workflowRetry),
    workflowEngineController.retryExecutionController
);

workflowEngineRouter.post(
    "/:requestId/cancel",
    authMiddleware.authUser,
    validateBody(schemas.workflowCancel),
    workflowEngineController.cancelVerificationController
);

module.exports = workflowEngineRouter;
