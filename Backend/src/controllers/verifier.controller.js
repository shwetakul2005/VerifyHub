const verifierService = require("../services/verifier.service");
const verificationDocumentService = require("../services/verification/documentVerification/view-document.service");

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
    const verifierId = req.user.id;
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

const path = require("path");

async function viewDocumentController(req, res) {
    try {
        const { documentId } = req.params;

        const filePath =
            await verificationDocumentService.viewDocument(documentId);

        const absolutePath = path.resolve(filePath);

        return res.sendFile(absolutePath);

    } catch (error) {
        console.error("Error viewing document:", error);

        if (error.message === "Document not found.") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to view document."
        });
    }
}

module.exports = {
    approveController,
    getPendingDocumentsController,
    getVerificationRequestController,
    rejectController,
    viewDocumentController
}