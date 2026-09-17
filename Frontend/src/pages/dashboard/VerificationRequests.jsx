import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
    getReqById,
    getDocuments,
    uploadVerificationDocument,
    startEmailVerification,
    getApplicantWorkflow,
    submitFaceVerification
} from "../../api/applicant.api";
import { getRequestStatusMeta } from "./requestStatus";

function VerificationRequest() {
    const { id } = useParams();

    const [verification, setVerification] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [workflow, setWorkflow] = useState(null);

    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [submittingFaceVerification, setSubmittingFaceVerification] = useState(false);

    const [error, setError] = useState(null);
    const [success, setSuccess] = useState("");

    const [title, setTitle] = useState("");
    const [file, setFile] = useState(null);
    const [documentImage, setDocumentImage] = useState(null);
    const [liveSelfie, setLiveSelfie] = useState(null);

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

    const fetchDocuments = async () => {
        try {
            const data = await getDocuments(id);
            setDocuments(data);
        } catch (error) {
            if (error.response?.status !== 400) {
                setError(
                    error.response?.data?.message ||
                    "Failed to load uploaded documents."
                );
            }
        }
    };

    const fetchWorkflow = async () => {
        console.log(`id is ${id}`);
        try {
            const data = await getApplicantWorkflow(id);
            setWorkflow(data);
        } catch (error) {
            console.error("Failed to fetch applicant workflow:", error);
            setError(
                error.response?.data?.message ||
                "Failed to load workflow details."
            );
        }
    };

    useEffect(() => {
        fetchRequest();
        fetchDocuments();
        fetchWorkflow();
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
            await fetchDocuments();

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

    const handleFaceVerificationSubmit = async (event) => {
        event.preventDefault();

        setError(null);
        setSuccess("");

        if (!documentImage) {
            setError("Please upload the document image.");
            return;
        }

        if (!liveSelfie) {
            setError("Please upload your live selfie.");
            return;
        }

        try {
            setSubmittingFaceVerification(true);
            const response = await submitFaceVerification(id, documentImage, liveSelfie);

            if (response?.success) {
                setSuccess(response.message || "Face verification completed successfully.");
            } else {
                setError(response?.message || "Face verification failed.");
            }

            await fetchRequest();
            await fetchWorkflow();
            await fetchDocuments();

            setDocumentImage(null);
            setLiveSelfie(null);
            event.target.reset();
        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to verify your face."
            );
        } finally {
            setSubmittingFaceVerification(false);
        }
    };

    const handleWorkflowStepClick = (step) => {
        if (step.status === "completed") {
            setSuccess(`${step.title} has already been completed.`);
            return;
        }

        if (step.status === "failed") {
            setError(`${step.title} failed and cannot be edited. Please review the next available step.`);
            return;
        }

        if (step.status === "current") {
            setSuccess(`Continue with ${step.title}.`);

            const targetId =
                step.stepType === "email"
                    ? "email-step-section"
                    : step.stepType === "document"
                        ? "document-step-section"
                        : step.stepType === "face_verification"
                            ? "face-verification-step-section"
                            : "verification-step-section";
            return;
        }

        setError("This step is locked until the previous step is completed.");
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
    const requestStatusMeta = getRequestStatusMeta(verification);
    const pendingDocument = documents.find(
        (document) => document.reviewStatus === "pending"
    );
    const currentStepDocument = documents.find(
        (document) => document.workflowStep?._id === currentStep?._id
    );

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

            {workflow?.steps?.length > 0 && (
                <section>
                    <h2>Verification Flow</h2>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {workflow.steps.map((step) => (
                            <button
                                key={step.id}
                                type="button"
                                onClick={() => handleWorkflowStepClick(step)}
                                disabled={step.status === "pending" || step.status === "failed"}
                                style={{
                                    textAlign: "left",
                                    padding: "12px 16px",
                                    borderRadius: "10px",
                                    border: "1px solid #d0d7de",
                                    backgroundColor:
                                        step.status === "completed"
                                            ? "#e6ffed"
                                            : step.status === "current"
                                                ? "#fff7d6"
                                                : step.status === "failed"
                                                    ? "#ffebe9"
                                                    : "#f6f8fa",
                                    cursor: step.status === "pending" || step.status === "failed" ? "not-allowed" : "pointer",
                                    opacity: step.status === "pending" || step.status === "failed" ? 0.8 : 1,
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: "12px"
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700 }}>
                                        {step.stepOrder}. {step.title}
                                    </div>
                                    <div style={{ fontSize: "0.9rem", color: "#57606a" }}>
                                        {step.stepType}
                                    </div>
                                </div>

                                <span
                                    style={{
                                        fontSize: "0.8rem",
                                        padding: "4px 8px",
                                        borderRadius: "999px",
                                        backgroundColor:
                                            step.status === "completed"
                                                ? "#1a7f37"
                                                : step.status === "current"
                                                    ? "#b7791f"
                                                    : step.status === "failed"
                                                        ? "#cf222e"
                                                        : "#6e7781",
                                        color: "white",
                                        fontWeight: 600
                                    }}
                                >
                                    {step.status === "completed"
                                        ? "Completed"
                                        : step.status === "current"
                                            ? "Current"
                                            : step.status === "failed"
                                                ? "Failed"
                                                : "Pending"}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {!requestStatusMeta.isCompleted && (
                <>
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
                </>
            )}

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
                <section id="email-step-section">
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
                <section id="document-step-section">
                    <h2>Document Verification</h2>

                    <p>
                        Required document:{" "}
                        <strong>
                            {currentStep?.config?.documentType}
                        </strong>
                    </p>

                    {currentStepDocument?.reviewStatus === "pending" ? (
                        <p>
                            Your document is uploaded and waiting for verifier review.
                        </p>
                    ) : (
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
                    )}
                </section>
            )}

            {currentStep?.stepType === "face_verification" && (
                <section id="face-verification-step-section">
                    <h2>Face Verification</h2>

                    <p>
                        Upload the document image and a live selfie to verify your identity.
                    </p>

                    <form onSubmit={handleFaceVerificationSubmit}>
                        <div>
                            <label>Document image</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(event) => setDocumentImage(event.target.files[0])}
                                disabled={submittingFaceVerification}
                            />
                        </div>

                        <br />

                        <div>
                            <label>Live selfie</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(event) => setLiveSelfie(event.target.files[0])}
                                disabled={submittingFaceVerification}
                            />
                        </div>

                        <br />

                        <button type="submit" disabled={submittingFaceVerification}>
                            {submittingFaceVerification ? "Verifying..." : "Submit Face Verification"}
                        </button>
                    </form>
                </section>
            )}

            {pendingDocument && currentStep?.stepType !== "document" && (
                <section id="verification-step-section">
                    <h2>Document Submitted</h2>
                    <p>
                        {pendingDocument.title} is waiting for verifier review.
                        You may continue with the current verification step.
                    </p>
                </section>
            )}

            {/* COMPLETED */}

            {(verification.status === "completed" || !currentStep) && (
                <section>
                    <h2>{requestStatusMeta.banner}</h2>

                    <p>
                        {requestStatusMeta.message}
                    </p>
                </section>
            )}

            {/* REJECTED */}

            {verification.status === "rejected" && (
                <section>
                    <h2>{requestStatusMeta.banner}</h2>

                    <p>
                        {requestStatusMeta.message}
                    </p>
                </section>
            )}
        </main>
    );
}

export default VerificationRequest;