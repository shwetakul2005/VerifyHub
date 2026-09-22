const mongoose = require("mongoose");

const verificationRequestSchema = new mongoose.Schema({
    organization:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    workflowTemplate:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowTemplate",
        required: true
    },
    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status:{
        type:String,
        enum:["pending", "in_progress", "completed", "rejected", "cancelled"],
        default: "pending"
    },
    workflowVersion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowTemplate",
        default: null
    },
    workflowSnapshot: {
        version: Number,
        name: String,
        description: String,
        assignedVerifier: mongoose.Schema.Types.ObjectId,
        steps: [{
            workflowStep: { type: mongoose.Schema.Types.ObjectId, ref: "WorkflowStep" },
            stepOrder: Number,
            stepType: String,
            title: String,
            description: String,
            isRequired: Boolean,
            maxRetries: Number,
            config: mongoose.Schema.Types.Mixed
        }]
    },
    currentExecution: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VerificationStepExecution",
        default: null
    },
    stateVersion: { type: Number, default: 0 },
    schemaVersion: { type: Number, default: 1 },
    lastTransitionAt: { type: Date, default: null },
    currentStep:{
        type:mongoose.Schema.Types.ObjectId,
        ref: "WorkflowStep"
    },
    startedAt:{
        type: Date,
        default: null
    },
    completedAt:{
        type: Date,
        default: null
    },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectionReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancellationReason: { type: String, default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    archiveReason: { type: String, default: null }

},
{
    timestamps:true
})

const VerificationRequestModel = mongoose.model("VerificationRequest", verificationRequestSchema);
module.exports = VerificationRequestModel;
