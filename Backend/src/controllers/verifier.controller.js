const verifierService = require("../services/verifier.service");

async function approveController(req, res) {
    const documentId = req.params.id;

    if (!documentId) {
        return res.status(400).json({
            success: false,
            message: "Document ID is required."
        });
    }

    try {
        const document = await verifierService.approve(documentId);

        return res.status(200).json({
            success: true,
            message: "Document approved successfully.",
            document
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function getPendingDocumentsController(req, res) {
    
    // async function pendingController(req, res) {
    const documents =
        await verifierService.getPendingDocuments(req.user.id);

    return res.status(200).json({
        success: true,
        message: "Pending documents fetched successfully.",
        documents
    });
// }
}

async function getVerificationRequestController(req, res) {
    const requestId = req.params.id;
    // const verifierId = 
    if (!requestId) {
        return res.status(400).json({
            success: false,
            message: "Verification Request ID is required."
        });
    }

    try {
        const request = await verifierService.getVerificationRequest(
            requestId,
            verifierId
        );

        return res.status(200).json({
            success: true,
            message: "Verification request fetched successfully.",
            request
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function rejectController(req, res) {
    const documentId = req.params.id;
    const { rejectionReason } = req.body;
    const verifierId = req.user.id;

    if (!documentId) {
        return res.status(400).json({
            success: false,
            message: "Document ID is required."
        });
    }

    try {
        const document = await verifierService.reject(
            documentId,
            verifierId,
            rejectionReason
        );

        return res.status(200).json({
            success: true,
            message: "Document rejected successfully.",
            document
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

module.exports = {
    approveController,
    getPendingDocumentsController,
    getVerificationRequestController,
    rejectController
}