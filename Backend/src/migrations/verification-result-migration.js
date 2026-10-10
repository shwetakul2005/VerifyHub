const mongoose = require("mongoose");
const VerificationDocument = require("../models/verification-document.model");
const VerificationRequest = require("../models/verification-request.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const VerificationResult = require("../models/verification-result.model");

async function planVerificationResultMigration() {
    const documents = await VerificationDocument.find({ "metadata.ocr": { $exists: true } }).lean();
    const candidates = [];
    const violations = [];
    for (const document of documents) {
        if (await VerificationResult.exists({ document: document._id })) continue;
        const request = await VerificationRequest.findById(document.verificationRequest).lean();
        if (!request) {
            violations.push({ code: "MISSING_DOCUMENT_REQUEST", document: String(document._id) });
            continue;
        }
        const executions = await VerificationStepExecution.find({
            verificationRequest: document.verificationRequest,
            workflowStep: document.workflowStep
        }).select("_id attempt").lean();
        if (executions.length !== 1) {
            violations.push({
                code: executions.length === 0 ? "MISSING_DOCUMENT_EXECUTION" : "AMBIGUOUS_DOCUMENT_EXECUTION",
                document: String(document._id)
            });
            continue;
        }
        candidates.push({
            document: String(document._id), request: String(request._id), organization: String(request.organization),
            execution: String(executions[0]._id), attempt: Math.max(1, executions[0].attempt || 0)
        });
    }
    return { candidates, violations };
}

function legacySummary(document) {
    const ocr = document.metadata?.ocr || {};
    return {
        schemaVersion: "legacy-0",
        documentType: document.documentType,
        reviewStatus: document.reviewStatus,
        ocr: {
            provider: ocr.provider || "unknown",
            providerVersion: ocr.providerVersion || null,
            confidence: typeof ocr.confidence === "number" ? ocr.confidence : null,
            uncertain: ocr.uncertain !== false
        },
        limitations: ["UNVERSIONED_LEGACY_EVIDENCE", "NO_AUTOMATIC_DECISION"]
    };
}

async function applyVerificationResultMigration({ dryRun = true } = {}) {
    const plan = await planVerificationResultMigration();
    if (dryRun) return plan;
    if (plan.violations.length) throw new Error("Verification result migration preflight failed.");
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            for (const candidate of plan.candidates) {
                if (await VerificationResult.exists({ document: candidate.document }).session(session)) continue;
                const document = await VerificationDocument.findById(candidate.document).session(session).lean();
                const [result] = await VerificationResult.create([{
                    organization: candidate.organization,
                    verificationRequest: candidate.request,
                    execution: candidate.execution,
                    document: candidate.document,
                    attempt: candidate.attempt,
                    schemaVersion: "legacy-0",
                    pipelineVersion: "legacy-unversioned",
                    automaticDecision: null,
                    finalDecision: null,
                    reasonCodes: [],
                    result: legacySummary(document)
                }], { session });
                await VerificationStepExecution.updateOne(
                    { _id: candidate.execution, $or: [{ currentResult: null }, { currentResult: { $exists: false } }] },
                    { $set: { currentResult: result._id } }, { session }
                );
            }
        });
        return plan;
    } finally {
        await session.endSession();
    }
}

module.exports = { planVerificationResultMigration, applyVerificationResultMigration, legacySummary };
