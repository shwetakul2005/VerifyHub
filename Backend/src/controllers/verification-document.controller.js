const VerificationRequestModel = require("../models/verification-request.model");
const verificationDocumentService = require("../services/verification-document.service");
const workflowEngineService = require("../services/workflow-engine.service");

async function uploadController(req, res) {
    const verificationRequestId = req.params.requestId;
    const { title, documentType } = req.body;

    if(!verificationRequestId){
        return res.status(400).json({
            success: false,
            message: "Verification request Id not available."
        })
    }
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Please upload a document."
        });
    }

    if (!title || !documentType) {
        return res.status(400).json({
            success: false,
            message: "Please provide title and documentType."
        });
    }

    const {
        filename: fileName,
        path: filePath,
        mimetype: mimeType,
        size: fileSize
    } = req.file;

    const data = {
        verificationRequest: verificationRequestId,
        title,
        documentType,
        fileName,
        filePath,
        mimeType,
        fileSize
    };
    const verificationReq = await VerificationRequestModel.findById(verificationRequestId).populate("currentStep")
    if (!verificationReq) {
        return res.status(404).json({
            success: false,
            message: "Verification request not found."
        });
    }
    if (verificationReq.currentStep.stepType !== "document") {
        return res.status(400).json({
            success: false,
            message: "Current step is not a document verification step."
        });
    }
    if(documentType  !== verificationReq.currentStep.config.documentType){
        return res.status(400).json({
            success: false,
            message: "Wrong document being uploded."
        })
    }

    try {
        const document = await verificationDocumentService.uploadVerificationDocument(
            data,
            req.user.id
        );
        await workflowEngineService.executeCurrentStep(
            verificationRequestId
        );
        return res.status(201).json({
            success: true,
            message: "Document uploaded successfully.",
            document
        });

    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function getDocsController(req, res) {
    const { requestId } = req.params;

    try {
        const documents = await verificationDocumentService.getDocuments(
            requestId,
            req.user.id
        );

        return res.status(200).json({
            success: true,
            message: "Documents fetched successfully.",
            count: documents.length,
            documents
        });

    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function getDocumentByIdController(req, res) {
    const { documentId } = req.params;

    try {
        const document = await verificationDocumentService.getDocumentsById(
            documentId,
            req.user.id
        );

        return res.status(200).json({
            success: true,
            message: "Document fetched successfully.",
            document
        });

    } catch (err) {
        return res.status(404).json({
            success: false,
            message: err.message
        });
    }
}

async function deleteDocumentController(req, res) {
    const { requestId, documentId } = req.params;

    try {
        const result = await verificationDocumentService.deleteDocument(
            requestId,
            documentId,
            req.user.id
        );

        return res.status(result.status).json(result);

    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

module.exports = {
    uploadController,
    getDocsController,
    getDocumentByIdController,
    deleteDocumentController
};