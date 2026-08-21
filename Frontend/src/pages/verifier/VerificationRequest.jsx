import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getVerificationRequest,  approveVerificationRequest, rejectVerificationRequest, viewVerificationRequest} from "../../api/verifier.api";


function VerificationRequest() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [documentUrl, setDocumentUrl] = useState(null);

    const [showRejectForm, setShowRejectForm] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");
    const [rejecting, setRejecting] = useState(false);

    const handleApprove = async () => {
        try {
            
            console.log("Approving document:", document._id);
            
            await approveVerificationRequest(document._id);
            
            console.log("Approval successful");
            console.log("Navigating to /verifier");
            navigate("/verifier");
        } catch (error) {
            console.error("Approval failed:", error);
        }
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            alert("Please provide a rejection reason.");
            return;
        }

        try {
            setRejecting(true);

            await rejectVerificationRequest(
                document._id,
                rejectionReason
            );

            navigate("/verifier");

        } catch (error) {
            console.error("Rejection failed:", error);
            alert("Failed to reject document.");
        } finally {
            setRejecting(false);
        }
    };

    useEffect(() => {
        const fetchRequest = async () => {
            console.log("fetchRequest started");
            console.log("id:", id);

            try {
                const data = await getVerificationRequest(id);

                console.log("Verification request data:", data);

                setRequest(data);
            } catch (error) {
                console.error(
                    "Failed to fetch verification request:",
                    error
                );
            } finally {
                setLoading(false);
            }
        };

        fetchRequest();
    }, [id]);

    // const verificationData = request.request;

    const verificationData = request?.request;
    const document = verificationData?.documents?.[0];

    const applicant = verificationData?.request?.applicant;
    const organization = verificationData?.request?.organization;
    const workflow = verificationData?.request?.workflowTemplate;
    const currentStep = verificationData?.request?.currentStep;

    // const document = verificationData.documents?.[0];


    // -----------------------------------------------------------------------
    useEffect(() => {                                                    
    let url;

    const fetchDocument = async () => {
        try {
            const blob = await viewVerificationRequest(document?._id);

            url = URL.createObjectURL(blob);

            setDocumentUrl(url);
        } catch (error) {
            console.error("Failed to load document:", error);
        }
    };

    if (document?._id) {
        fetchDocument();
    }

    return () => {
        if (url) {
            URL.revokeObjectURL(url);
        }
    };
}, [document?._id]);
// ------------------------------------------------------------------------

if (loading) {
        return <div>Loading verification request...</div>;
    }

    if (!request) {
        return <div>Verification request not found.</div>;
    }

    return (
        <main>
            <h1>Verification Request</h1>

            {/* Request Information */}
            <section>
                <h2>Request Information</h2>

                <p>
                    <strong>Request ID:</strong>{" "}
                    {verificationData.request?._id}
                </p>

                <p>
                    <strong>Status:</strong>{" "}
                    {verificationData.request?.status}
                </p>
            </section>

            {/* Applicant */}
            <section>
                <h2>Applicant</h2>

                <p>
                    <strong>Username:</strong>{" "}
                    {applicant?.username}
                </p>

                <p>
                    <strong>Email:</strong>{" "}
                    {applicant?.email}
                </p>
            </section>

            {/* Organization */}
            <section>
                <h2>Organization</h2>

                <p>
                    <strong>Name:</strong>{" "}
                    {organization?.name}
                </p>

                <p>
                    <strong>Status:</strong>{" "}
                    {organization?.status}
                </p>
            </section>

            {/* Workflow */}
            <section>
                <h2>Workflow</h2>

                <p>
                    <strong>Name:</strong>{" "}
                    {workflow?.name}
                </p>

                <p>
                    <strong>Description:</strong>{" "}
                    {workflow?.description}
                </p>
            </section>

            {/* Current Step */}
            <section>
                <h2>Current Verification Step</h2>

                <p>
                    <strong>Step:</strong>{" "}
                    {currentStep?.title}
                </p>

                <p>
                    <strong>Type:</strong>{" "}
                    {currentStep?.stepType}
                </p>

                <p>
                    <strong>Document Type:</strong>{" "}
                    {currentStep?.config?.documentType}
                </p>

                <p>
                    <strong>Required:</strong>{" "}
                    {currentStep?.isRequired ? "Yes" : "No"}
                </p>
            </section>

            {/* Document */}
            {document && (
                <section>
                    <h2>Document</h2>
                    {documentUrl && document?.mimeType === "application/pdf" && (

                        <iframe
                            src={documentUrl}
                            title={document.title}
                            width="100%"
                            height="600px"
                            />

                    )}
                    {documentUrl && document?.mimeType.startsWith("image/") && (
                        

                            <img
                            src={documentUrl}
                            alt={document.title}
                            style={{
                                maxWidth: "600px",
                                width: "100%",
                            }}
                            />
                            
                    )}

                    <p>
                        <strong>Title:</strong>{" "}
                        {document.title}
                    </p>

                    <p>
                        <strong>Type:</strong>{" "}
                        {document.documentType}
                    </p>

                    <p>
                        <strong>File:</strong>{" "}
                        {document.fileName}
                    </p>

                    <p>
                        <strong>Review Status:</strong>{" "}
                        {document.reviewStatus}
                    </p>

                    <p>
                        <strong>File Size:</strong>{" "}
                        {(document.fileSize / 1024).toFixed(2)} KB
                    </p>
                </section>
            )}

            {/* OCR / Extracted Data */}
            {document?.metadata?.extracted?.result && (
                <section>
                    <h2>Extracted Information</h2>

                    <p>
                        <strong>Name:</strong>{" "}
                        {document.metadata.extracted.result.name || "Not available"}
                    </p>

                    <p>
                        <strong>Aadhaar Number:</strong>{" "}
                        {document.metadata.extracted.result.aadhaarNumber || "Not available"}
                    </p>

                    <p>
                        <strong>Date of Birth:</strong>{" "}
                        {document.metadata.extracted.result.dob || "Not available"}
                    </p>

                    <p>
                        <strong>Gender:</strong>{" "}
                        {document.metadata.extracted.result.gender || "Not available"}
                    </p>
                </section>
            )}
    {/* <section> */}
            {document?.reviewStatus === "pending" && (
                <section>
                    <h2>Verification Actions</h2>

                    <button onClick= {handleApprove}>
                        Approve
                    </button>

                    <button onClick={() => setShowRejectForm(true)}>
                        Reject
                    </button>

                    {showRejectForm && (
                        <div>
                            <h3>Rejection Reason</h3>

                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Enter reason for rejecting this document..."
                                rows={4}
                            />

                            <button
                                onClick={handleReject}
                                disabled={rejecting}
                            >
                                {rejecting ? "Rejecting..." : "Confirm Rejection"}
                            </button>

                            <button
                                onClick={() => {
                                    setShowRejectForm(false);
                                    setRejectionReason("");
                                }}
                                disabled={rejecting}
                            >
                                Cancel
                            </button>
                        </div>
)}
                </section>
            )}
         {/* </section> */}
        </main>
    );
}

export default VerificationRequest;