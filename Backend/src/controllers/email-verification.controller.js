// const emailVerificationService = require("../services/verification/emailVerification/email-verification.service")
const emailVerificationService = require("../services/verification/emailVerification/email-verification.service");

async function sendEmailController(req, res) {
    const  {requestId}  = req.params;
    const userId = req.user.id;

    try {
        const result =
            await emailVerificationService.startEmailVerification(
                requestId,
                userId
            );

        return res.status(200).json({
            success: true,
            message: "Verification email sent successfully.",
            result
        });

    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function verifyTokenController(req, res) {
    const { token } = req.params;
    try {
        const result = await emailVerificationService.verifyToken(req.params.token);

        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
        
    }
}

module.exports = {
    sendEmailController,
    verifyTokenController
};