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
    storageProvider: {
        type: String,
        enum: ["local", "s3"],
        default: "local"
    }

},{
    timestamps: true
} )

const VerificationDocumentModel = mongoose.model("VerificationDocument", verificationDocumentSchema);
module.exports = VerificationDocumentModel;