import api from "./axios";

export const getPendingDocuments = async () => {
    const response = await api.get("/verifier/pending");
    return response.data;
};