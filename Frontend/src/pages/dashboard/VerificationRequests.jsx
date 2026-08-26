import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
    getReqById,
    uploadVerificationDocument,
    startEmailVerification
} from "../../api/applicant.api";

function VerificationRequest() {
    const { id } = useParams();

    const [verification, setVerification] = useState(null);

    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);

    const [error, setError] = useState(null);
    const [success, setSuccess] = useState("");

    const [title, setTitle] = useState("");
    const [file, setFile] = useState(null);

    // Fetch verification request
    const fetchRequest = async () => {
        try {
            setLoading(true);

            const data = await getReqById(id);

            console.log("Verification request:", data);

            setVerification(data);
        } catch (error) {
            console.error(
                "Failed to fetch verification request:",
                error
            );

            setError(
                error.response?.data?.message ||
                "Failed to load verification request."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequest();
    }, [id]);

    // Handle file selection
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];

        if (!selectedFile) {
            return;
        }

        setFile(selectedFile);
        setError(null);
        setSuccess("");
    };

    // Handle upload
    const handleUpload = async (event) => {
        event.preventDefault();

        setError(null);
        setSuccess("");

        if (!title.trim()) {
            setError("Please enter a document title.");
            return;
        }

        if (!file) {
            setError("Please select a document.");
            return;
        }

        const documentType =
            verification?.currentStep?.config?.documentType;

        if (!documentType) {
            setError("Document type is not available.");
            return;
        }

        try {
            setUploading(true);

            console.log("Uploading document:", {
                requestId: id,
                title,
                documentType,
                file
            });

            await uploadVerificationDocument(
                id,
                file,
                title,
                documentType
            );

            setSuccess("Document uploaded successfully.");

            // Clear form
            setTitle("");
            setFile(null);

            // Reset file input
            event.target.reset();

            // Fetch updated verification request
            await fetchRequest();

        } catch (error) {
            console.error(
                "Document upload failed:",
                error
            );

            setError(
                error.response?.data?.message ||
                "Failed to upload document."
            );
        } finally {
            setUploading(false);
        }
    };

    const handleEmailVerification = async () => {
        setError(null);
        setSuccess("");

        try {
            setSendingEmail(true);
            await startEmailVerification(id);
            setSuccess("Verification email sent. Please check your inbox.");
        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to send verification email."
            );
        } finally {
            setSendingEmail(false);
        }
    };

    if (loading) {
        return <div>Loading verification request...</div>;
    }

    if (error && !verification) {
        return <div>{error}</div>;
    }

    if (!verification) {
        return <div>Verification request not found.</div>;
    }

    const currentStep = verification.currentStep;

    return (
        <main>
            <h1>Verification Request</h1>

            {/* Request information */}

            <section>
                <h2>Request Information</h2>

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
            </section>

            <hr />

            {/* Current step */}

            <section>
                <h2>{currentStep?.title}</h2>

                <p>
                    {currentStep?.description}
                </p>

                <p>
                    <strong>Step type:</strong>{" "}
                    {currentStep?.stepType}
                </p>
            </section>

            {/* Error */}

            {error && (
                <p>
                    <strong>Error:</strong> {error}
                </p>
            )}

            {/* Success */}

            {success && (
                <p>
                    <strong>{success}</strong>
                </p>
            )}

            {/* EMAIL STEP */}

            {currentStep?.stepType === "email" && (
                <section>
                    <h2>Email Verification</h2>

                    <p>
                        Please verify your email address.
                    </p>

                    <button
                        type="button"
                        onClick={handleEmailVerification}
                        disabled={sendingEmail}
                    >
                        {sendingEmail ? "Sending..." : "Verify Email"}
                    </button>
                </section>
            )}

            {/* DOCUMENT STEP */}

            {currentStep?.stepType === "document" && (
                <section>
                    <h2>Document Verification</h2>

                    <p>
                        Required document:{" "}
                        <strong>
                            {currentStep?.config?.documentType}
                        </strong>
                    </p>

                    <form onSubmit={handleUpload}>

                        <div>
                            <label>
                                Document Title
                            </label>

                            <input
                                type="text"
                                value={title}
                                onChange={(event) =>
                                    setTitle(event.target.value)
                                }
                                placeholder="Enter document title"
                                disabled={uploading}
                            />
                        </div>

                        <br />

                        <div>
                            <label>
                                Select Document
                            </label>

                            <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf"
                                onChange={handleFileChange}
                                disabled={uploading}
                            />
                        </div>

                        <br />

                        {file && (
                            <p>
                                Selected file:{" "}
                                <strong>
                                    {file.name}
                                </strong>
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={uploading}
                        >
                            {uploading
                                ? "Uploading..."
                                : "Upload Document"}
                        </button>

                    </form>
                </section>
            )}

            {/* COMPLETED */}

            {verification.status === "completed" && (
                <section>
                    <h2>Verification Completed</h2>

                    <p>
                        Your verification request has been completed.
                    </p>
                </section>
            )}

            {/* REJECTED */}

            {verification.status === "rejected" && (
                <section>
                    <h2>Verification Rejected</h2>

                    <p>
                        Your verification request has been rejected.
                    </p>
                </section>
            )}
        </main>
    );
}

export default VerificationRequest;