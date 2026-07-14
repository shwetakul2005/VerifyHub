const express = require('express');
const docRouter = express.Router();
const docController = require("../controllers/document.controller")
const authMiddleware = require("../middlewares/auth.middleware")
const roleMiddleware = require("../middlewares/role.middleware")
const upload = require("../middlewares/upload.middleware");

/**
 * @route POST /documents/upload
 * @description get the metadata of the documents
 * @access private
 */
docRouter.post("/upload", authMiddleware.authUser, roleMiddleware.authRoles("user"),upload.single('document'),docController.uploadController);

/**
 * @route GET /documents
 * @description get the docs asked by the user
 * @access private
 */
docRouter.get("/get-docs", authMiddleware.authUser, roleMiddleware.authRoles("user"),docController.getDocsController);

/**
 * @route GET /document/:id
 * @description allow access of the docs only to the authorized users
 * @access private
 */
docRouter.get("/:id", authMiddleware.authUser, roleMiddleware.authRoles("user"), docController.getDocumentByIdController);

/**
 * @route DELETE /document/:id
 * @description allow access of the docs only to the authorized users
 * @access private
 */
docRouter.delete("/:id", authMiddleware.authUser, roleMiddleware.authRoles("user"), docController.deleteDocumentByIdController);

module.exports = docRouter;
