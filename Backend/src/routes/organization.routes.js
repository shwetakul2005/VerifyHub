const express = require("express");
const organizationRouter = express.Router();
const organizationController = require("../controllers/organization.controller")
const authMiddleware = require("../middlewares/auth.middleware")
const { validateBody, schemas } = require("../middlewares/validation.middleware");

/**
 * @route POST /api/organizations/
 * @description Create organization 
 * @access Private
 */
organizationRouter.post("/", authMiddleware.authUser, validateBody(schemas.organizationCreate), organizationController.createOrganizationController);
organizationRouter.get("/", authMiddleware.authUser, organizationController.getOrganizationsController);
organizationRouter.get("/:id", authMiddleware.authUser, organizationController.getOrganizationByIdController);


module.exports = organizationRouter;
