const VerificationRequestModel = require("../models/verification-request.model");
const VerificationDocumentModel = require("../models/verification-document.model");

async function assertApplicantOwnsRequest(requestId, applicantId) {
    const request = await VerificationRequestModel.findOne({
        _id: requestId,
        applicant: applicantId
    });

    if (!request) {
        throw new Error("Verification request not found.");
    }

    return request;
}

async function assertApplicantOwnsDocument(documentId, applicantId) {
    const document = await VerificationDocumentModel.findOne({
        _id: documentId
    }).populate({
        path: "verificationRequest",
        match: { applicant: applicantId }
    });

    if (!document || !document.verificationRequest) {
        throw new Error("Document not found.");
    }

    return document;
}

module.exports = {
    assertApplicantOwnsRequest,
    assertApplicantOwnsDocument
};