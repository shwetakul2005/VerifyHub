const express = require('express');
const verificationRequestRouter = express.Router();
const verificationRequestController = require("../controllers/verification-request.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");


/**
 * @route POST /verification-requests
 * @description get all the documents pending for verification
 * @access private
 */
verificationRequestRouter.post("/", authMiddleware.authUser, roleMiddleware.authRoles("admin","verifier"), verificationRequestController.createVerificationRequestController);

/**
 * @route GET /verification-requests
 * @description
 * @access private
 */
verificationRequestRouter.get("/", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationRequestController.getVerificationRequestsController);

/**
 * @route GET /verification-requests/:id
 * @description
 * @access private
 */
verificationRequestRouter.get("/:id", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationRequestController.getVerificationRequestByIdController);

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

module.exports = verificationRequestRouter;
