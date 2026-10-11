const mongoose = require("mongoose");

const verificationDecisionSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    result: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationResult", required: true, unique: true, immutable: true },
    verificationRequest: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationRequest", required: true, immutable: true },
    execution: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationStepExecution", required: true, immutable: true },
    previousDecision: { type: String, enum: ["approved", "manual_review", "rejected"], required: true, immutable: true },
    decision: { type: String, enum: ["approved", "rejected"], required: true, immutable: true },
    reason: { type: String, required: true, minlength: 10, maxlength: 500, immutable: true },
    reasonCode: { type: String, default: null, immutable: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true }
}, { timestamps: true });

verificationDecisionSchema.index({ organization: 1, createdAt: -1 });
verificationDecisionSchema.index({ result: 1, idempotencyKey: 1 }, { unique: true });
verificationDecisionSchema.pre([
    "updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"
], function rejectDecisionMutation() {
    throw new Error("Verification decisions are immutable.");
});

module.exports = mongoose.model("VerificationDecision", verificationDecisionSchema);
