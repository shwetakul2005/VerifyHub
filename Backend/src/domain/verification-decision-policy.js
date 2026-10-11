const DETERMINISTIC_REJECTIONS = new Set([
    "DOCUMENT_UNSUPPORTED_FORMAT", "DOCUMENT_CORRUPT", "DOCUMENT_TYPE_MISMATCH",
    "PAN_FORMAT_INVALID", "AADHAAR_FORMAT_INVALID"
]);
const REUPLOADABLE_FAILURES = new Set([
    "DOCUMENT_TOO_SMALL", "DOCUMENT_TOO_BLURRY", "DOCUMENT_TOO_DARK",
    "DOCUMENT_TOO_BRIGHT", "DOCUMENT_LOW_CONTRAST", "DOCUMENT_GLARE",
    "DOCUMENT_FACE_MISSING", "DOCUMENT_MULTIPLE_FACES", "SELFIE_FACE_MISSING",
    "SELFIE_MULTIPLE_FACES", "SELFIE_TOO_DARK", "SELFIE_TOO_BLURRY", "SELFIE_QUALITY_LOW"
]);

function decideVerification(evidence) {
    if (evidence?.infrastructureError) {
        throw new Error("Infrastructure errors must remain retryable workflow failures.");
    }
    const reasons = new Set([
        ...(evidence?.documentQuality?.reasonCodes || []),
        ...(evidence?.selfieQuality?.reasonCodes || []),
        ...(evidence?.document?.reasonCodes || [])
    ]);
    const documentFaces = evidence?.document?.face?.count;
    const selfieFaces = evidence?.selfie?.face?.count;
    if (documentFaces === 0 || documentFaces === undefined || documentFaces === null) reasons.add("DOCUMENT_FACE_MISSING");
    if (documentFaces > 1) reasons.add("DOCUMENT_MULTIPLE_FACES");
    if (selfieFaces === 0 || selfieFaces === undefined || selfieFaces === null) reasons.add("SELFIE_FACE_MISSING");
    if (selfieFaces > 1) reasons.add("SELFIE_MULTIPLE_FACES");
    const fields = Object.values(evidence?.document?.fields || {});
    if (fields.length === 0) reasons.add("REQUIRED_FIELD_MISSING");
    for (const field of fields) {
        if (field.confidence === null || field.confidence < 0.75) reasons.add("FIELD_LOW_CONFIDENCE");
    }
    if (evidence?.document?.typeMatches === false && evidence.document.typeConfidence >= 0.75) {
        reasons.add("DOCUMENT_TYPE_MISMATCH");
    } else if (evidence?.document?.typeMatches !== true) {
        reasons.add("DOCUMENT_TYPE_UNCERTAIN");
    }
    if (evidence?.faceComparison?.matched === false) reasons.add("FACE_SIMILARITY_UNCERTAIN");

    const reasonCodes = [...reasons];
    if (reasonCodes.some((reason) => DETERMINISTIC_REJECTIONS.has(reason))) {
        return { decision: "rejected", reasonCodes };
    }
    // Product policy: similarity alone never auto-rejects, even after upload exhaustion.
    const nonSimilarityReuploadFailure = reasonCodes.some((reason) => REUPLOADABLE_FAILURES.has(reason));
    if (evidence?.reuploadExhausted && nonSimilarityReuploadFailure) {
        reasons.add("REUPLOAD_LIMIT_REACHED");
        return { decision: "rejected", reasonCodes: [...reasons] };
    }
    if (reasonCodes.length > 0 || evidence?.documentQuality?.status !== "usable" ||
        evidence?.selfieQuality?.status !== "usable" || evidence?.faceComparison?.matched !== true) {
        return { decision: "manual_review", reasonCodes };
    }
    return { decision: "approved", reasonCodes: [] };
}

module.exports = { decideVerification, DETERMINISTIC_REJECTIONS, REUPLOADABLE_FAILURES };
