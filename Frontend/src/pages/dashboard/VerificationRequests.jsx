import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getReqById } from "../../api/applicant.api";

function UserSingleVerificationRequest() {
    const { id } = useParams();

    const [verification, setVerification] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRequest = async () => {
            try {
                const data = await getReqById(id);

                console.log("Verification request:", data);

                setVerification(data);
            } catch (error) {
                console.error(
                    "Failed to fetch verification request:",
                    error
                );

                setError("Failed to load verification request.");
            } finally {
                setLoading(false);
            }
        };

        fetchRequest();
    }, [id]);

    if (loading) {
        return <div>Loading verification request...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    if (!verification) {
        return <div>Verification request not found.</div>;
    }

    return (
        <main>
            <h1>Verification Request</h1>

            <p>
                <strong>Request ID:</strong>{" "}
                {verification._id}
            </p>

            <p>
                <strong>Organization:</strong>{" "}
                {verification.organization?.name}
            </p>

            <p>
                <strong>Workflow:</strong>{" "}
                {verification.workflowTemplate?.name}
            </p>

            <p>
                <strong>Status:</strong>{" "}
                {verification.status}
            </p>

            <h2>Current Step</h2>

            <p>
                <strong>Step:</strong>{" "}
                {verification.currentStep?.title}
            </p>

            <p>
                <strong>Type:</strong>{" "}
                {verification.currentStep?.stepType}
            </p>

            <p>
                <strong>Description:</strong>{" "}
                {verification.currentStep?.description}
            </p>
        </main>
    );
}

export default UserSingleVerificationRequest;