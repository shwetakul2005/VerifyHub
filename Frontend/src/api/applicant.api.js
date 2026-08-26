import api from "./axios";

export const getAllRequests = async () => {
    const response = await api.get("/verification-requests");
    return response.data.verificationRequests;
};

// export const getReqById = async (reqId)=>{
//     const response = await api.get(`/verification-requests/${reqId}`);
//     return response.data.verificationRequest;
// }

// import api from "./axios";

export const getVerificationRequests = async () => {
    const response = await api.get("/verification-requests");
    return response.data;
};

export const getReqById = async (id) => {
    const response = await api.get(`/verification-requests/${id}`);
    return response.data.verificationRequest;
};

export const uploadVerificationDocument = async (
    requestId,
    file,
    title,
    documentType
) => {
    const formData = new FormData();

    formData.append("document", file);
    formData.append("title", title);
    formData.append("documentType", documentType);

    const response = await api.post(
        `/verification-requests/${requestId}/documents`,
        formData
    );

    return response.data;
};

export const startEmailVerification = async (requestId) => {
    const response = await api.post(`/verification-requests/${requestId}/email-verification`);
    return response.data;
};

export const verifyEmailToken = async (token) => {
    const response = await api.get(`/email/verify/${token}`);
    return response.data;
};

export const getDocuments = async (requestId) => {
    const response = await api.get(`/verification-requests/${requestId}/documents`);
    return response.data.documents;
};