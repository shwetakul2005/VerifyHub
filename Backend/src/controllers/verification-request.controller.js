const verificationRequestServices = require("../services/verification-request.service");

async function createVerificationRequestController(req, res) {
    const data = req.body;

    try {
        const verificationRequest = await verificationRequestServices.createVerificationRequest(data);

        return res.status(201).json({
            success: true,
            message: "Verification request created successfully.",
            verificationRequest
        });
    } catch (err) {
        return res.status(400).json({
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

    const result = await verificationRequestServices.progressRequestController(requestId);

    return res.status(200).json({
        success: true,
        message: "Fetched verification flow status.",
        result
    })
}

async function getVerificationRequestsController(req, res) {
    const { organizationId } = req.query;
    // console.log(organizationId);
    try {
        const verificationRequests = await verificationRequestServices.getVerificationRequests(organizationId);

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

async function getVerificationRequestByIdController(req, res) {
    const requestId = req.params.id;

    try {
        const verificationRequest = await verificationRequestServices.getVerificationRequestById(requestId);

        return res.status(200).json({
            success: true,
            message: "Verification request fetched successfully.",
            verificationRequest
        });
    } catch (err) {
        return res.status(404).json({
            success: false,
            message: err.message
        });
    }
}

async function updateVerificationRequestController(req, res) {
    const requestId = req.params.id;
    const data = req.body;

    try {
        const verificationRequest = await verificationRequestServices.updateVerificationRequest(requestId, data);

        return res.status(200).json({
            success: true,
            message: "Verification request updated successfully.",
            verificationRequest
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function deleteVerificationRequestController(req, res) {
    const requestId = req.params.id;

    try {
        const verificationRequest = await verificationRequestServices.deleteVerificationRequest(requestId);

        return res.status(200).json({
            success: true,
            message: "Verification request deleted successfully.",
            verificationRequest
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
    getVerificationRequestsController,
    getVerificationRequestByIdController,
    updateVerificationRequestController,
    deleteVerificationRequestController,
    progressRequestController
};