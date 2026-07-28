const express = require("express");
const verifierRouter = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const verifierController = require("../controllers/verifier.controller");

/**
 * @route POST /verifier/documents/:id/approve
 * @description approve the document
 * @access Public
 */
verifierRouter.post("/documents/:id/approve", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.approveController)

/**
 * @route POST /verifier/documents/:id/reject
 * @description reject the document
 * @access Public
 */
verifierRouter.post("/documents/:id/reject", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.rejectController)

/**
 * @route GET /verifier/pending
 * @description get the pending documents
 * @access Public
 */
verifierRouter.get("/pending", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.getPendingDocumentsController);

/**
 * @route POST /verifier/request/:id
 * @description request the document
 * @access Public
 */
verifierRouter.get("/request/:id", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.getVerificationRequestController)




module.exports = verifierRouter;