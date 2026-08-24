const crypto = require("crypto");
const VerificationRequestModel = require("../../../models/verification-request.model")
const VerificationStepExecution = require("../../../models/verification-step-execution.model");
const { sendEmail } = require("../emailVerification/email");

async function startEmailVerification(requestId, userId) {
    const verificationRequest =
        await VerificationRequestModel
            .findById(requestId)
            .populate("applicant")
            .populate("currentStep");


    // console.log("verificationRequest:", verificationRequest);
    // console.log("applicant:", verificationRequest?.applicant);
    // console.log("userId:", userId);

    if (!verificationRequest) {
        throw new Error("Verification request not found.");
    }

    // Make sure this request belongs to the logged-in applicant
    if (verificationRequest.applicant._id.toString() !== userId.toString()) {
        throw new Error("You are not authorized to access this verification request.");
    }

    // Make sure the request can still be processed
    if (verificationRequest.status === "completed") {
        throw new Error("Verification request is already completed.");
    }

    if (verificationRequest.status === "rejected") {
        throw new Error("Verification request has been rejected.");
    }

    if (!verificationRequest.currentStep) {
        throw new Error("No active workflow step.");
    }

    // Make sure the current step is email verification
    if (verificationRequest.currentStep.stepType !== "email") {
        throw new Error("Current workflow step is not email verification.");
    }

    // Execute the email verification step
    await emailVerificationService.execute(verificationRequest);

    return {
        message: "Verification email sent successfully."
    };
}


async function execute(verificationRequest) {
    // Populate required references
    await verificationRequest.populate("applicant");
    await verificationRequest.populate("currentStep");

    const applicant = verificationRequest.applicant;
    const workflowStep = verificationRequest.currentStep;

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    // const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Token expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Create execution record
    await VerificationStepExecution.create({
        verificationRequest: verificationRequest._id,
        workflowStep: workflowStep._id,
        status: "in_progress",
        metadata: {
            token:token,
            verified: false,
            expiresAt
        },
        startedAt: new Date()
    });

    // Verification link
    const verificationLink =`${process.env.FRONTEND_URL}/verify-email/${token}`;
    // Email body
    const html = `
        <h2>Email Verification</h2>

        <p>Hello ${applicant.username},</p>

        <p>Please click the button below to verify your email.</p>

        <a href="${verificationLink}"
           style="
                display:inline-block;
                padding:12px 24px;
                background:#2563EB;
                color:white;
                text-decoration:none;
                border-radius:8px;">
            Verify Email
        </a>

        <p>This link expires in 30 minutes.</p>

        <p>If you didn't request this verification, you can safely ignore this email.</p>
    `;

    // Send email
    await sendEmail(
        applicant.email,
        "Verify your Email",
        'This is a test email sent with Nodemailer using OAuth2.',
        html
);

    return {
        success: true,
        completed: true,
        message: "Verification email sent."
    };
}

async function verifyToken(token) {
    const workflowEngineService = require("../../workflow-engine.service");

    if (!token) {
        throw new Error("Token not found.");
    }
    
    // const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    
    const execution = await VerificationStepExecution.findOne({
        "metadata.token": token,
        // metadata:{
        //     token:token
        // },
        status: "in_progress"
    }).populate("verificationRequest");

    if (!execution) {
        throw new Error("Invalid verification token or already processed.");
    }

    if (
        !execution.verificationRequest.currentStep.equals(
            execution.workflowStep
        )
    ) {
        throw new Error("This verification step is no longer active.");
    }

   

    if (new Date() > new Date(execution.metadata.expiresAt)) {
        execution.status = "failed";
        await execution.save();
        throw new Error("Verification token has expired.");
    }

    execution.metadata.verified = true;
    execution.status = "completed";
    execution.completedAt = new Date();

    await execution.save();

    // Move workflow to next step
    // console.log(workflowEngineService);
    // const updatedRequest = await workflowEngineService.moveToNextStep(
    //     execution.verificationRequest
    // );

    return {
        success: true,
        completed: true,
        message: "Email verified successfully."
    };
}

module.exports = {
    startEmailVerification,
    execute,
    verifyToken
};