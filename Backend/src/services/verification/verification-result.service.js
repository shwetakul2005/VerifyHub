const crypto = require("node:crypto");
const mongoose = require("mongoose");
const VerificationResult = require("../../models/verification-result.model");
const VerificationStepExecution = require("../../models/verification-step-execution.model");
const { validateVerificationResult } = require("../../domain/verification-result");

function maskIdentifier(fieldName, value) {
    const normalized = String(value || "").replace(/[ -]/g, "").toUpperCase();
    if (fieldName === "panNumber" && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized)) {
        return `${normalized.slice(0, 5)}****${normalized.slice(-1)}`;
    }
    if (fieldName === "aadhaarNumber" && /^[0-9]{12}$/.test(normalized)) {
        return `********${normalized.slice(-4)}`;
    }
    throw new Error(`Cannot safely mask ${fieldName}.`);
}

function serializeVerificationResult(input, options = {}) {
    const result = JSON.parse(JSON.stringify(input));
    for (const fieldName of ["panNumber", "aadhaarNumber"]) {
        const field = result.document?.fields?.[fieldName];
        if (!field?.value) continue;
        if (!options.digestKey) throw new Error("A verification result digest key is required.");
        const normalized = String(field.value).replace(/[ -]/g, "").toUpperCase();
        field.valueMasked = maskIdentifier(fieldName, normalized);
        field.valueHash = crypto.createHmac("sha256", options.digestKey).update(normalized).digest("hex");
        delete field.value;
    }
    return validateVerificationResult(result);
}

async function persistInSession({ organization, result, session, digestKey }) {
    const sanitized = serializeVerificationResult(result, { digestKey });
    const [stored] = await VerificationResult.create([{
        organization,
        verificationRequest: sanitized.verificationRequest,
        execution: sanitized.execution,
        document: sanitized.document.documentId,
        attempt: sanitized.attempt,
        schemaVersion: sanitized.schemaVersion,
        pipelineVersion: sanitized.pipelineVersion,
        automaticDecision: sanitized.automaticDecision,
        finalDecision: sanitized.finalDecision,
        reasonCodes: sanitized.reasonCodes,
        result: sanitized
    }], { session });
    const linked = await VerificationStepExecution.updateOne({
        _id: sanitized.execution,
        verificationRequest: sanitized.verificationRequest,
        attempt: sanitized.attempt,
        $or: [{ currentResult: null }, { currentResult: { $exists: false } }]
    }, { $set: { currentResult: stored._id } }, { session });
    if (linked.modifiedCount !== 1) {
        throw new Error("The execution attempt no longer matches the verification result.");
    }
    return stored;
}

async function persistVerificationResult(input) {
    if (input.session) return persistInSession(input);
    const session = await mongoose.startSession();
    let stored;
    try {
        await session.withTransaction(async () => {
            stored = await persistInSession({ ...input, session });
        });
        return stored;
    } finally {
        await session.endSession();
    }
}

module.exports = { maskIdentifier, serializeVerificationResult, persistVerificationResult, persistInSession };
