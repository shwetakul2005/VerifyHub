const verificationRequestServices = require("../services/verification-request.service");

async function createVerificationRequestController(req, res) {
    const data = req.body;

    try {
        const verificationRequest = await verificationRequestServices.createVerificationRequest(data, req.user.id);

        return res.status(201).json({
            success: true,
            message: "Verification request created successfully.",
            verificationRequest
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message
        });
    }
}

async function progressRequestController(req,res) {
    const requestId = req.params.requestId;

    if(!requestId){
        return res.status(400).json({
            success: false,
            message: "Request Id not recieved."
        })
    }

    try {
        const result = await verificationRequestServices.getRequestProgress(requestId, req.user.id);
        return res.status(200).json({
            success: true,
            message: "Fetched verification flow status.",
            result
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message
        });
    }
}

// get verification request by id of the organization
async function getVerificationRequestsOrgController(req, res) {
    const { organizationId } = req.query;
    // console.log(organizationId);
    try {
        const verificationRequests = await verificationRequestServices.getVerificationRequests(organizationId, req.user.id);

        return res.status(200).json({
            success: true,
            message: "Verification requests fetched successfully.",
            verificationRequests
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

// get verification request by the verification request id
async function getVerificationRequestByIdController(req, res) {
    const requestId = req.params.id;

    try {
        const verificationRequest = await verificationRequestServices.getVerificationRequestById(requestId, req.user.id);

        return res.status(200).json({
            success: true,
            message: "Verification request fetched successfully.",
            verificationRequest
        });
    } catch (err) {
        return res.status(err.statusCode || 404).json({
            success: false,
            message: err.message
        });
    }
}

async function getApplicantWorkflowController(req, res) {
    const requestId = req.params.requestId;
    const userId = req.user.id;

    try {
        const workflow = await verificationRequestServices.getApplicantWorkflowByRequestId(requestId, userId);

        return res.status(200).json({
            success: true,
            message: "Applicant verification workflow fetched successfully.",
            result: workflow
        });
    } catch (err) {
        const statusCode = err.message === "Verification request not found." ? 404 : 403;

        return res.status(statusCode).json({
            success: false,
            message: err.message
        });
    }
}

async function submitFaceVerificationController(req, res) {
    const requestId = req.params.requestId;
    const applicantId = req.user.id;
    const files = req.files || {};

    try {
        const result = await verificationRequestServices.submitFaceVerificationStep(requestId, applicantId, files);

        return res.status(result.success ? 200 : 400).json({
            success: result.success,
            message: result.message,
            result: result.result,
            execution: result.execution,
            verificationRequest: result.verificationRequest || null
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

// get verification request by id of the user
async function getVerificationRequestByUserIdController(req, res) {
    const userId  = req.user.id;

    try {
        const verificationRequests = await verificationRequestServices.getVerificationRequestByUserId(userId);

        return res.status(200).json({
            success: true,
            message: "Verification request fetched successfully.",
            verificationRequests
        });
    } catch (err) {
        return res.status(404).json({
            success: false,
            message: err.message
        });
    }
}

module.exports = {
    createVerificationRequestController,
    getVerificationRequestsOrgController,
    getVerificationRequestByIdController,
    getApplicantWorkflowController,
    progressRequestController,
    getVerificationRequestByUserIdController,
    submitFaceVerificationController
};
