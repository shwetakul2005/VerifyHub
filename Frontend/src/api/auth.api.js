import api from "./axios";

export const loginUser = async (data) => {
    const response = await api.post("/auth/login", data);
    return response.data;
};

export const registerUser = async (data) => {
    const response = await api.post("/auth/register", data);
    return response.data;
};

export const getCurrentUser = async () => {
    const response = await api.get("/auth/get-me");
    return response.data;
};

export const logoutUser = async () => {
    const response = await api.get("/auth/logout");
    return response.data;
};