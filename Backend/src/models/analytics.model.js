const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema({
    workflowTemplate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowTemplate",
        required: true
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    period: {
        type: Date,
        required: true  // Day/hour start for aggregation
    },
    totalRequests: {
        type: Number,
        default: 0
    },
    completedRequests: {
        type: Number,
        default: 0
    },
    rejectedRequests: {
        type: Number,
        default: 0
    },
    completionRate: {
        type: Number,
        default: 0  // Percentage 0-100
    },
    avgTimeToComplete: {
        type: Number,
        default: 0  // In seconds
    },
    stepMetrics: [{
        step: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WorkflowStep"
        },
        stepType: String,
        stepOrder: Number,
        completions: {
            type: Number,
            default: 0
        },
        failures: {
            type: Number,
            default: 0
        },
        avgTime: {
            type: Number,
            default: 0  // In seconds
        },
        successRate: {
            type: Number,
            default: 0  // Percentage 0-100
        }
    }],
    rejectionReasons: [{
        reason: String,
        count: {
            type: Number,
            default: 0
        }
    }]
}, {
    timestamps: true
});

// Index for efficient querying
analyticsSchema.index({ workflowTemplate: 1, period: -1 });
analyticsSchema.index({ organization: 1, period: -1 });

const Analytics = mongoose.model("Analytics", analyticsSchema);

module.exports = Analytics;
