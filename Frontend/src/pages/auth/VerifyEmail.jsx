import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verifyEmailToken } from "../../api/applicant.api";

function VerifyEmail() {
    const { token } = useParams();
    const [status, setStatus] = useState("loading");
    const [message, setMessage] = useState("Verifying your email...");

    useEffect(() => {
        const verify = async () => {
            try {
                const result = await verifyEmailToken(token);
                setStatus("success");
                setMessage(result.message);
            } catch (error) {
                setStatus("error");
                setMessage(
                    error.response?.data?.message ||
                    "Unable to verify your email."
                );
            }
        };

        verify();
    }, [token]);

    return (
        <main>
            <h1>Email Verification</h1>
            <p>{message}</p>
            {status === "success" && (
                <a href="/dashboard">Return to dashboard</a>
            )}
        </main>
    );
}

export default VerifyEmail;
