import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DecisionSummary from "../../components/verification/DecisionSummary";
import {
    approveVerificationRequest,
    getVerificationRequest,
    overrideVerificationResult,
    rejectVerificationRequest,
    viewVerificationRequest
} from "../../api/verifier.api";

function VerificationRequest() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [documentUrl, setDocumentUrl] = useState("");
    const [decision, setDecision] = useState("approved");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const refresh = useCallback(async () => {
        const response = await getVerificationRequest(id);
        setPayload(response.request);
    }, [id]);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(async () => {
            try { await refresh(); }
            catch (requestError) { if (active) setError(requestError.response?.data?.message || "Unable to load the assigned request."); }
            finally { if (active) setLoading(false); }
        });
        return () => { active = false; };
    }, [refresh]);

    const request = payload?.request;
    const document = payload?.documents?.[0];
    const results = payload?.results || [];
    const decisions = payload?.decisions || [];
    const latestResult = results[0];
    const existingDecision = latestResult ? decisions.find((item) => String(item.result) === String(latestResult._id)) : null;

    useEffect(() => {
        if (!document?._id) return undefined;
        let active = true;
        let objectUrl = "";
        viewVerificationRequest(document._id).then((blob) => {
            if (!active) return;
            objectUrl = URL.createObjectURL(blob);
            setDocumentUrl(objectUrl);
        }).catch(() => { if (active) setError("The submitted document preview could not be loaded."); });
        return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [document?._id]);

    const extractedFields = useMemo(() => Object.entries(latestResult?.result?.document?.fields || {}), [latestResult]);

    const handleOverride = async (event) => {
        event.preventDefault();
        if (!latestResult || reason.trim().length < 10) {
            setError("Provide a review reason of at least 10 characters."); return;
        }
        setSubmitting(true); setError("");
        try {
            await overrideVerificationResult(latestResult._id, decision, reason.trim(), "HUMAN_REVIEW");
            setReason("");
            await refresh();
        } catch (overrideError) {
            setError(overrideError.response?.data?.message || "The final decision could not be recorded.");
        } finally { setSubmitting(false); }
    };

    const handleLegacyReview = async (approved) => {
        if (!document) return;
        if (!approved && reason.trim().length < 10) {
            setError("Provide a rejection reason of at least 10 characters."); return;
        }
        setSubmitting(true); setError("");
        try {
            if (approved) await approveVerificationRequest(document._id);
            else await rejectVerificationRequest(document._id, reason.trim());
            navigate("/verifier");
        } catch (reviewError) {
            setError(reviewError.response?.data?.message || "The document review could not be completed.");
        } finally { setSubmitting(false); }
    };

    if (loading) return <main className="verification-shell">Loading verification request…</main>;
    if (!request) return <main className="verification-shell"><p className="form-error">{error || "Verification request not found."}</p></main>;

    const result = latestResult?.result;
    return (
        <main className="verification-shell">
            <header className="verification-header">
                <div><p className="eyebrow">Verifier workspace</p><h1>Evidence review</h1><p className="muted">Review model evidence and record an accountable final decision.</p></div>
                <span className={`status-chip status-${request.status}`}>{request.status.replaceAll("_", " ")}</span>
            </header>
            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="verification-grid">
                <div className="verification-stack">
                    {latestResult && <DecisionSummary summary={result} detailed />}

                    {document && (
                        <section className="verification-card">
                            <h2>Submitted document</h2>
                            {documentUrl && document.mimeType === "application/pdf" && <iframe className="document-frame" src={documentUrl} title={document.title} />}
                            {documentUrl && document.mimeType?.startsWith("image/") && <img className="document-preview" src={documentUrl} alt={document.title} />}
                            <dl className="detail-list">
                                <div><dt>Title</dt><dd>{document.title}</dd></div>
                                <div><dt>Declared type</dt><dd>{document.documentType}</dd></div>
                                <div><dt>Review status</dt><dd>{document.reviewStatus}</dd></div>
                                <div><dt>Size</dt><dd>{Math.round(document.fileSize / 1024)} KB</dd></div>
                            </dl>
                        </section>
                    )}

                    {extractedFields.length > 0 && (
                        <section className="verification-card">
                            <h2>Extracted fields</h2>
                            <p className="muted">Identity numbers remain masked. Confidence is evidence, not a final decision.</p>
                            <table className="field-table">
                                <thead><tr><th>Field</th><th>Value</th><th>Confidence</th><th>Format</th></tr></thead>
                                <tbody>{extractedFields.map(([name, field]) => (
                                    <tr key={name}><td>{name}</td><td>{field.valueMasked}</td><td>{Math.round(field.confidence * 100)}%</td><td>{field.formatValid ? "Valid" : "Review"}</td></tr>
                                ))}</tbody>
                            </table>
                        </section>
                    )}

                    {result && (
                        <section className="verification-card">
                            <h2>Quality checks</h2>
                            <table className="field-table">
                                <thead><tr><th>Evidence</th><th>Check</th><th>Score</th><th>Result</th></tr></thead>
                                <tbody>
                                    {[
                                        ...(result.document?.quality?.checks || []).map((check) => ({ ...check, source: "Document" })),
                                        ...(result.selfie?.quality?.checks || []).map((check) => ({ ...check, source: "Selfie" }))
                                    ].map((check) => (
                                        <tr key={`${check.source}-${check.code}`}>
                                            <td>{check.source}</td><td>{check.code.replaceAll("_", " ")}</td>
                                            <td>{Math.round(check.score * 100)}%</td><td>{check.passed ? "Passed" : "Review"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}
                </div>

                <aside className="verification-stack">
                    <section className="verification-card">
                        <h2>Request</h2>
                        <dl className="detail-list">
                            <div><dt>Applicant</dt><dd>{request.applicant?.username || "—"}</dd></div>
                            <div><dt>Email</dt><dd>{request.applicant?.email || "—"}</dd></div>
                            <div><dt>Organization</dt><dd>{request.organization?.name || "—"}</dd></div>
                            <div><dt>Workflow</dt><dd>{request.workflowTemplate?.name || "—"}</dd></div>
                        </dl>
                    </section>

                    {latestResult && !existingDecision && (
                        <section className="verification-card">
                            <p className="eyebrow">Human decision</p>
                            <h2>Finalize review</h2>
                            <form className="form-grid" onSubmit={handleOverride}>
                                <label className="form-field">Decision
                                    <select value={decision} onChange={(event) => setDecision(event.target.value)} disabled={submitting}>
                                        <option value="approved">Approve</option><option value="rejected">Reject</option>
                                    </select>
                                </label>
                                <label className="form-field">Reason
                                    <textarea rows="5" minLength="10" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence behind this decision…" disabled={submitting} />
                                </label>
                                <button className={decision === "rejected" ? "button-danger" : ""} disabled={submitting}>{submitting ? "Recording…" : `Record ${decision === "approved" ? "approval" : "rejection"}`}</button>
                            </form>
                        </section>
                    )}

                    {existingDecision && (
                        <section className="verification-card">
                            <p className="eyebrow">Final human decision</p>
                            <h2>{existingDecision.decision === "approved" ? "Approved" : "Rejected"}</h2>
                            <p>{existingDecision.reason}</p>
                            <p className="field-help">Recorded {new Date(existingDecision.createdAt).toLocaleString()}</p>
                        </section>
                    )}

                    {results.length > 0 && (
                        <section className="verification-card">
                            <h2>Attempt history</h2>
                            <div className="step-list">
                                {results.map((item) => {
                                    const humanDecision = decisions.find((entry) => String(entry.result) === String(item._id));
                                    return (
                                        <div className="step-item" key={item._id}>
                                            <div><strong>Attempt {item.attempt}</strong><div className="muted">{new Date(item.createdAt).toLocaleString()}</div></div>
                                            <span className={`status-chip status-${humanDecision?.decision || item.finalDecision}`}>
                                                {(humanDecision?.decision || item.finalDecision).replaceAll("_", " ")}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {!latestResult && document?.reviewStatus === "pending" && (
                        <section className="verification-card">
                            <h2>Document review</h2>
                            <p className="muted">This legacy step has no pipeline result. Review the document directly.</p>
                            <label className="form-field">Rejection reason
                                <textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
                            </label>
                            <div className="button-row">
                                <button onClick={() => handleLegacyReview(true)} disabled={submitting}>Approve</button>
                                <button className="button-danger" onClick={() => handleLegacyReview(false)} disabled={submitting}>Reject</button>
                            </div>
                        </section>
                    )}
                </aside>
            </div>
        </main>
    );
}

export default VerificationRequest;
