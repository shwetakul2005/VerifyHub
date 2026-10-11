const LABELS = {
    approved: "Approved",
    manual_review: "Manual review",
    rejected: "Rejected"
};

const REASON_LABELS = {
    DOCUMENT_TOO_BLURRY: "The document image is too blurry.",
    DOCUMENT_TOO_DARK: "The document image is too dark.",
    DOCUMENT_TOO_BRIGHT: "The document image is too bright.",
    DOCUMENT_LOW_CONTRAST: "The document has low contrast.",
    DOCUMENT_GLARE: "Glare obscures part of the document.",
    DOCUMENT_TYPE_UNCERTAIN: "The document type could not be identified confidently.",
    DOCUMENT_TYPE_MISMATCH: "The detected document type differs from the requested type.",
    REQUIRED_FIELD_MISSING: "A required document field could not be extracted.",
    FIELD_LOW_CONFIDENCE: "One or more extracted fields need human confirmation.",
    AADHAAR_FORMAT_INVALID: "The extracted Aadhaar number did not pass format validation.",
    PAN_FORMAT_INVALID: "The extracted PAN did not pass format validation.",
    DOCUMENT_FACE_MISSING: "No face was found on the document.",
    DOCUMENT_MULTIPLE_FACES: "Multiple faces were found on the document.",
    SELFIE_FACE_MISSING: "No face was found in the selfie.",
    SELFIE_MULTIPLE_FACES: "Multiple faces were found in the selfie.",
    SELFIE_TOO_DARK: "The selfie is too dark.",
    SELFIE_TOO_BLURRY: "The selfie is too blurry.",
    SELFIE_QUALITY_LOW: "The selfie image quality is too low.",
    FACE_SIMILARITY_UNCERTAIN: "Face similarity needs human review.",
    FACE_MISMATCH: "The face comparison did not meet the configured threshold.",
    EVIDENCE_CONFLICT: "The submitted evidence contains conflicting signals."
};

function formatReasonCode(code) {
    return REASON_LABELS[code] || code.toLowerCase().replaceAll("_", " ");
}

function DecisionSummary({ summary, detailed = false }) {
    if (!summary) return null;

    const decision = summary.finalDecision || summary.automaticDecision;
    const documentQualityScore = typeof summary.documentQuality === "number"
        ? summary.documentQuality : summary.document?.quality?.score;
    const selfieQualityScore = typeof summary.selfieQuality === "number"
        ? summary.selfieQuality : summary.selfie?.quality?.score;
    const faceComparison = summary.faceComparison;

    return (
        <section className="verification-card decision-summary" aria-live="polite">
            <div className="card-heading-row">
                <div>
                    <p className="eyebrow">Verification result</p>
                    <h2>{LABELS[decision] || "Processing"}</h2>
                </div>
                <span className={`status-chip status-${decision || "pending"}`}>
                    {LABELS[decision] || "Pending"}
                </span>
            </div>

            <p className="muted">
                {decision === "manual_review"
                    ? "Your evidence needs a trained verifier to make the final decision."
                    : decision === "approved"
                        ? "The submitted evidence passed the configured verification checks."
                        : decision === "rejected"
                            ? "The submitted evidence did not pass one or more required checks."
                            : "The result is still being prepared."}
            </p>

            {detailed && (
                <div className="metric-grid">
                    <Metric label="Document quality" value={documentQualityScore} />
                    <Metric label="Selfie quality" value={selfieQualityScore} />
                    <Metric label="Face similarity" value={faceComparison?.similarity} />
                    <Metric label="Match threshold" value={faceComparison?.threshold} />
                </div>
            )}

            {summary.reasonCodes?.length > 0 && (
                <ul className="reason-list">
                    {summary.reasonCodes.map((code) => (
                        <li key={code}>{formatReasonCode(code)}</li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function Metric({ label, value }) {
    const display = typeof value === "number" ? `${Math.round(value * 100)}%` : "Not available";
    return (
        <div className="metric">
            <span>{label}</span>
            <strong>{display}</strong>
        </div>
    );
}

export default DecisionSummary;
