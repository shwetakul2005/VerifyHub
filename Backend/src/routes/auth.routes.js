const express = require('express');
const authController = require("../controllers/auth.controller")
const authRouter = express.Router();
const authMiddleware = require("../middlewares/auth.middleware")
const roleMiddleware = require("../middlewares/role.middleware")

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */
authRouter.post("/register", authController.registerUserController)

/**
 * @route POST /api/auth/login
 * @description Login an existing user
 * @access public
 */
authRouter.post("/login", authController.loginUserController)

/**
 * @route GET /api/auth/logout
 * @description Clear token from user cookie and add token to the blacklist
 * @access public
 */
authRouter.get("/logout", authController.logoutUserController)

/**
 * @route GET /api/auth/get-me
 * @description get the current logged in user details
 * @access private
 */
authRouter.get("/get-me", authMiddleware.authUser,roleMiddleware.authRoles("admin", "user", "verifier"), authController.getMeController)
// authRouter.get("/get-me", authMiddleware.authUser, authController.getMeController)



module.exports = authRouter;