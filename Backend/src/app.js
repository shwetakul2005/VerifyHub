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

const organizationRouter = require("./routes/organization.routes")
app.use("/api/organizations", organizationRouter);

const workflowTemplateRoutes = require("./routes/workflow-template.routes")
app.use("/api/workflows", workflowTemplateRoutes);

const workflowStepRoutes = require("./routes/workflow-step.routes")
app.use("/api/workflow-step", workflowStepRoutes);

const verificatnoRequestRouter = require("./routes/verification-request.routes")
app.use("/api/verification-requests", verificatnoRequestRouter);

module.exports = app;