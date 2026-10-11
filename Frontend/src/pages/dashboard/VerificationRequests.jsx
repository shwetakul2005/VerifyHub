import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DecisionSummary from "../../components/verification/DecisionSummary";
import SelfieCapture from "../../components/verification/SelfieCapture";
import { getApplicantWorkflow, getDocuments, getReqById, startEmailVerification, submitFaceVerification, uploadVerificationDocument } from "../../api/applicant.api";
import { getRequestStatusMeta } from "./requestStatus";

function VerificationRequest() {
    const { id } = useParams();
    const [verification, setVerification] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [workflow, setWorkflow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [title, setTitle] = useState("");
    const [file, setFile] = useState(null);
    const [documentImage, setDocumentImage] = useState(null);
    const [selfie, setSelfie] = useState(null);
    const [latestResult, setLatestResult] = useState(null);

    const refresh = useCallback(async () => {
        const [request, uploadedDocuments, flow] = await Promise.all([
            getReqById(id), getDocuments(id), getApplicantWorkflow(id)
        ]);
        setVerification(request);
        setDocuments(uploadedDocuments);
        setWorkflow(flow);
    }, [id]);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(async () => {
            try { await refresh(); }
            catch (requestError) {
                if (active) setError(requestError.response?.data?.message || "Unable to load this verification request.");
            } finally { if (active) setLoading(false); }
        });
        return () => { active = false; };
    }, [refresh]);

    const runAction = async (name, action, message) => {
        setBusy(name); setError(""); setSuccess("");
        try {
            const response = await action();
            setSuccess(response?.message || message);
            if (response?.result) setLatestResult(response.result);
            await refresh();
            return true;
        } catch (actionError) {
            setError(actionError.response?.data?.message || "The operation could not be completed. Please try again.");
            return false;
        } finally { setBusy(""); }
    };

    const handleUpload = async (event) => {
        event.preventDefault();
        const documentType = verification?.currentStep?.config?.documentType;
        if (!title.trim() || !file || !documentType) {
            setError("Enter a title and select the required document before uploading."); return;
        }
        const complete = await runAction("document", () => uploadVerificationDocument(id, file, title.trim(), documentType), "Document uploaded safely.");
        if (complete) { setTitle(""); setFile(null); event.currentTarget.reset(); }
    };

    const handleFaceSubmit = async (event) => {
        event.preventDefault();
        if (!documentImage || !selfie) {
            setError("Select a clear document image and capture or choose a selfie."); return;
        }
        const complete = await runAction("identity", () => submitFaceVerification(id, documentImage, selfie), "Evidence processed.");
        if (complete) { setDocumentImage(null); setSelfie(null); event.currentTarget.reset(); }
    };

    if (loading) return <main className="verification-shell">Loading verification request…</main>;
    if (!verification) return <main className="verification-shell"><p className="form-error">{error || "Verification request not found."}</p></main>;

    const currentStep = verification.currentStep;
    const status = getRequestStatusMeta(verification);
    const summary = latestResult || verification.verificationSummary;
    const currentDocument = documents.find((item) => item.workflowStep?._id === currentStep?._id);

    return (
        <main className="verification-shell">
            <header className="verification-header">
                <div>
                    <p className="eyebrow">VerifyHub applicant portal</p>
                    <h1>{verification.workflowTemplate?.name || "Identity verification"}</h1>
                    <p className="muted">Complete each step in order. Sensitive identifiers are masked in stored results.</p>
                </div>
                <span className={`status-chip status-${verification.status}`}>{verification.status.replaceAll("_", " ")}</span>
            </header>

            {error && <p className="form-error" role="alert">{error}</p>}
            {success && <p className="form-success" role="status">{success}</p>}
            {summary && <DecisionSummary summary={summary} />}

            <div className="verification-grid">
                <div className="verification-stack">
                    {!status.isTerminal && currentStep && (
                        <section className="verification-card">
                            <p className="eyebrow">Current step</p>
                            <h2>{currentStep.title}</h2>
                            <p className="muted">{currentStep.description}</p>

                            {currentStep.stepType === "email" && (
                                <button type="button" onClick={() => runAction("email", () => startEmailVerification(id), "Verification email sent.")} disabled={Boolean(busy)}>
                                    {busy === "email" ? "Sending…" : "Send verification email"}
                                </button>
                            )}

                            {currentStep.stepType === "document" && (
                                currentDocument?.reviewStatus === "pending" ? <p className="form-success">{currentDocument.title} is waiting for verifier review.</p> : (
                                    <form className="form-grid" onSubmit={handleUpload}>
                                        <p>Required document: <strong>{currentStep.config?.documentType}</strong></p>
                                        <label className="form-field">Document title
                                            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} disabled={Boolean(busy)} />
                                        </label>
                                        <label className="file-label">Document file
                                            <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={Boolean(busy)} />
                                        </label>
                                        <p className="field-help">Use a sharp, evenly lit image with all corners visible. PDF, JPG and PNG are accepted.</p>
                                        <button type="submit" disabled={Boolean(busy)}>{busy === "document" ? "Uploading…" : "Upload document"}</button>
                                    </form>
                                )
                            )}

                            {currentStep.stepType === "face_verification" && (
                                <form className="form-grid" onSubmit={handleFaceSubmit}>
                                    <div>
                                        <h3>Document photo</h3>
                                        <label className="file-label">Choose the identity document image
                                            <input type="file" accept="image/*" onChange={(event) => setDocumentImage(event.target.files?.[0] || null)} disabled={Boolean(busy)} />
                                        </label>
                                    </div>
                                    <div><h3>Selfie</h3><SelfieCapture value={selfie} onChange={setSelfie} disabled={Boolean(busy)} /></div>
                                    <button type="submit" disabled={Boolean(busy)}>{busy === "identity" ? "Processing securely…" : "Compare identity evidence"}</button>
                                </form>
                            )}
                        </section>
                    )}

                    {status.isTerminal && <section className="verification-card"><h2>{status.banner}</h2><p>{status.message}</p></section>}
                </div>

                <aside className="verification-stack">
                    <section className="verification-card">
                        <h2>Request details</h2>
                        <dl className="detail-list">
                            <div><dt>Organization</dt><dd>{verification.organization?.name || "—"}</dd></div>
                            <div><dt>Status</dt><dd>{verification.status.replaceAll("_", " ")}</dd></div>
                            <div><dt>Documents</dt><dd>{documents.length}</dd></div>
                            <div><dt>Request ID</dt><dd>{verification._id}</dd></div>
                        </dl>
                    </section>

                    {workflow?.steps?.length > 0 && (
                        <section className="verification-card">
                            <h2>Verification flow</h2>
                            <div className="step-list">
                                {workflow.steps.map((step) => (
                                    <div key={step.id} className={`step-item step-${step.status}`}>
                                        <div><strong>{step.stepOrder}. {step.title}</strong><div className="muted">{step.stepType.replaceAll("_", " ")}</div></div>
                                        <span className={`status-chip status-${step.status}`}>{step.status}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </aside>
            </div>
        </main>
    );
}

export default VerificationRequest;
