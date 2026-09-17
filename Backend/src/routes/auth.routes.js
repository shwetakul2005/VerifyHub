const express = require('express');
const authController = require("../controllers/auth.controller")
const authRouter = express.Router();
const authMiddleware = require("../middlewares/auth.middleware")
const roleMiddleware = require("../middlewares/role.middleware")
const { rateLimit } = require("express-rate-limit");
const { validateBody, schemas } = require("../middlewares/validation.middleware");

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many authentication attempts. Please try again later." }
});

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */
authRouter.post("/register", authLimiter, validateBody(schemas.register), authController.registerUserController)

/**
 * @route POST /api/auth/login
 * @description Login an existing user
 * @access public
 */
authRouter.post("/login", authLimiter, validateBody(schemas.login), authController.loginUserController)

/**
 * @route POST /api/auth/logout
 * @description Clear token from user cookie and add token to the blacklist
 * @access private
 */
authRouter.post("/logout", authMiddleware.authUser, authController.logoutUserController)

/**
 * @route GET /api/auth/get-me
 * @description get the current logged in user details
 * @access private
 */
// authRouter.get("/get-me", authMiddleware.authUser,roleMiddleware.authRoles("admin", "user", "verifier"), authController.getMeController)
authRouter.get("/get-me", authMiddleware.authUser, authController.getMeController)



module.exports = authRouter;
