const { z } = require("zod");

const DECISIONS = Object.freeze(["approved", "manual_review", "rejected"]);
const REASON_CODES = Object.freeze([
    "DOCUMENT_UNSUPPORTED_FORMAT", "DOCUMENT_CORRUPT", "DOCUMENT_TOO_SMALL",
    "DOCUMENT_TOO_BLURRY", "DOCUMENT_TOO_DARK", "DOCUMENT_TOO_BRIGHT",
    "DOCUMENT_LOW_CONTRAST", "DOCUMENT_GLARE", "DOCUMENT_TYPE_UNCERTAIN",
    "DOCUMENT_TYPE_MISMATCH", "REQUIRED_FIELD_MISSING", "FIELD_LOW_CONFIDENCE",
    "AADHAAR_FORMAT_INVALID", "PAN_FORMAT_INVALID", "DOCUMENT_FACE_MISSING",
    "DOCUMENT_MULTIPLE_FACES", "SELFIE_FACE_MISSING", "SELFIE_MULTIPLE_FACES",
    "SELFIE_TOO_DARK", "SELFIE_TOO_BLURRY", "SELFIE_QUALITY_LOW",
    "FACE_SIMILARITY_UNCERTAIN", "FACE_MISMATCH", "EVIDENCE_CONFLICT",
    "REUPLOAD_LIMIT_REACHED"
]);

const score = z.number().finite().min(0).max(1);
const nonempty = z.string().trim().min(1);
const qualityCheck = z.strictObject({
    code: nonempty,
    passed: z.boolean(),
    score
});
const quality = z.strictObject({
    score,
    checks: z.array(qualityCheck)
});
const face = z.strictObject({
    detected: z.boolean(),
    count: z.number().int().nonnegative(),
    confidence: score.nullable()
});
const field = z.strictObject({
    valueMasked: nonempty,
    valueHash: nonempty.nullable(),
    confidence: score,
    source: z.enum(["ocr", "derived"]),
    formatValid: z.boolean()
});

const verificationResultSchema = z.strictObject({
    schemaVersion: z.literal("1.0"),
    pipelineVersion: z.literal("document-face-v1"),
    componentVersions: z.strictObject({
        ocr: nonempty,
        documentQuality: nonempty,
        selfieQuality: nonempty,
        faceMatcher: nonempty,
        decisionPolicy: nonempty
    }),
    verificationRequest: nonempty,
    execution: nonempty,
    attempt: z.number().int().positive(),
    document: z.strictObject({
        documentId: nonempty,
        declaredType: z.enum(["PAN", "AADHAAR"]),
        detectedType: z.enum(["PAN", "AADHAAR"]).nullable(),
        typeConfidence: score,
        typeMatches: z.boolean(),
        quality,
        fields: z.record(nonempty, field),
        face
    }),
    selfie: z.strictObject({ quality, face }),
    faceComparison: z.strictObject({
        similarity: score.nullable(),
        threshold: score,
        matched: z.boolean(),
        model: nonempty,
        modelVersion: nonempty
    }),
    thresholds: z.strictObject({
        documentQualityMin: score,
        selfieQualityMin: score,
        fieldConfidenceMin: score
    }),
    automaticDecision: z.enum(DECISIONS),
    finalDecision: z.enum(DECISIONS),
    reasonCodes: z.array(z.enum(REASON_CODES)),
    createdAt: z.iso.datetime({ offset: true })
}).superRefine((result, context) => {
    for (const identifier of ["panNumber", "aadhaarNumber"]) {
        const masked = result.document.fields[identifier]?.valueMasked;
        const validMask = identifier === "panNumber"
            ? /^[A-Z]{5}\*{4}[A-Z]$/.test(masked || "")
            : /^\*{8}[0-9]{4}$/.test(masked || "");
        if (masked && !validMask) {
            context.addIssue({ code: "custom", path: ["document", "fields", identifier, "valueMasked"], message: "Identity numbers must be masked." });
        }
    }
    if (result.finalDecision !== result.automaticDecision) {
        context.addIssue({ code: "custom", path: ["finalDecision"], message: "Automatic results cannot contain a human override." });
    }
});

function validateVerificationResult(value) {
    return verificationResultSchema.parse(value);
}

module.exports = { DECISIONS, REASON_CODES, verificationResultSchema, validateVerificationResult };
