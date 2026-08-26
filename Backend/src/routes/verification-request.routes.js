const express = require('express');
const verificationRequestRouter = express.Router();
const verificationRequestController = require("../controllers/verification-request.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const emailVerificationController = require("../controllers/email-verification.controller");

/**
 * @route POST /verification-requests
 * @description get all the documents pending for verification
 * @access private
 */
verificationRequestRouter.post("/", authMiddleware.authUser, roleMiddleware.authRoles("admin","verifier"), verificationRequestController.createVerificationRequestController);

/**
 * @route GET /verification-requests/organization
 * @description
 * @access private
 */
verificationRequestRouter.get("/organization", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationRequestController.getVerificationRequestsOrgController);

verificationRequestRouter.get("/", authMiddleware.authUser, roleMiddleware.authRoles("user"), verificationRequestController.getVerificationRequestByUserIdController);

verificationRequestRouter.post(
    "/:requestId/email-verification",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    emailVerificationController.sendEmailController
);

/**
 * @route GET /verification-requests/:id
 * @description
 * @access Public
 */
verificationRequestRouter.get("/:id", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier", "user"), verificationRequestController.getVerificationRequestByIdController);

/**
 * @route PATCH /verification-requests/:id
 * @description
 * @access private
 */
verificationRequestRouter.patch("/:id", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationRequestController.updateVerificationRequestController);

/**
 * @route DELETE /verification-requests/:id
 * @description
 * @access private
 */
verificationRequestRouter.delete("/:id", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationRequestController.deleteVerificationRequestController);


/**
 * @route GET /verification-requests/:requestId/progress
 * @description get the status of all the workflowsteps of this request
 * @access private
 */
verificationRequestRouter.get("/progress/:requestId", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationRequestController.progressRequestController);
module.exports = verificationRequestRouter;
