const { decideVerification } = require("../../domain/verification-decision-policy");
const { serializeVerificationResult } = require("./verification-result.service");
const { extractDocumentEvidence } = require("../../domain/document-evidence");
const { createOcrAdapter } = require("./ocr/ocr-adapter");
const { createMlVerificationClient } = require("./ml-verification.client");

const DEFAULT_THRESHOLDS = Object.freeze({
    documentQualityMin: 0.7,
    selfieQualityMin: 0.7,
    fieldConfidenceMin: 0.75
});

function normalizeCosine(value) {
    if (value === null || value === undefined) return null;
    if (!Number.isFinite(value) || value < -1 || value > 1) throw new Error("Face similarity is invalid.");
    return Number(((value + 1) / 2).toFixed(6));
}

function sanitizedFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).map(([name, item]) => {
        const base = { confidence: item.confidence, source: item.source || "ocr", formatValid: item.formatValid !== false };
        if (name === "panNumber" || name === "aadhaarNumber") return [name, { ...base, value: item.value }];
        const display = String(item.value || "").replace(/[A-Za-z0-9](?=[A-Za-z0-9])/g, "*");
        return [name, { ...base, valueMasked: display || "Unavailable", valueHash: null }];
    }));
}

function buildPipelineOutcome(input) {
    const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) };
    const decision = decideVerification({
        documentQuality: input.documentQuality,
        selfieQuality: input.selfieQuality,
        document: {
            ...input.documentEvidence,
            face: input.faceEvidence.documentFace
        },
        selfie: { face: input.faceEvidence.selfieFace },
        faceComparison: input.faceEvidence.faceComparison,
        reuploadExhausted: input.reuploadExhausted === true
    });
    const rawResult = {
        schemaVersion: "1.0",
        pipelineVersion: "document-face-v1",
        componentVersions: {
            ocr: input.ocrVersion,
            documentQuality: input.documentQuality.qualityVersion,
            selfieQuality: input.selfieQuality.qualityVersion,
            faceMatcher: `${input.faceEvidence.model.name}:${input.faceEvidence.model.version}`,
            decisionPolicy: "decision-policy-v1"
        },
        verificationRequest: String(input.requestId),
        execution: String(input.executionId),
        attempt: input.attempt,
        document: {
            documentId: String(input.documentId),
            declaredType: input.declaredType,
            detectedType: input.documentEvidence.detectedType,
            typeConfidence: input.documentEvidence.typeConfidence,
            typeMatches: input.documentEvidence.typeMatches,
            quality: { score: input.documentQuality.score, checks: input.documentQuality.checks },
            fields: sanitizedFields(input.documentEvidence.fields),
            face: {
                detected: input.faceEvidence.documentFace.count > 0,
                count: input.faceEvidence.documentFace.count,
                confidence: input.faceEvidence.documentFace.confidence ?? null
            }
        },
        selfie: {
            quality: { score: input.selfieQuality.score, checks: input.selfieQuality.checks },
            face: {
                detected: input.faceEvidence.selfieFace.count > 0,
                count: input.faceEvidence.selfieFace.count,
                confidence: input.faceEvidence.selfieFace.confidence ?? null
            }
        },
        faceComparison: {
            similarity: normalizeCosine(input.faceEvidence.faceComparison.similarity),
            threshold: normalizeCosine(input.faceEvidence.faceComparison.threshold),
            matched: input.faceEvidence.faceComparison.matched,
            model: input.faceEvidence.model.name,
            modelVersion: input.faceEvidence.model.version
        },
        thresholds,
        automaticDecision: decision.decision,
        finalDecision: decision.decision,
        reasonCodes: decision.reasonCodes,
        createdAt: (input.now || new Date()).toISOString()
    };
    const verificationResult = serializeVerificationResult(rawResult, { digestKey: input.digestKey });
    return {
        status: decision.decision === "approved" ? "completed" : "waiting_for_review",
        metadata: { verificationType: "document_face", automaticDecision: decision.decision,
            reasonCodes: decision.reasonCodes },
        verificationResult,
        message: decision.decision === "approved"
            ? "Verification evidence passed the automatic policy."
            : "Verification evidence requires verifier review."
    };
}

async function runVerificationPipeline(input, dependencies = {}) {
    const ml = dependencies.mlClient || createMlVerificationClient(dependencies.mlOptions);
    const analyzeDocumentQuality = dependencies.analyzeDocumentQuality || ml.analyzeDocumentQuality;
    const analyzeSelfieQuality = dependencies.analyzeSelfieQuality || ml.analyzeSelfieQuality;
    const compareFaces = dependencies.compareFaces || ml.compareFaces;
    const recognize = dependencies.recognize || createOcrAdapter(dependencies.ocrOptions).recognize;
    const extractEvidence = dependencies.extractEvidence || extractDocumentEvidence;
    const [documentQuality, selfieQuality, faceEvidence, ocr] = await Promise.all([
        analyzeDocumentQuality(input.documentFile),
        analyzeSelfieQuality(input.selfieFile),
        compareFaces(input.documentFile, input.selfieFile),
        recognize(input.documentFile.path)
    ]);
    const documentEvidence = extractEvidence(input.declaredType, ocr);
    return buildPipelineOutcome({
        ...input,
        documentQuality,
        selfieQuality,
        faceEvidence,
        documentEvidence,
        ocrVersion: input.ocrVersion || `${ocr.provider || "ocr"}:${ocr.providerVersion || "unknown"}`
    });
}

module.exports = { DEFAULT_THRESHOLDS, normalizeCosine, buildPipelineOutcome, runVerificationPipeline };
