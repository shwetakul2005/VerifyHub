const express = require("express");
const emailVerificationRouter = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const emailVerificationController = require("../controllers/email-verification.controller");

/**
 * @route GET /api/email/verify/:token
 * @description Verify applicant email
 * @access Public
 */
emailVerificationRouter.get(
    "/verify/:token",
    emailVerificationController.verifyTokenController
);


// /**
//  * @route
//  * @description To initialize the email verification process(sending the email)
//  */
// emailVerificationRouter.post(
//     "/verification-requests/:requestId/email-verification",
//     authMiddleware.authUser,
//     roleMiddleware.authRoles("user"),
//     emailVerificationController.sendEmailController
// )

module.exports = emailVerificationRouter;