const crypto = require("crypto");
const VerificationRequest = require("../../../models/verification-request.model");
const VerificationStepExecution = require("../../../models/verification-step-execution.model");
const User = require("../../../models/user.model");
const emailProvider = require("./email");

async function applicantFor(request) {
    if (request.applicant?.email) return request.applicant;
    const applicantId = request.applicant?._id || request.applicant;
    return User.findById(applicantId);
}

async function startEmailVerification(requestId, userId) {
    const request = await VerificationRequest.findById(requestId).populate("applicant");
    if (!request) throw new Error("Verification request not found.");
    if (String(request.applicant?._id) !== String(userId)) {
        throw new Error("You are not authorized to access this verification request.");
    }
    if (["completed", "rejected", "cancelled"].includes(request.status)) {
        throw new Error("Verification request is no longer active.");
    }
    if (request.status === "pending") {
        throw new Error("Verification request must be started by an organization administrator.");
    }
    const execution = await VerificationStepExecution.findById(request.currentExecution).lean();
    if (execution?.stepSnapshot?.stepType !== "email") {
        throw new Error("Current workflow step is not email verification.");
    }
    const coordinator = require("../../workflow-engine.service");
    return coordinator.executeCurrentStep(requestId, userId, { allowApplicant: true });
}

async function execute(context, dependencies = {}) {
    const sendEmail = dependencies.sendEmail || emailProvider.sendEmail;
    const applicant = await applicantFor(context.request);
    if (!applicant) throw new Error("Applicant not found.");
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    const html = `
        <h2>Email Verification</h2>
        <p>Hello ${applicant.username},</p>
        <p>Please click the button below to verify your email.</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This link expires in 30 minutes.</p>
    `;
    await sendEmail(
        applicant.email,
        "Verify your Email",
        "Open the verification link to continue.",
        html
    );
    return {
        status: "waiting_for_input",
        metadata: { token, verified: false, expiresAt },
        message: "Verification email sent. Waiting for the applicant to verify it."
    };
}

async function verifyToken(token) {
    if (!token) throw new Error("Token not found.");
    let execution = await VerificationStepExecution.findOne({ "metadata.token": token });
    if (!execution) throw new Error("Invalid verification token.");
    if (execution.status === "completed" && execution.metadata?.verified) {
        return { success: true, completed: true, message: "Email already verified." };
    }
    if (new Date() > new Date(execution.metadata?.expiresAt)) {
        const coordinator = require("../../workflow-engine.service");
        const claim = await coordinator.claimExecution(
            execution.verificationRequest,
            execution._id,
            null,
            { allowWaitingForInput: true }
        );
        if (claim.claimed) {
            await coordinator.finalizeExecution({
                requestId: execution.verificationRequest,
                executionId: execution._id,
                processingToken: claim.execution.processingToken,
                outcome: {
                    status: "failed",
                    error: { code: "EMAIL_TOKEN_EXPIRED", message: "Verification token expired.", retryable: true }
                }
            });
        }
        throw new Error("Verification token has expired.");
    }
    const coordinator = require("../../workflow-engine.service");
    const claim = await coordinator.claimExecution(
        execution.verificationRequest,
        execution._id,
        null,
        { allowWaitingForInput: true }
    );
    if (!claim.claimed) {
        execution = await VerificationStepExecution.findById(execution._id);
        if (execution.status === "completed") {
            return { success: true, completed: true, message: "Email already verified." };
        }
        throw new Error("Email verification is already being processed.");
    }
    const finalized = await coordinator.finalizeExecution({
        requestId: execution.verificationRequest,
        executionId: execution._id,
        processingToken: claim.execution.processingToken,
        outcome: { status: "completed", metadata: { verified: true, verifiedAt: new Date() } }
    });
    return {
        success: true,
        completed: true,
        message: "Email verified successfully.",
        verificationRequest: finalized.request
    };
}

module.exports = { startEmailVerification, execute, verifyToken };
