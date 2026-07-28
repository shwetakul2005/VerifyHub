const crypto = require("crypto");

const VerificationStepExecution = require("../../../models/verification-step-execution.model");
const { sendEmail } = require("../emailVerification/email");

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
    execute,
    verifyToken
};