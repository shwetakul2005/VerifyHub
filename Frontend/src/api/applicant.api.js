import api from "./axios";

export const getAllRequests = async () => {
    const response = await api.get("/verification-requests");
    return response.data.verificationRequests;
};

export const getReqById = async (reqId)=>{
    const response = await api.get(`/verification-requests/${reqId}`);
    return response.data.verificationRequest;
}
