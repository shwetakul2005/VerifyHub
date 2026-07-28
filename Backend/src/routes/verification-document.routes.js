const express = require('express');
const verificationDocRouter = express.Router();
const verificationDocController = require("../controllers/verification-document.controller")
const authMiddleware = require("../middlewares/auth.middleware")
const roleMiddleware = require("../middlewares/role.middleware")
const upload = require("../middlewares/upload.middleware");

/**
 * @route POST api/verification-requests/:requestId/documents/upload
 * @description post the metadata of the documents
 * @access private
 */
verificationDocRouter.post(
    "/:requestId/documents",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    upload.single("document"),
    verificationDocController.uploadController
);

/**
 * @route GET api/verification-requests/:requestId/documents
 * @description get the docs asked by the user
 * @access private
 */
verificationDocRouter.get(
    "/:requestId/documents",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    verificationDocController.getDocsController
);
/**
 * @route GET api/verification-requests/:requestId/documents/:id
 * @description allow access of the docs only to the authorized users
 * @access private
 */
verificationDocRouter.get(
    "/:requestId/documents/:documentId",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    verificationDocController.getDocumentByIdController
);
/**
 * @route DELETE api/verification-requests/:requestId/documents/:id
 * @description allow access of the docs only to the authorized users
 * @access private
 */
verificationDocRouter.delete(
    "/:requestId/documents/:documentId",
    authMiddleware.authUser,
    roleMiddleware.authRoles("user"),
    verificationDocController.deleteDocumentController
);


module.exports = verificationDocRouter;
