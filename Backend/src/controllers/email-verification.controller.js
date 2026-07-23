const emailVerificationService = require("../services/verification/emailVerification/email-verification.service")

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
    verifyTokenController
};