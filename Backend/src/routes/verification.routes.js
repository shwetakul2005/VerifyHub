const express = require('express');
const verificationRouter = express.Router();
const verificationController = require("../controllers/verification.controller");
const authMiddleware = require("../middlewares/auth.middleware")
const authController = require("../controllers/auth.controller");
const roleMiddleware = require("../middlewares/role.middleware")


/**
 * @route GET /verification/pending
 * @description 
 * @access private
 */
verificationRouter.get("/pending", authMiddleware.authUser, roleMiddleware.authRoles("admin", "verifier"), verificationController.pendingController);


module.exports = verificationRouter;