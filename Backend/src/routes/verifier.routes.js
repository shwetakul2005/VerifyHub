const express = require("express");
const verifierRouter = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const verifierController = require("../controllers/verifier.controller");

/**
 * @route POST /verifier/documents/:id/approve
 * @description approve the document
 * @access Private
 */
verifierRouter.post("/documents/:id/approve", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.approveController)

/**
 * @route POST /verifier/documents/:id/reject
 * @description reject the document
 * @access Private
 */
verifierRouter.post("/documents/:id/reject", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.rejectController)

/**
 * @route GET /verifier/pending
 * @description get the pending documents
 * @access Private
 */
verifierRouter.get("/pending", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.getPendingDocumentsController);

/**
 * @route POST /verifier/request/:id
 * @description request the document
 * @access Private
 */
verifierRouter.get("/request/:id", authMiddleware.authUser, roleMiddleware.authRoles("verifier"), verifierController.getVerificationRequestController)


/**
 * @route GET /verifier/documents/:documentId/file
 * @description view the uploaded file
 * @access Private
 */
verifierRouter.get("/documents/:documentId/file", authMiddleware.authUser, roleMiddleware.authRoles("verifier", "admin"), verifierController.viewDocumentController);



module.exports = verifierRouter;