const mongoose = require("mongoose");
const VerificationStepExecutionSchema = new mongoose.Schema({
    verificationRequest:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "VerificationRequest"
    },
    workflowStep:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowStep"
    },
    status:{
        type:String,
        // Legacy in_progress remains valid until the data migration maps it.
        enum: ["pending", "in_progress", "waiting_for_input", "processing", "waiting_for_review", "completed", "failed", "skipped", "cancelled"],
        default: "pending"
    },
    stepOrder: Number,
    stepSnapshot: {
        stepType: String,
        title: String,
        description: String,
        isRequired: Boolean,
        maxRetries: Number,
        config: mongoose.Schema.Types.Mixed
    },
    stateVersion: { type: Number, default: 0 },
    schemaVersion: { type: Number, default: 1 },
    attempt: { type: Number, default: 0 },
    maxRetries: { type: Number, min: 0, default: 3 },
    attemptHistory: [{
        attempt: Number,
        startedAt: Date,
        finishedAt: Date,
        errorCode: String,
        idempotencyKey: String
    }],
    lastError: {
        code: String,
        message: String,
        retryable: Boolean
    },
    processingToken: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancellationReason: { type: String, default: null },
    skippedAt: { type: Date, default: null },
    skippedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    skipReason: { type: String, default: null },
    metadata:{
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    startedAt:{
        type: Date,
        default: null
    },
    completedAt:{
        type: Date,
        default: null
    }
},{
    timestamps:true
})

const VerificationStepExecutionModel = mongoose.model("VerificationStepExecution", VerificationStepExecutionSchema);
module.exports = VerificationStepExecutionModel;
