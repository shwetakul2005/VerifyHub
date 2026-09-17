const express = require('express');
const verificationRequestRouter = express.Router();
const verificationRequestController = require("../controllers/verification-request.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const emailVerificationController = require("../controllers/email-verification.controller");
const upload = require("../middlewares/upload.middleware");
const { validateBody, schemas } = require("../middlewares/validation.middleware");

/**
 * @route POST /verification-requests
 * @description get all the documents pending for verification
 * @access private
 */
verificationRequestRouter.post("/", authMiddleware.authUser, validateBody(schemas.verificationRequestCreate), verificationRequestController.createVerificationRequestController);

/**
 * @route GET /verification-requests/organization
 * @description
 * @access private
 */
verificationRequestRouter.get("/organization", authMiddleware.authUser, verificationRequestController.getVerificationRequestsOrgController);

verificationRequestRouter.get("/", authMiddleware.authUser, roleMiddleware.authRoles("user"), verificationRequestController.getVerificationRequestByUserIdController);

verificationRequestRouter.get(
    "/:requestId/flow",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    verificationRequestController.getApplicantWorkflowController
);

verificationRequestRouter.post(
    "/:requestId/email-verification",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    emailVerificationController.sendEmailController
);

verificationRequestRouter.post(
    "/:requestId/face-verification",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    upload.fields([
        { name: "document", maxCount: 1 },
        { name: "live", maxCount: 1 }
    ]),
    verificationRequestController.submitFaceVerificationController
);

/**
 * @route GET /verification-requests/:id
 * @description
 * @access Public
 */
verificationRequestRouter.get("/:id", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier", "user"), verificationRequestController.getVerificationRequestByIdController);

/**
 * @route GET /verification-requests/:requestId/progress
 * @description get the status of all the workflowsteps of this request
 * @access private
 */
verificationRequestRouter.get("/progress/:requestId", authMiddleware.authUser, verificationRequestController.progressRequestController);
module.exports = verificationRequestRouter;
