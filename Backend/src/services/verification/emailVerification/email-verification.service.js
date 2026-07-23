// const verificationRequestModel = require("../../../models/verification-request.model");
// const verificationStepExecution = require("../../../models/verification-step-execution.model");
// const crypto = require("crypto");
// const workflowEngineService = require("../workflow-engine.service");
// const token = crypto.randomBytes(32).toString("hex");
// import sendEmail from "./email";

// async function execute (verificationRequest){
//     await verificationRequest.populate("applicant");
//     await verificationRequest.populate("currentStep");
//     const applicant = currentRequest.applicant;
//     const currentStep = currentRequest.currentStep;
//     const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

//     const tokenEmailVerification = jwt.sign(
//             {id: currentRequest._id, username:applicant, role: currentStep},
//             process.env.JWT_SECRET_EMAIL_SERVICE,
//             {expiresIn: expiresAt});
    
//     await verificationStepExecution.create({verificationRequest, workflowStep: verificationRequest.currentStep, status:"in_progress", metadata:{token,verified: false,expiresAt}, startedAt: new Date()} )

//     sendEmail();
//     workflowEngineService.moveToNextStep
    
// }

// async function verifyToken(token) {
//     const execution = await VerificationStepExecution.findOne({"metadata.token": token});
//     if (!execution) {
//         throw new Error("Invalid verification token.");
//     }

//     if (new Date() > execution.metadata.expiresAt) {
//         throw new Error("Verification token has expired.");
//     }
//     execution.metadata.verified = true;
//     execution.status = "completed";
//     execution.completedAt = new Date();

//     await execution.save();
//     await workflowEngineService.moveToNextStep(
//     execution.verificationRequest
// );
// }





// // module.exports = {execute, verifyToken};



const crypto = require("crypto");

const VerificationStepExecution = require("../../../models/verification-step-execution.model");
const workflowEngineService = require("../workflow-engine.service");
const { sendEmail } = require("../../mail/mail.service");

async function execute(verificationRequest) {
    // Populate required references
    await verificationRequest.populate("applicant");
    await verificationRequest.populate("currentStep");

    const applicant = verificationRequest.applicant;
    const workflowStep = verificationRequest.currentStep;

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Token expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Create execution record
    await VerificationStepExecution.create({
        verificationRequest: verificationRequest._id,
        workflowStep: workflowStep._id,
        status: "in_progress",
        metadata: {
            token,
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
    await sendEmail({
        to: applicant.email,
        subject: "Verify your Email",
        html
    });

    return {
        success: true,
        completed: false,
        message: "Verification email sent."
    };
}

async function verifyToken(token) {

    const execution = await VerificationStepExecution.findOne({
        "metadata.token": token
    });

    if (!execution) {
        throw new Error("Invalid verification token.");
    }

    if (execution.metadata.verified) {
        throw new Error("Email already verified.");
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
    const updatedRequest = await workflowEngineService.moveToNextStep(
        execution.verificationRequest
    );

    return {
        success: true,
        completed: true,
        message: "Email verified successfully.",
        verificationRequest: updatedRequest
    };
}

module.exports = {
    execute,
    verifyToken
};