const express = require("express");
const emailVerificationRouter = express.Router();

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

module.exports = emailVerificationRouter;