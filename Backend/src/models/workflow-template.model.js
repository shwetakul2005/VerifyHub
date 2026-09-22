const mongoose = require("mongoose");

const workflowTemplateSchema = new mongoose.Schema({
    organization:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    name:{
        type: String,
        required: true
    },
    description:{
        type: String,
        trim: true
    },
    status:{
        type: String,
        enum: ["draft", "published", "archived"],
        default: "draft"
    },
    version:{
        type: Number,
        required: true,
        default: 1
    },
    familyId: mongoose.Schema.Types.ObjectId,
    previousVersion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowTemplate",
        default: null
    },
    schemaVersion: { type: Number, default: 1 },
    createdBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    assignedVerifier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    publishedAt: {
        type: Date,
        default: null
    },
    publishedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    archivedAt: {
        type: Date,
        default: null
    },
    archivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    archiveReason: { type: String, default: null }
},{
    timestamps:true
})

const WorkflowTemplate = mongoose.model("WorkflowTemplate", workflowTemplateSchema);
module.exports = WorkflowTemplate;
