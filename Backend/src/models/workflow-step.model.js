const mongoose = require("mongoose");

const workflowStepSchema = new mongoose.Schema({
    workflowTemplate:{
        type:mongoose.Schema.Types.ObjectId,
        ref: "WorkflowTemplate",
        required: true
    },
    stepOrder:{
        type: Number,
        required: true,
    },
    stepType:{
        type:String,
        required: true,
        enum: ["email", "phone", "document", "police", "medical"]
    },
    title:{
        type: String,
        required: true,
        trim: true
    },
    description:{
        type: String,
        required: false,
    },
    isRequired:{
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    },
    config: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
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
        ]
    }
    }

},
{
    timestamps: true,
}
);

const WorkflowStepModel = mongoose.model("WorkflowStep", workflowStepSchema);

module.exports = WorkflowStepModel;