const express = require("express");
const cookieParser = require("cookie-parser")
const cors = require("cors")
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
// creates a backend express application
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again later." }
}));

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim());

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Origin is not allowed by CORS."));
        },
        credentials: true
    })
);

// converts incoming request body to JSON format
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// importing all the auth routes
const authRouter = require("./routes/auth.routes");

// using all the routes with the prefix /api/auth
app.use("/api/auth", authRouter);

const verificationDocRouter = require("./routes/verification-document.routes");
app.use("/api/verification-requests", verificationDocRouter);

// const verificationRouter = require("./routes/verification.routes");
// app .use("/api/verification", verificationRouter);

const organizationRouter = require("./routes/organization.routes")
app.use("/api/organizations", organizationRouter);

const workflowTemplateRoutes = require("./routes/workflow-template.routes")
app.use("/api/workflows", workflowTemplateRoutes);

const workflowStepRoutes = require("./routes/workflow-step.routes")
app.use("/api/workflow-step", workflowStepRoutes);

const verificatnoRequestRouter = require("./routes/verification-request.routes")
app.use("/api/verification-requests", verificatnoRequestRouter);

const workflowEngineRouter = require("./routes/workflow-engine.routes")
app.use("/api/workflow-engine", workflowEngineRouter);

const emailVerificationRouter = require("./routes/email-verification.routes");
app.use("/api/email", emailVerificationRouter);

const verifierRouter = require("./routes/verifier.routes");
app.use("/api/verifier", verifierRouter);

app.get("/api/health", (req, res) => {
    res.status(200).json({ success: true, status: "ok" });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found."
    });
});

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || (err.name === "MulterError" ? 400 : 500);
    const message = statusCode >= 500
        ? "An unexpected server error occurred."
        : err.message;

    if (statusCode >= 500) {
        console.error(err);
    }

    res.status(statusCode).json({ success: false, message });
});


module.exports = app;
