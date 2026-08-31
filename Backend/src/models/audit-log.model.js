const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            "workflow_created",
            "workflow_updated",
            "workflow_published",
            "workflow_archived",
            "workflow_deleted",
            "workflow_cloned",
            "step_added",
            "step_updated",
            "step_removed",
            "step_reordered",
            "member_added",
            "member_removed",
            "member_role_changed",
            "org_settings_updated"
        ]
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    target: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "targetModel"
    },
    targetModel: {
        type: String,
        enum: ["WorkflowTemplate", "WorkflowStep", "Organization", "User"]
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true
});

// Index for efficient querying
auditLogSchema.index({ organization: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
