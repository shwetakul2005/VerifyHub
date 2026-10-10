const mongoose = require("mongoose");

const verificationDocumentSchema = new mongoose.Schema({
    verificationRequest:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "VerificationRequest",
        required: true
    },
    workflowStep:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowStep",
        required: true
    },
    execution: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationStepExecution", default: null },
    evidenceRole: { type: String, enum: ["document", "selfie"], default: "document" },
    uploadAttempt: { type: Number, min: 1, default: 1 },
    supersedes: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationDocument", default: null },
    supersededAt: { type: Date, default: null },
    idempotencyKey: { type: String, default: null },
    contentDigest: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    processingStatus: {
        type: String,
        enum: ["uploaded", "processing", "processed", "failed", "superseded"],
        default: "uploaded"
    },
    title:{
        type: String,
        required:[true,"Title is required to "],
        trim: true
    },
    documentType: {
        type: String,
        enum: [
            "Aadhaar",
            "PAN",
            "Passport",
            "Driving License",
            "Degree Certificate",
            "Marksheet",
            "Other"
        ],
        required: true
    },
    fileName:{
        type: String,
        required: true
    },
    filePath:{
        type: String,
        required: true
    },
    // Media Types: standardized label sent over the internet to identify the format of a file or data
    mimeType:{
        type: String,
        required: true
    },
    fileSize:{
        type: Number,
        required: true
    },
    reviewStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    reviewedAt: {
        type: Date,
        default: null
    },

    rejectionReason: {
        type: String,
        default: null
    },
    metadata:{
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletionReason: { type: String, default: null },
    storageProvider: {
        type: String,
        enum: ["local", "s3"],
        default: "local"
    }

},{
    timestamps: true
} )

verificationDocumentSchema.index(
    { execution: 1, evidenceRole: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { execution: { $type: "objectId" }, idempotencyKey: { $type: "string" } },
        name: "uniq_execution_evidence_submission" }
);
verificationDocumentSchema.index(
    { execution: 1, evidenceRole: 1, isActive: 1 },
    { unique: true, partialFilterExpression: { execution: { $type: "objectId" }, isActive: true },
        name: "uniq_active_execution_evidence" }
);

const VerificationDocumentModel = mongoose.model("VerificationDocument", verificationDocumentSchema);
module.exports = VerificationDocumentModel;
