const express = require("express");
const cookieParser = require("cookie-parser")
// creates a backend express application
const app = express();

// converts incoming request body to JSON format
app.use(express.json());
app.use(cookieParser());

// importing all the auth routes
const authRouter = require("./routes/auth.routes");

// using all the routes with the prefix /api/auth
app.use("/api/auth", authRouter);

const docRouter = require("./routes/document.routes");
app.use("/api/documents", docRouter);

const verificationRouter = require("./routes/verification.routes");
app .use("/api/verification", verificationRouter);

module.exports = app;