const mongoose = require("mongoose");
const { validateVerificationResult } = require("../domain/verification-result");

const verificationResultSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    verificationRequest: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationRequest", required: true, immutable: true },
    execution: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationStepExecution", required: true, immutable: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationDocument", required: true, immutable: true },
    attempt: { type: Number, required: true, min: 1, immutable: true },
    schemaVersion: { type: String, required: true, enum: ["1.0", "legacy-0"], immutable: true },
    pipelineVersion: { type: String, required: true, immutable: true },
    automaticDecision: { type: String, default: null, enum: ["approved", "manual_review", "rejected", null], immutable: true },
    finalDecision: { type: String, default: null, enum: ["approved", "manual_review", "rejected", null], immutable: true },
    reasonCodes: { type: [String], default: [], immutable: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true }
}, { timestamps: true, minimize: false });

verificationResultSchema.index({ execution: 1, attempt: 1 }, { unique: true, name: "uniq_execution_attempt_result" });
verificationResultSchema.index({ organization: 1, createdAt: -1 });
verificationResultSchema.index({ organization: 1, finalDecision: 1, createdAt: -1 });

verificationResultSchema.pre("validate", function validateStoredContract() {
    if (this.schemaVersion !== "1.0") return;
    const parsed = validateVerificationResult(this.result);
    const consistent = String(this.verificationRequest) === parsed.verificationRequest &&
        String(this.execution) === parsed.execution &&
        String(this.document) === parsed.document.documentId &&
        this.attempt === parsed.attempt &&
        this.pipelineVersion === parsed.pipelineVersion &&
        this.automaticDecision === parsed.automaticDecision &&
        this.finalDecision === parsed.finalDecision;
    if (!consistent) throw new Error("Verification result envelope does not match its payload.");
});

verificationResultSchema.pre([
    "updateOne", "updateMany", "findOneAndUpdate", "replaceOne",
    "deleteOne", "deleteMany", "findOneAndDelete"
], function rejectResultMutation() {
    throw new Error("Verification results are immutable.");
});

module.exports = mongoose.model("VerificationResult", verificationResultSchema);
