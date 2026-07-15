const express = require("express");
const organizationRouter = express.Router();
const organizationController = require("../controllers/organization.controller")
const authMiddleware = require("../middlewares/auth.middleware")

/**
 * @route POST /api/organizations/
 * @description Create organization 
 * @access Private
 */
organizationRouter.post("/", authMiddleware.authUser, organizationController.createOrganizationController);


module.exports = organizationRouter;
