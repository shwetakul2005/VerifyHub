import api from "./axios";

export const getPendingDocuments = async () => {
    const response = await api.get("/verifier/pending");
    return response.data;
};

export const getVerificationRequest = async (id) => {
    const response = await api.get(`/verifier/request/${id}`);
    return response.data;
};

export const overrideVerificationResult = async (
    resultId,
    decision,
    reason,
    reasonCode = null,
    idempotencyKey = crypto.randomUUID()
) => {
    const response = await api.post(
        `/verifier/results/${resultId}/decision`,
        { decision, reason, ...(reasonCode ? { reasonCode } : {}) },
        { headers: { "Idempotency-Key": idempotencyKey } }
    );
    return response.data;
};

export const approveVerificationRequest = async (Docid) => {
    const response = await api.post(`/verifier/documents/${Docid}/approve`);
    return response.data;

}

export const rejectVerificationRequest = async (documentId, rejectionReason) => {
    const response = await api.post(
        `/verifier/documents/${documentId}/reject`,
        {
            rejectionReason:rejectionReason
        }
    );

    return response.data;
};

export const viewVerificationRequest = async (documentId) => {
    const response = await api.get(
        `/verifier/documents/${documentId}/file`,
        {
            responseType: "blob",
        }
    );

    return response.data;
};
